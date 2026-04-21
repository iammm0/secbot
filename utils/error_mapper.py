"""
统一错误处理模型 — 与 npm-release 的 map-exception-to-client.ts 对齐
提供：
- ClientErrorCode 枚举
- redact_sensitive_text() 脱敏
- classify_upstream_llm_error() LLM 错误分类
- map_exception_to_client() 统一映射
"""

import re
from enum import Enum
from dataclasses import dataclass
from typing import Optional


class ClientErrorCode(str, Enum):
    HTTP_EXCEPTION = "HTTP_EXCEPTION"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    LLM_AUTH_FAILED = "LLM_AUTH_FAILED"
    LLM_FORBIDDEN = "LLM_FORBIDDEN"
    LLM_RATE_LIMIT = "LLM_RATE_LIMIT"
    LLM_BAD_REQUEST = "LLM_BAD_REQUEST"
    LLM_UPSTREAM_REJECTED = "LLM_UPSTREAM_REJECTED"
    LLM_UNAVAILABLE = "LLM_UNAVAILABLE"
    LLM_NETWORK = "LLM_NETWORK"
    INTERNAL_ERROR = "INTERNAL_ERROR"


@dataclass
class ClientErrorBody:
    status_code: int
    code: ClientErrorCode
    message: str


def redact_sensitive_text(text: str) -> str:
    """脱敏：避免把 API Key、Bearer 等写入响应体或 SSE。"""
    if not text or not isinstance(text, str):
        return ""
    text = re.sub(r"\bsk-[a-zA-Z0-9]{10,}\b", "sk-[REDACTED]", text, flags=re.IGNORECASE)
    text = re.sub(r"Bearer\s+[\w.+/=-]{10,}", "Bearer [REDACTED]", text, flags=re.IGNORECASE)
    text = re.sub(
        r"Your api key\s*:\s*[^\s.\"]+",
        "Your api key: [REDACTED]",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"""["']?api[_-]?key["']?\s*[:=]\s*["']?[^\s"',}]+""",
        "api_key=[REDACTED]",
        text,
        flags=re.IGNORECASE,
    )
    return text[:2000]


def classify_upstream_llm_error(raw: str) -> Optional[ClientErrorBody]:
    """按 HTTP 状态码/关键字分类 LLM 上游错误。"""
    lower = raw.lower()

    if re.search(r"\bhttp\s*401\b", raw) or re.search(r"\b401\b.*unauth", raw, re.IGNORECASE) or "authentication fails" in lower:
        return ClientErrorBody(
            status_code=502,
            code=ClientErrorCode.LLM_AUTH_FAILED,
            message="模型服务认证失败。请在「模型配置」中检查 API Key 是否与当前厂商及 API 地址一致，或确认密钥未过期。",
        )
    if re.search(r"\bhttp\s*403\b", raw) or "permission denied" in lower or "forbidden" in lower:
        return ClientErrorBody(
            status_code=502,
            code=ClientErrorCode.LLM_FORBIDDEN,
            message="模型服务拒绝访问。请确认账号权限或所请求的资源是否可用。",
        )
    if re.search(r"\bhttp\s*429\b", raw) or "rate limit" in lower or "too many requests" in lower:
        return ClientErrorBody(
            status_code=502,
            code=ClientErrorCode.LLM_RATE_LIMIT,
            message="模型服务请求频率超限。请稍后重试或切换到其他厂商。",
        )
    if re.search(r"\bhttp\s*400\b", raw) or "bad request" in lower:
        return ClientErrorBody(
            status_code=502,
            code=ClientErrorCode.LLM_BAD_REQUEST,
            message="模型服务请求参数有误。请检查模型名称或请求内容。",
        )
    if re.search(r"\bhttp\s*5\d{2}\b", raw) or "internal server error" in lower or "service unavailable" in lower:
        return ClientErrorBody(
            status_code=502,
            code=ClientErrorCode.LLM_UNAVAILABLE,
            message="模型服务暂时不可用。请稍后重试。",
        )
    if any(kw in lower for kw in ("connection refused", "timeout", "econnreset", "enotfound", "network")):
        return ClientErrorBody(
            status_code=502,
            code=ClientErrorCode.LLM_NETWORK,
            message="无法连接到模型服务。请检查网络或 API 地址配置。",
        )
    return None


def map_exception_to_client(exc: Exception) -> ClientErrorBody:
    """将异常统一映射为可安全返回给客户端的错误结构。"""
    raw = str(exc)
    classified = classify_upstream_llm_error(raw)
    if classified:
        classified.message = redact_sensitive_text(classified.message)
        return classified
    return ClientErrorBody(
        status_code=500,
        code=ClientErrorCode.INTERNAL_ERROR,
        message=redact_sensitive_text(f"内部错误: {raw[:500]}"),
    )
