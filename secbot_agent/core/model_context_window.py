"""
模型上下文窗口静态表 + 粗略 token 估算。
与 npm-release `model-context-window.ts` 对齐。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class ModelWindow:
    """模型总上下文窗口（input + output）及预留"""

    context: int
    reserve_for_output: int
    reserve_for_system: int


DEFAULT_WINDOW = ModelWindow(
    context=8192, reserve_for_output=1500, reserve_for_system=1500
)

MODEL_WINDOW_TABLE: Dict[str, ModelWindow] = {
    "gpt-4o": ModelWindow(128_000, 4000, 2000),
    "gpt-4o-mini": ModelWindow(128_000, 4000, 2000),
    "gpt-4-turbo": ModelWindow(128_000, 4000, 2000),
    "gpt-4": ModelWindow(8192, 1500, 1500),
    "gpt-3.5-turbo": ModelWindow(16_385, 2000, 1500),
    "o1": ModelWindow(128_000, 32_000, 2000),
    "o1-mini": ModelWindow(128_000, 16_000, 2000),
    "o3-mini": ModelWindow(200_000, 32_000, 2000),
    "claude-3-5-sonnet": ModelWindow(200_000, 8000, 2000),
    "claude-3-7-sonnet": ModelWindow(200_000, 8000, 2000),
    "claude-3-opus": ModelWindow(200_000, 4000, 2000),
    "claude-3-haiku": ModelWindow(200_000, 4000, 2000),
    "deepseek-chat": ModelWindow(128_000, 4000, 2000),
    "deepseek-reasoner": ModelWindow(128_000, 8000, 2000),
    "deepseek-coder": ModelWindow(128_000, 4000, 2000),
    "qwen-max": ModelWindow(32_768, 2000, 1500),
    "qwen-plus": ModelWindow(131_072, 4000, 2000),
    "qwen-turbo": ModelWindow(1_000_000, 8000, 2000),
    "qwen2.5": ModelWindow(131_072, 4000, 2000),
    "moonshot-v1-8k": ModelWindow(8192, 1500, 1500),
    "moonshot-v1-32k": ModelWindow(32_768, 2000, 1500),
    "moonshot-v1-128k": ModelWindow(128_000, 4000, 2000),
    "moonshot-v1-1m": ModelWindow(1_000_000, 8000, 2000),
    "glm-4": ModelWindow(128_000, 4000, 2000),
    "glm-4-plus": ModelWindow(128_000, 4000, 2000),
    "gemini-1.5-pro": ModelWindow(1_000_000, 8000, 2000),
    "gemini-1.5-flash": ModelWindow(1_000_000, 8000, 2000),
    "gemini-2.0-flash": ModelWindow(1_000_000, 8000, 2000),
    "llama3.2": ModelWindow(8192, 1500, 1500),
    "llama3.1": ModelWindow(128_000, 4000, 2000),
    "llama3": ModelWindow(8192, 1500, 1500),
    "mistral": ModelWindow(32_768, 2000, 1500),
    "mixtral": ModelWindow(32_768, 2000, 1500),
    "qwen2": ModelWindow(32_768, 2000, 1500),
    "grok-2": ModelWindow(131_072, 4000, 2000),
    "grok-beta": ModelWindow(131_072, 4000, 2000),
}

_TABLE_KEYS_BY_LENGTH_DESC: List[str] = sorted(
    MODEL_WINDOW_TABLE.keys(), key=len, reverse=True
)


def get_model_window(model_name: Optional[str] = None) -> ModelWindow:
    if not model_name:
        return DEFAULT_WINDOW
    lower = model_name.lower().strip()
    if not lower:
        return DEFAULT_WINDOW
    if lower in MODEL_WINDOW_TABLE:
        return MODEL_WINDOW_TABLE[lower]
    for key in _TABLE_KEYS_BY_LENGTH_DESC:
        if lower.startswith(key) or key in lower:
            return MODEL_WINDOW_TABLE[key]
    return DEFAULT_WINDOW


def approx_tokens(text: str) -> int:
    if not text:
        return 0
    non_ascii = sum(1 for c in text if ord(c) > 127)
    base = (len(text) + 3) // 4
    cjk_adj = (non_ascii + 1) // 2
    return max(1, base + cjk_adj)


def compute_prompt_budget(window: ModelWindow, ratio: float = 0.6) -> int:
    total = max(
        0,
        window.context - window.reserve_for_output - window.reserve_for_system,
    )
    return max(512, int(total * ratio))
