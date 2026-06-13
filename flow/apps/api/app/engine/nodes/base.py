from abc import ABC, abstractmethod
from typing import Any


class BaseNodeHandler(ABC):
    """Abstract base class for all node handlers."""

    @abstractmethod
    async def execute(self, config: dict, inputs: dict) -> dict[str, Any]:
        """
        Execute the node logic.

        Args:
            config: Node configuration from the flow definition (data.config)
            inputs: Resolved inputs from upstream nodes {handle_name: output_dict}

        Returns:
            Output dict that downstream nodes can access
        """
        ...
