"""
JSON Extract — pull a specific value out of a parsed JSON response.

Supports:
  • dot path:      current.temperature_2m
  • array index:   items.0.name   or   items[0].name
  • bracket key:   data["temp"]   or   data['temp']
  • template:      "อุณหภูมิ {current.temperature_2m} องศา"
                   (you can use {value} as a shortcut for the path's value)

It also returns `tree`: a bounded structural snapshot of the incoming JSON
(keys, kinds, sample values) so the UI can let users drill in one level at a
time and click a field instead of typing a path.
"""
import json
import re
from app.engine.nodes.base import BaseNodeHandler

# Bounds on the structure snapshot we expose to the field navigator
_MAX_TREE_NODES = 8000  # total nodes serialized (safety budget for huge APIs)
_MAX_ARRAY = 200        # array elements listed per level
_MAX_DEPTH = 6          # nesting levels walked

# Keys (case-insensitive) used to label an array element by a human name, so the
# navigator shows e.g. "15  สำนักงานเขตบางแค" instead of a meaningless index.
_LABEL_KEYS = (
    'nameth', 'name_th', 'nameen', 'name_en', 'name', 'title', 'label',
    'areath', 'area_th', 'stationname', 'displayname', 'stationid', 'id',
    'code', 'key',
)


def _label(obj) -> str | None:
    """A short human label for an array element (its name/id), or None."""
    if not isinstance(obj, dict):
        return None
    lower = {k.lower(): k for k in obj.keys()}
    for want in _LABEL_KEYS:
        if want in lower:
            v = obj[lower[want]]
            if isinstance(v, (str, int, float)) and not isinstance(v, bool):
                s = _fmt(v).strip()
                if s:
                    return s if len(s) <= 40 else s[:39] + '…'
    # fall back to the first non-empty string field
    for v in obj.values():
        if isinstance(v, str) and v.strip():
            s = v.strip()
            return s if len(s) <= 40 else s[:39] + '…'
    return None


def _normalize_path(path: str) -> str:
    """Accept bracket notation too: a[0].b → a.0.b, a["b"] → a.b."""
    path = re.sub(r'\[\s*"([^"]*)"\s*\]', r'.\1', path)   # ["key"]
    path = re.sub(r"\[\s*'([^']*)'\s*\]", r'.\1', path)   # ['key']
    path = re.sub(r'\[\s*(\d+)\s*\]', r'.\1', path)        # [0]
    return path.strip().strip('.')


