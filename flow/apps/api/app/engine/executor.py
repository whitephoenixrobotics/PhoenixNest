import asyncio
import uuid
from datetime import datetime
from app.engine.context import ExecutionContext
from app.engine.nodes import NODE_REGISTRY
from app.database import AsyncSessionLocal
from app.models.flow import FlowExecution, NodeExecution, ExecutionStatus, NodeExecutionStatus

# Strong references to fire-and-forget tasks. asyncio keeps only weak refs to
# tasks, so an untracked create_task() result can be garbage-collected mid-run
# (execution silently dies). Tasks remove themselves when done.
_background_tasks: set[asyncio.Task] = set()


def spawn_background(coro) -> asyncio.Task:
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
    return task


class FlowExecutor:
    @staticmethod
    async def run(execution_id: str, flow_definition: dict):
        """Main entry point — runs in a background asyncio task."""
        async with AsyncSessionLocal() as db:
            try:
                await FlowExecutor._execute(execution_id, flow_definition, db)
            except Exception as e:
                # Mark execution as failed
                from sqlalchemy import select
                result = await db.execute(select(FlowExecution).where(FlowExecution.id == execution_id))
                execution = result.scalar_one_or_none()
                if execution:
                    execution.status = ExecutionStatus.FAILED
                    execution.error = str(e)
                    execution.finished_at = datetime.utcnow()
                    await db.commit()
                # Notify WS
                queue = ExecutionContext.get_global_queue(execution_id)
                await queue.put({"type": "execution_finished", "status": "failed", "error": str(e)})
            finally:
                # Don't remove the queue immediately — a WebSocket may connect
                # slightly after a fast execution finishes. Keep buffered messages
                # for a grace period so late consumers still receive them.
                spawn_background(FlowExecutor._delayed_cleanup(execution_id))

    @staticmethod
    async def _delayed_cleanup(execution_id: str, delay: float = 30.0):
        await asyncio.sleep(delay)
        ExecutionContext.remove_global_queue(execution_id)

    @staticmethod
    async def run_preview(flow_definition: dict) -> dict:
        """
        Lightweight in-memory run with NO database writes and NO WebSocket.
        Returns a {node_id: output} map. Used for continuous Auto-Run preview
        so dragging a slider re-runs the pipeline cheaply.
        """
        nodes = flow_definition.get("nodes", [])
        edges = flow_definition.get("edges", [])
        outputs: dict = {}
        labels = {n["id"]: (n.get("data", {}).get("label") or n.get("type", "")) for n in nodes}

        layers = FlowExecutor._topological_layers(nodes, edges)

        # Temporary context for skip detection in preview
        class _PreviewCtx:
            def get_output(self, nid: str) -> dict:
                return outputs.get(nid, {})

        _ctx = _PreviewCtx()

        for layer in layers:
            async def run_one(node):
                nid = node["id"]
                ntype = node["type"]
                config = node.get("data", {}).get("config", {})

                # Respect if/else branch routing in preview too
                if FlowExecutor._is_skipped(nid, edges, _ctx):  # type: ignore[arg-type]
                    return nid, {"skipped": True}

                handler = NODE_REGISTRY.get(ntype)
                if not handler:
                    return nid, None
                # Keep every incoming edge — multiple edges may target the same
                # handle (JSON Extract + Interval → a Data Table); a plain dict
                # assignment would let the last one overwrite the others.
                inputs = {}
                for e in edges:
                    if e["target"] != nid:
                        continue
                    src = outputs.get(e["source"], {})
                    # Skip edges from an inactive If/Else branch (mirror of
                    # resolve_inputs) so one Display ← IF + ELSE shows a single
                    # result, not one per branch.
                    if isinstance(src, dict):
                        active = src.get("active_branch")
                        if active is not None and e.get("sourceHandle") != active:
                            continue
                    handle = e.get("targetHandle") or "input"
                    key = handle
                    n = 1
                    while key in inputs:
                        n += 1
                        key = f"{handle}#{n}"
                    # Tag each input with its source block label so templating
                    # blocks (Join Text) can disambiguate {Block.field}.
                    inputs[key] = {**src, "_block": labels.get(e["source"], "")} if isinstance(src, dict) else src
                try:
                    out = await handler.execute({**config, "_node_id": nid}, inputs)
                except Exception as ex:  # noqa: BLE001
                    out = {"error": str(ex)}
                return nid, out

            results = await asyncio.gather(*[run_one(n) for n in layer])
            for nid, out in results:
                if out is not None:
                    outputs[nid] = out

        return outputs

    @staticmethod
    async def _execute(execution_id: str, flow_definition: dict, db):
        from sqlalchemy import select
        from app.engine.nodes.state_registry import reset_nodes

        nodes = flow_definition.get("nodes", [])
        edges = flow_definition.get("edges", [])

        # Each discrete Run starts with fresh stateful-block state (counter,
        # toggle, delay, ...) — pressing Run twice gives the same result.
        # Live/Auto sessions keep state across frames (reset at session start).
        reset_nodes([n["id"] for n in nodes])

        # Update execution status to running
        result = await db.execute(select(FlowExecution).where(FlowExecution.id == execution_id))
        execution = result.scalar_one_or_none()
        if not execution:
            return
        execution.status = ExecutionStatus.RUNNING
        await db.commit()

        # Build adjacency
        ctx = ExecutionContext(execution_id, execution.input_data)
        ctx.node_labels = {n["id"]: (n.get("data", {}).get("label") or n.get("type", "")) for n in nodes}
        queue = ExecutionContext.get_global_queue(execution_id)

        # Topological sort — find layers
        layers = FlowExecutor._topological_layers(nodes, edges)

        for layer in layers:
            # Run all nodes in this layer concurrently
            tasks = [
                FlowExecutor._run_node(node, edges, ctx, db, execution_id)
                for node in layer
            ]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            # Check if any critical node failed
            for result in results:
                if isinstance(result, Exception):
                    raise result

        # Mark execution as done
        execution.status = ExecutionStatus.SUCCESS
        execution.finished_at = datetime.utcnow()
        await db.commit()

        await queue.put({"type": "execution_finished", "status": "success"})

    @staticmethod
    def _is_skipped(node_id: str, edges: list, ctx: ExecutionContext) -> bool:
        """
        A node is skipped if ALL its incoming edges come from if_else nodes
        on the INACTIVE branch. A single active-branch or non-conditional edge
        is enough to keep the node running.
        """
        incoming = [e for e in edges if e["target"] == node_id]
        if not incoming:
            return False

        for edge in incoming:
            src_output = ctx.get_output(edge["source"])
            active_branch = src_output.get("active_branch")
            if active_branch is None:
                return False  # non-conditional source → always active
            if edge.get("sourceHandle") == active_branch:
                return False  # connected to the active handle

        return True  # every incoming edge is on an inactive branch

    @staticmethod
    async def _run_node(node: dict, edges: list, ctx: ExecutionContext, db, execution_id: str):
        node_id = node["id"]
        node_type = node["type"]
        config = node.get("data", {}).get("config", {})
        queue = ExecutionContext.get_global_queue(execution_id)

        # Skip nodes on inactive if/else branches
        if FlowExecutor._is_skipped(node_id, edges, ctx):
            node_exec = NodeExecution(
                id=str(uuid.uuid4()),
                execution_id=execution_id,
                node_id=node_id,
                node_type=node_type,
                status=NodeExecutionStatus.SKIPPED,
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow(),
            )
            db.add(node_exec)
            await db.commit()
            await queue.put({
                "type": "node_update",
                "node_id": node_id,
                "node_type": node_type,
                "status": "skipped",
            })
            return

        # Create NodeExecution record
        node_exec = NodeExecution(
            id=str(uuid.uuid4()),
            execution_id=execution_id,
            node_id=node_id,
            node_type=node_type,
            status=NodeExecutionStatus.RUNNING,
            started_at=datetime.utcnow(),
        )
        db.add(node_exec)
        await db.commit()

        # Notify running
        await queue.put({
            "type": "node_update",
            "node_id": node_id,
            "node_type": node_type,
            "status": "running",
        })

        start_ms = datetime.utcnow().timestamp() * 1000

        try:
            handler = NODE_REGISTRY.get(node_type)
            if not handler:
                raise ValueError(f"Unknown node type: {node_type}")

            inputs = ctx.resolve_inputs(node_id, edges)
            # Inject node_id so stateful handlers (e.g. Delay) can key their state
            output = await handler.execute({**config, "_node_id": node_id}, inputs)
            ctx.set_output(node_id, output)

            duration_ms = int(datetime.utcnow().timestamp() * 1000 - start_ms)
            node_exec.status = NodeExecutionStatus.SUCCESS
            node_exec.output = output
            node_exec.finished_at = datetime.utcnow()
            node_exec.duration_ms = duration_ms
            await db.commit()

            await queue.put({
                "type": "node_update",
                "node_id": node_id,
                "node_type": node_type,
                "status": "success",
                "output": output,
                "duration_ms": duration_ms,
            })

        except Exception as e:
            duration_ms = int(datetime.utcnow().timestamp() * 1000 - start_ms)
            node_exec.status = NodeExecutionStatus.FAILED
            node_exec.error = str(e)
            node_exec.finished_at = datetime.utcnow()
            node_exec.duration_ms = duration_ms
            await db.commit()

            await queue.put({
                "type": "node_update",
                "node_id": node_id,
                "node_type": node_type,
                "status": "error",
                "error": str(e),
                "duration_ms": duration_ms,
            })
            raise

    @staticmethod
    def _topological_layers(nodes: list[dict], edges: list[dict]) -> list[list[dict]]:
        """Return nodes grouped into layers (same layer = can run concurrently)."""
        node_map = {n["id"]: n for n in nodes}
        in_degree = {n["id"]: 0 for n in nodes}
        children = {n["id"]: [] for n in nodes}

        for edge in edges:
            src, tgt = edge["source"], edge["target"]
            if tgt in in_degree:
                in_degree[tgt] += 1
            if src in children:
                children[src].append(tgt)

        layers = []
        queue = [nid for nid, deg in in_degree.items() if deg == 0]

        while queue:
            layer = [node_map[nid] for nid in queue if nid in node_map]
            if layer:
                layers.append(layer)
            next_queue = []
            for nid in queue:
                for child in children.get(nid, []):
                    in_degree[child] -= 1
                    if in_degree[child] == 0:
                        next_queue.append(child)
            queue = next_queue

        return layers
