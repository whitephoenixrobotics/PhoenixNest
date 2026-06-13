import asyncio
from typing import Any


class ExecutionContext:
    """Shared state during a flow execution."""

    def __init__(self, execution_id: str, input_data: dict):
        self.execution_id = execution_id
        self.input_data = input_data
        self._outputs: dict[str, dict[str, Any]] = {}
        self.node_labels: dict[str, str] = {}   # node_id → human label

    def set_output(self, node_id: str, output: dict):
        self._outputs[node_id] = output

    def get_output(self, node_id: str) -> dict:
        return self._outputs.get(node_id, {})

    def resolve_inputs(self, node_id: str, edges: list[dict]) -> dict:
        """Collect outputs from ALL source nodes connected to this node.

        Multiple edges may target the same handle (e.g. JSON Extract + Interval
        both into a Data Table's single input). Keep every upstream output under
        a unique key so none overwrites another — handlers iterate inputs.values().
        """
        inputs: dict = {}
        for edge in edges:
            if edge["target"] == node_id:
                handle = edge.get("targetHandle") or "input"
                key = handle
                n = 1
                while key in inputs:
                    n += 1
                    key = f"{handle}#{n}"
                src = self.get_output(edge["source"])
                # Tag with the source block label for {Block.field} templating.
                inputs[key] = ({**src, "_block": self.node_labels.get(edge["source"], "")}
                               if isinstance(src, dict) else src)
        return inputs

    # Global registry of active queues (WS pub/sub per execution)
    _global_queues: dict[str, asyncio.Queue] = {}

    @classmethod
    def get_global_queue(cls, execution_id: str) -> asyncio.Queue:
        # setdefault is atomic — both the executor and the WS handler must
        # always see the same queue instance for an execution.
        return cls._global_queues.setdefault(execution_id, asyncio.Queue())

    @classmethod
    def remove_global_queue(cls, execution_id: str):
        cls._global_queues.pop(execution_id, None)
