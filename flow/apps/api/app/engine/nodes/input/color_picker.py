from app.engine.nodes.base import BaseNodeHandler


class ColorPickerHandler(BaseNodeHandler):
    """Color picker — outputs hex, RGB components, and CSS-style value."""

    async def execute(self, config: dict, inputs: dict) -> dict:
        hex_color = str(config.get("color", "#7c3aed")).strip()
        if not hex_color.startswith("#"):
            hex_color = "#" + hex_color
        try:
            r = int(hex_color[1:3], 16)
            g = int(hex_color[3:5], 16)
            b = int(hex_color[5:7], 16)
        except (ValueError, IndexError):
            r, g, b = 124, 58, 237  # violet fallback
            hex_color = "#7c3aed"

        return {
            "hex":   hex_color,
            "r":     r,
            "g":     g,
            "b":     b,
            "rgb":   f"rgb({r}, {g}, {b})",
            "text":  hex_color,
            "value": (r << 16) | (g << 8) | b,
        }
