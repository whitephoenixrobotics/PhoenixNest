"""Central registry for the per-node state of stateful blocks.

Stateful blocks (counter, toggle, delay, hold, trigger_once, http_fetch) keep
module-level dicts keyed by node id. Unmanaged, that state used to leak:
it survived across separate Runs, bled between live sessions, and outlived
deleted nodes. Modules register their dicts here; the executor and the live /
preview websockets reset or prune them at session boundaries:

- discrete Run            → fresh state for the nodes in that flow
- new live/auto session   → fresh state for the nodes in the definition
- definition update       → drop state of nodes that were removed
"""
import threading

_lock = threading.Lock()
_stores: list[dict] = []


def register(store: dict) -> dict:
    """Register a per-node state dict so it participates in resets."""
    with _lock:
        _stores.append(store)
    return store


def reset_nodes(node_ids) -> None:
    """Forget state for the given node ids (a new run/session starts fresh)."""
    with _lock:
        for store in _stores:
            for nid in node_ids:
                store.pop(nid, None)


def prune_removed(prev_ids: set[str], new_ids: set[str]) -> None:
    """Drop state for nodes that existed before but were removed from the flow."""
    removed = prev_ids - new_ids
    if removed:
        reset_nodes(removed)