def _walk(data, path: str):
    path = _normalize_path(path)
    if not path:
        return data
    cur = data
    for part in path.split('.'):
        if cur is None:
            return None
        if isinstance(cur, list):
            try:
                cur = cur[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


def _preview(value) -> str:
    """Short, one-line sample of a leaf value for the field navigator."""
    s = _fmt(value)
    return s if len(s) <= 40 else s[:39] + '…'


def _child_node(val, depth: int, budget: list) -> dict:
    """Build a tree node for one value (recurses into non-empty containers)."""
    if isinstance(val, (dict, list)) and val and depth < _MAX_DEPTH:
        return _build_tree(val, depth + 1, budget)
    # leaf, empty container, or past the depth limit → show a sample only
    return {'kind': 'leaf', 'preview': _preview(val)}


def _build_tree(data, depth: int = 0, budget: list | None = None) -> dict:
    """Bounded structural snapshot the UI drills into one level at a time.

    Node shape: {kind:'object'|'array', children:[{name, ...node}, ...]} or
    {kind:'leaf', preview}. Arrays cap at _MAX_ARRAY (with a `truncated` count).
    """
    if budget is None:
        budget = [_MAX_TREE_NODES]
    if isinstance(data, dict):
        node: dict = {'kind': 'object', 'children': []}
        for k, v in data.items():
            if budget[0] <= 0:
                break
            budget[0] -= 1
            node['children'].append({'name': str(k), **_child_node(v, depth, budget)})
        return node
    if isinstance(data, list):
        node = {'kind': 'array', 'children': []}
        for i, v in enumerate(data[:_MAX_ARRAY]):
            entry: dict = {'name': str(i)}
            if budget[0] > 0:
                budget[0] -= 1
                entry.update(_child_node(v, depth, budget))
            else:
                # Budget spent — still LIST the element (so all stay searchable
                # and pickable), just without expanding its children.
                if isinstance(v, dict):
                    entry.update({'kind': 'object', 'children': []})
                elif isinstance(v, list):
                    entry.update({'kind': 'array', 'children': []})
                else:
                    entry.update({'kind': 'leaf', 'preview': _preview(v)})
            # Label array-of-object elements by a human name (index alone is useless)
            lbl = _label(v)
            if lbl:
                entry['label'] = lbl
            node['children'].append(entry)
        if len(data) > _MAX_ARRAY:
            node['truncated'] = len(data) - _MAX_ARRAY
        return node
    return {'kind': 'leaf', 'preview': _preview(data)}


def _to_number(value):
    """Coerce ints, floats, and *numeric strings* ('16', '8.3') to float.

    Many public APIs (e.g. air4thai) return numbers as JSON strings. Without
    this the numeric `value` output would be 0, so a downstream If/Else or
    Compare on a threshold (PM > 80) would never fire even though the displayed
    text is correct. Returns None when the value isn't numeric.
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _fmt(value) -> str:
    if value is None:
        return ''
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, float):
        s = f"{value:.4f}".rstrip('0').rstrip('.')
        return s or '0'
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _find_source(inputs: dict):
    """Find parsed JSON data from upstream.

    Prefers a `data` field. If an upstream has `data=None` (e.g. HTTP Fetch
    while idle), skip it — don't fall back to the wrapper dict, otherwise
    Extract would output empty/stale JSON when there's nothing to read.
    """
    for v in inputs.values():
        if isinstance(v, dict) and v.get('data') is not None:
            return v['data']
    # No upstream has a usable data payload → treat as no source
    for v in inputs.values():
        if isinstance(v, dict) and 'data' not in v:
            return v  # likely an unwrapped JSON-like dict (e.g. Text/Number blocks)
    return None


def _upstream_trigger(inputs: dict) -> bool:
    """Detect a True signal from upstream so we can propagate the edge downstream."""
    for v in inputs.values():
        if not isinstance(v, dict):
            continue
        if v.get('result') or v.get('on') or v.get('fetched'):
            return True
        if v.get('count', 0) > 0:
            return True
    return False


class JsonExtractHandler(BaseNodeHandler):
    async def execute(self, config: dict, inputs: dict) -> dict:
        source = _find_source(inputs)

        # Support multiple paths in one block → value1, value2, … (falls back to
        # the legacy single `path` for older flows).
        raw_paths = config.get('paths')
        if isinstance(raw_paths, list):
            paths = [str(p or '').strip() for p in raw_paths]
        else:
            paths = [str(config.get('path', '')).strip()]
        if not paths:
            paths = ['']
        template = str(config.get('template', '')).strip()

        if source is None:
            return {'value': 0.0, 'text': '', 'raw': None, 'values': [],
                    'found': False, 'result': False, 'tree': None}

        # Structural snapshot the UI drills into to pick a path
        tree = _build_tree(source)

        # Resolve each path slot (empty slot → None)
        values = [(_walk(source, p) if p else None) for p in paths]
        primary = values[0] if values else None
        ns = {f'value{i}': v for i, v in enumerate(values, start=1)}

        if template:
            def repl(m):
                expr = m.group(1).strip()
                if expr == 'value':
                    return _fmt(primary)
                if expr in ns:                 # {value1}, {value2}, …
                    return _fmt(ns[expr])
                return _fmt(_walk(source, expr))  # {some.other.path}
            text = re.sub(r'\{([^}]+)\}', repl, template)
        else:
            # No template → emit no combined text. (Downstream blocks that want
            # one value should use a template like "{value1}". If/Else reads the
            # per-path `values` directly, so it isn't affected.)
            text = ''

        _n = _to_number(primary)
        num_value = _n if _n is not None else 0.0

        return {
            'value': num_value,
            'text': text,
            'raw': primary,
            'values': values,
            'tree': tree,
            'found': primary is not None,
            'result': _upstream_trigger(inputs),  # propagate edge so TTS re-fires
        }
