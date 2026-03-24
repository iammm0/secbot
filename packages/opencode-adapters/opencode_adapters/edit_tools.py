"""
Unified file editing tools aligned with opencode edit/write semantics.

Provides EditFileTool and WriteFileTool that wrap secbot's system_control
file operations while matching the opencode tool interface (filePath,
oldString, newString, content) and integrating with the permission model.
"""
from __future__ import annotations

import os
import difflib
from pathlib import Path
from typing import Any, Dict, Optional

from tools.base import BaseTool, ToolResult
from utils.logger import logger


class EditFileTool(BaseTool):
    """
    Diff-based file editing tool (matches opencode EditTool semantics).

    Replaces `oldString` with `newString` in the file at `filePath`.
    Supports `replaceAll` for replacing all occurrences.
    """

    def __init__(self):
        super().__init__(
            name="edit_file",
            description=(
                "Edit a file by replacing exact text. Provide filePath, oldString, "
                "and newString. If oldString is empty and the file doesn't exist, "
                "creates a new file. Set replaceAll=true to replace all occurrences."
            ),
        )

    async def execute(
        self,
        filePath: str,
        oldString: str,
        newString: str,
        replaceAll: bool = False,
        **kwargs,
    ) -> ToolResult:
        try:
            fp = Path(filePath)

            if oldString == "" and not fp.exists():
                fp.parent.mkdir(parents=True, exist_ok=True)
                fp.write_text(newString, encoding="utf-8")
                return ToolResult(
                    success=True,
                    result=f"Created new file: {filePath}",
                )

            if not fp.exists():
                return ToolResult(success=False, result=None, error=f"File not found: {filePath}")

            content = fp.read_text(encoding="utf-8")

            if oldString == newString:
                return ToolResult(success=False, result=None, error="oldString and newString are identical")

            if oldString and oldString not in content:
                return ToolResult(
                    success=False,
                    result=None,
                    error=f"oldString not found in {filePath}",
                )

            if oldString == "":
                new_content = newString
            elif replaceAll:
                new_content = content.replace(oldString, newString)
            else:
                idx = content.index(oldString)
                new_content = content[:idx] + newString + content[idx + len(oldString):]

            fp.write_text(new_content, encoding="utf-8")

            diff = _compute_diff(filePath, content, new_content)
            return ToolResult(
                success=True,
                result=diff,
            )

        except Exception as exc:
            logger.error(f"EditFileTool error: {exc}")
            return ToolResult(success=False, result=None, error=str(exc))

    def get_schema(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "filePath": {"type": "string", "description": "Absolute path to the file"},
                "oldString": {"type": "string", "description": "Text to replace"},
                "newString": {"type": "string", "description": "Replacement text"},
                "replaceAll": {"type": "boolean", "description": "Replace all occurrences", "default": False},
            },
        }


class WriteFileTool(BaseTool):
    """
    Whole-file write tool (matches opencode WriteTool semantics).

    Writes `content` to the file at `filePath`, creating it if needed.
    """

    def __init__(self):
        super().__init__(
            name="write_file",
            description="Write content to a file. Creates the file if it doesn't exist.",
        )

    async def execute(self, filePath: str, content: str, **kwargs) -> ToolResult:
        try:
            fp = Path(filePath)
            existed = fp.exists()
            old_content = fp.read_text(encoding="utf-8") if existed else ""

            fp.parent.mkdir(parents=True, exist_ok=True)
            fp.write_text(content, encoding="utf-8")

            diff = _compute_diff(filePath, old_content, content)
            action = "Updated" if existed else "Created"
            return ToolResult(success=True, result=f"{action} {filePath}\n{diff}")

        except Exception as exc:
            logger.error(f"WriteFileTool error: {exc}")
            return ToolResult(success=False, result=None, error=str(exc))

    def get_schema(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": {
                "filePath": {"type": "string", "description": "Absolute path to the file"},
                "content": {"type": "string", "description": "Content to write"},
            },
        }


def _compute_diff(filepath: str, old: str, new: str) -> str:
    old_lines = old.splitlines(keepends=True)
    new_lines = new.splitlines(keepends=True)
    diff = difflib.unified_diff(old_lines, new_lines, fromfile=filepath, tofile=filepath)
    return "".join(diff)
