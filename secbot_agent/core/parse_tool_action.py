"""
解析 LLM ReAct 输出中的 Action JSON（与 npm parse-tool-action.ts 对齐）。
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class ParsedAction:
    tool: str
    params: Dict[str, Any]


ACTION_LABEL_REGEX = re.compile(
    r"(^|\n)\s*\**\s*(?:action|行动|动作)\s*\**\s*[:：]\s*\**\s*",
    re.IGNORECASE,
)

FINAL_ANSWER_REGEX = re.compile(
    r"(?:Final\s*Answer|最终(?:回答|答案|结论))\s*[:：]", re.IGNORECASE
)

CODE_BLOCK_REGEX = re.compile(
    r"^\s*```(?:json|JSON|js|javascript|ts)?\s*([\s\S]*?)```", re.MULTILINE
)

FINAL_PATCH_REGEX = re.compile(r"Final\s*Patch\s*:", re.IGNORECASE)


def parse_tool_action(thought: str) -> Optional[ParsedAction]:
    if not thought:
        return None
    if FINAL_ANSWER_REGEX.search(thought):
        return None
    if FINAL_PATCH_REGEX.search(thought):
        return None

    label_match = ACTION_LABEL_REGEX.search(thought)
    if not label_match:
        return None

    after_label = thought[label_match.end() :]

    code_block = CODE_BLOCK_REGEX.match(after_label)
    if code_block:
        candidate = _strip_json_noise(code_block.group(1))
        parsed = _try_parse_action(candidate)
        if parsed:
            return parsed

    json_candidate = extract_first_json_object(after_label)
    if json_candidate:
        parsed = _try_parse_action(json_candidate)
        if parsed:
            return parsed

    legacy = re.match(r"^\s*(\{[\s\S]*\})\s*(?:\n|$)", after_label)
    if legacy:
        return _try_parse_action(legacy.group(1))
    return None


def has_final_answer(thought: str) -> bool:
    return bool(thought and FINAL_ANSWER_REGEX.search(thought))


def extract_final_answer(thought: str) -> Optional[str]:
    m = re.search(
        r"(?:Final\s*Answer|最终(?:回答|答案|结论))\s*[:：]\s*([\s\S]*)",
        thought,
        re.IGNORECASE,
    )
    return m.group(1).strip() if m else None


def _strip_json_noise(text: str) -> str:
    return text.strip().lstrip("`*").rstrip("`*")


def extract_first_json_object(text: str) -> Optional[str]:
    """从 text 中扫描第一个平衡花括号 JSON 对象。"""
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    escaped = False
    for i in range(start, len(text)):
        ch = text[i]
        if escaped:
            escaped = False
            continue
        if ch == "\\":
            escaped = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return None


def _try_parse_action(json_text: str) -> Optional[ParsedAction]:
    if not json_text or not json_text.strip():
        return None
    try:
        parsed = json.loads(json_text)
        if not isinstance(parsed, dict):
            return None
        tool = parsed.get("tool")
        if not isinstance(tool, str) or not tool.strip():
            return None
        raw_params = parsed.get("params")
        if raw_params is None:
            params: Dict[str, Any] = {}
        elif isinstance(raw_params, dict) and not isinstance(raw_params, list):
            params = raw_params
        else:
            params = {}
        return ParsedAction(tool=tool.strip(), params=params)
    except (json.JSONDecodeError, TypeError):
        return None
