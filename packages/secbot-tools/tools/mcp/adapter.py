"""
BaseTool to MCP adapter.
"""
from __future__ import annotations

import json
from typing import Any, Dict

from tools.base import BaseTool, ToolResult


def _schema_to_input_schema(schema: Dict[str, Any]) -> Dict[str, Any]:
    params = schema.get("parameters", {}) or {}
    if not isinstance(params, dict):
        params = {}

    required = [k for k, v in params.items() if isinstance(v, dict) and bool(v.get("required"))]
    properties: Dict[str, Any] = {}
    for name, info in params.items():
        if isinstance(info, dict):
            item_type = info.get("type", "string")
            prop = {
                "type": item_type,
                "description": info.get("description", ""),
            }
            if "default" in info:
                prop["default"] = info["default"]
            properties[name] = prop
        else:
            properties[name] = {"type": "string", "description": str(info)}

    return {
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": True,
    }


def to_mcp_tool_def(tool: BaseTool) -> Dict[str, Any]:
    schema = tool.get_schema()
    return {
        "name": tool.name,
        "description": schema.get("description") or tool.description,
        "inputSchema": _schema_to_input_schema(schema),
    }


async def call_tool(tool: BaseTool, arguments: Dict[str, Any]) -> Dict[str, Any]:
    args = arguments if isinstance(arguments, dict) else {}
    result: ToolResult = await tool.execute(**args)
    if result.success:
        if isinstance(result.result, str):
            text = result.result
        else:
            text = json.dumps(result.result, ensure_ascii=False, default=str)
        return {"content": [{"type": "text", "text": text}], "isError": False}
    return {
        "content": [{"type": "text", "text": result.error or "tool execution failed"}],
        "isError": True,
    }

