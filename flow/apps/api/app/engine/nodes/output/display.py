from app.engine.nodes.base import BaseNodeHandler


class DisplayHandler(BaseNodeHandler):
    """
    Output block: collects results from upstream blocks and surfaces them
    for display on the canvas. Passes through any image and/or text it finds.
    """

    async def execute(self, config: dict, inputs: dict) -> dict:
        image = None
        table = None          # {headers, rows} from a Data Table upstream
        text_parts: list[str] = []

        for value in inputs.values():
            if not isinstance(value, dict):
                text_parts.append(str(value))
                continue
            # Capture the first image we encounter
            if image is None and value.get("image"):
                image = value["image"]
            # Table data → render as a real table, not its tab-separated text
            if table is None and isinstance(value.get("headers"), list) and isinstance(value.get("rows"), list):
                table = {"headers": value["headers"], "rows": value["rows"]}
                continue
            # Collect any textual content
            if value.get("text"):
                text_parts.append(str(value["text"]))
            elif value.get("data") is not None:
                text_parts.append(str(value["data"]))

        return {
            "image": image,
            "headers": table["headers"] if table else None,
            "rows": table["rows"] if table else None,
            "text": "\n".join(text_parts),
            "displayed": True,
        }
