"""
OpenAI 兼容的 chat/completions HTTP 直连回退。
当 LangChain 流式/非流式调用因部分 API 返回格式（如 model_dump、无 generation chunks）失败时，
可用此模块直接发 POST 请求获取回复。
"""

from typing import List, Dict, Any, Optional
import httpx


async def chat_completions_request(
    messages: List[Dict[str, str]],
    max_tokens: int = 2048,
    timeout: float = 60.0,
) -> str:
    """
    使用当前配置的推理后端，发 OpenAI 兼容的 POST /v1/chat/completions 请求。

    messages: [{"role": "system"|"user"|"assistant", "content": "..."}]
    返回: 助手回复文本；失败时返回错误描述字符串。
    """
    try:
        from hackbot_config import (
            settings,
            get_provider_api_key,
            get_provider_base_url,
            get_provider_model,
        )
        from utils.model_selector import get_default_model_for_provider

        provider = (settings.llm_provider or "deepseek").strip().lower()
        if provider == "ollama":
            base_url = (
                get_provider_base_url("ollama")
                or settings.ollama_base_url
                or "http://localhost:11434"
            ).rstrip("/")
            url = f"{base_url}/v1/chat/completions"
            api_key = "ollama"
            model = (
                get_provider_model("ollama")
                or settings.ollama_model
                or get_default_model_for_provider("ollama")
            ).strip()
        else:
            base_url = (get_provider_base_url(provider) or "").rstrip("/")
            if not base_url:
                return "[LLM 回退失败: 当前推理后端未配置 Base URL]"
            api_key = get_provider_api_key(provider)
            if not api_key:
                return "[LLM 回退失败: 当前推理后端未配置 API Key]"
            if base_url.rstrip("/").endswith("/v1"):
                url = f"{base_url.rstrip('/')}/chat/completions"
            else:
                url = f"{base_url.rstrip('/')}/v1/chat/completions"
            model = (
                get_provider_model(provider) or get_default_model_for_provider(provider)
            ).strip()

        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        headers = {"Content-Type": "application/json"}
        if api_key and api_key != "ollama":
            headers["Authorization"] = f"Bearer {api_key}"

        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(url, json=payload, headers=headers)
        r.raise_for_status()
        data = r.json()
        choice = (data.get("choices") or [None])[0]
        if not choice:
            return "[LLM 回退失败: API 返回无 choices]"
        msg = choice.get("message") or choice
        text = (
            msg.get("content") if isinstance(msg, dict) else getattr(msg, "content", None)
        ) or ""
        return str(text).strip()
    except Exception as e:
        return f"[LLM 回退失败: {e}]"


def langchain_messages_to_dicts(messages: List) -> List[Dict[str, str]]:
    """将 LangChain 消息列表转为 OpenAI 格式 [{"role": "...", "content": "..."}]。"""
    out = []
    for m in messages:
        role = getattr(m, "type", "user")
        if role == "ai":
            role = "assistant"
        elif role == "human":
            role = "user"
        content = getattr(m, "content", "") or ""
        if isinstance(content, list):
            # 多模态等：取第一段 text
            for part in content:
                if isinstance(part, dict) and part.get("type") == "text":
                    content = part.get("text", "")
                    break
                if hasattr(part, "get") and part.get("type") == "text":
                    content = part.get("text", "")
                    break
            else:
                content = str(content)
        out.append({"role": role, "content": str(content)})
    return out
