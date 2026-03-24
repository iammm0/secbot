"""
Pydantic 请求/响应模型 — 供所有路由端点共用。
"""

from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


# ===================================================================
# Chat
# ===================================================================

ChatMode = Literal["ask", "plan", "agent"]


class ChatRequest(BaseModel):
    message: str = Field(..., description="用户消息")
    mode: ChatMode = Field("agent", description="模式: ask=仅提问, plan=仅规划, agent=执行智能体")
    agent: str = Field("secbot-cli", description="执行角色 (secbot-cli/superhackbot)，仅在 mode=agent 时生效")
    prompt: Optional[str] = Field(None, description="自定义系统提示词")
    model: Optional[str] = Field(None, description="模型偏好（如 deepseek-reasoner / gpt-oss:20b），后端可选使用")


class ChatResponse(BaseModel):
    response: str = Field(..., description="智能体回复")
    agent: str = Field(..., description="使用的智能体类型")


RootAction = Literal["run_once", "always_allow", "deny"]


class RootResponseRequest(BaseModel):
    """需 root 权限时，用户选择后的回传"""
    request_id: str = Field(..., description="后端 root_required 事件中的 request_id")
    action: RootAction = Field(..., description="执行一次 / 总是允许 / 拒绝")
    password: Optional[str] = Field(None, description="本机账户或 root 密码，执行一次或首次总是允许时必填")


# ===================================================================
# Agents
# ===================================================================

class AgentInfo(BaseModel):
    type: str
    name: str
    description: str


class AgentListResponse(BaseModel):
    agents: list[AgentInfo]


class ClearMemoryRequest(BaseModel):
    agent: Optional[str] = Field(None, description="智能体类型，为空则清空所有")


class ClearMemoryResponse(BaseModel):
    success: bool
    message: str


# ===================================================================
# System
# ===================================================================

class SystemInfoResponse(BaseModel):
    os_type: str
    os_name: str
    os_version: str
    os_release: str
    architecture: str
    processor: str
    python_version: str
    hostname: str
    username: str


class SystemConfigResponse(BaseModel):
    """当前推理/模型配置（供 TUI /model 等使用）"""
    llm_provider: str = Field(..., description="当前推理后端，如 ollama / deepseek")
    ollama_model: str = Field(..., description="Ollama 默认模型")
    ollama_base_url: str = Field(..., description="Ollama 服务地址")
    deepseek_model: Optional[str] = Field(None, description="DeepSeek 默认模型")
    deepseek_base_url: Optional[str] = Field(None, description="DeepSeek API 地址")
    current_provider_model: Optional[str] = Field(None, description="当前后端生效的模型名（供「当前」详情页编辑）")
    current_provider_base_url: Optional[str] = Field(None, description="当前后端生效的 Base URL（供「当前」详情页编辑）")


class OllamaModelItem(BaseModel):
    """Ollama 本地/在线可用模型项（等价 ollama list 一行）"""
    name: str = Field(..., description="模型名")
    size: Optional[int] = Field(None, description="占用大小（字节）")
    modified_at: Optional[str] = Field(None, description="最后修改时间")
    parameter_size: Optional[str] = Field(None, description="参数量，如 7B")
    family: Optional[str] = Field(None, description="模型族，如 llama")


class OllamaModelsResponse(BaseModel):
    """Ollama 可用模型列表（调用 ollama list / api/tags）"""
    models: list[OllamaModelItem] = Field(default_factory=list, description="本地及在线可用模型")
    base_url: str = Field("", description="请求使用的 Ollama 服务地址")
    error: Optional[str] = Field(None, description="若无法连接 Ollama 时的错误信息")
    pulling_model: Optional[str] = Field(None, description="若默认模型不在本地且正在后台拉取，则为该模型名")


class ProviderApiKeyStatus(BaseModel):
    id: str
    name: str
    needs_api_key: bool = True
    configured: bool = False
    # 对于 OpenAI 兼容中转等，还可能需要 Base URL
    needs_base_url: bool = False
    has_base_url: bool = False


class ProviderListResponse(BaseModel):
    providers: list[ProviderApiKeyStatus]


class SetApiKeyRequest(BaseModel):
    provider: str = Field(..., description="厂商 id，如 deepseek / openai / custom")
    api_key: str = Field(..., description="API Key，空字符串表示删除")
    # 对于 OpenAI 兼容中转等，可同时设置 Base URL（可选）
    base_url: Optional[str] = Field(
        None,
        description="可选 Base URL，空字符串表示清除自定义 base_url",
    )


class SetApiKeyResponse(BaseModel):
    success: bool
    message: str


class SetProviderRequest(BaseModel):
    """设置当前默认推理后端"""
    llm_provider: str = Field(..., description="厂商 id，如 ollama / deepseek / stepfun")


class SetProviderSettingsRequest(BaseModel):
    """更新某厂商的默认模型或 Base URL（不涉及 API Key）"""
    provider: str = Field(..., description="厂商 id，如 ollama / deepseek")
    model: Optional[str] = Field(None, description="默认模型名，不传则不修改")
    base_url: Optional[str] = Field(None, description="Base URL，不传则不修改；空字符串表示清除自定义")


class ProviderSettingsResponse(BaseModel):
    """单个厂商的模型与 Base URL（供详情页展示与编辑）"""
    provider: str = Field(..., description="厂商 id")
    model: Optional[str] = Field(None, description="默认模型名")
    base_url: Optional[str] = Field(None, description="Base URL")


class CpuInfo(BaseModel):
    count: Optional[int] = None
    percent: Optional[float] = None
    freq_current: Optional[float] = None


class MemoryInfo(BaseModel):
    total_gb: float
    used_gb: float
    available_gb: float
    percent: float


class DiskInfo(BaseModel):
    device: str
    mountpoint: str
    total_gb: float
    used_gb: float
    percent: float


class SystemStatusResponse(BaseModel):
    cpu: Optional[CpuInfo] = None
    memory: Optional[MemoryInfo] = None
    disks: list[DiskInfo] = []


class LogLevelResponse(BaseModel):
    level: str = Field(..., description="当前日志级别（DEBUG/INFO）")


class SetLogLevelRequest(BaseModel):
    level: str = Field(..., description="目标日志级别（DEBUG/INFO）")


class MCPAddRequest(BaseModel):
    """通过 API 向 opencode.json 注册 MCP 服务。"""
    type: Literal["local", "remote"] = Field(..., description="服务类型")
    name: str = Field(..., description="服务名")
    command: Optional[list[str]] = Field(None, description="local 类型命令数组")
    url: Optional[str] = Field(None, description="remote 类型 URL")
    headers: dict[str, str] = Field(default_factory=dict, description="remote 请求头")
    environment: dict[str, str] = Field(default_factory=dict, description="local 环境变量")
    enabled: bool = Field(True, description="是否启用")
    timeout: int = Field(30, description="超时时间（秒）")


# ===================================================================
# Defense
# ===================================================================

class DefenseScanResponse(BaseModel):
    success: bool
    report: dict[str, Any] = {}


class DefenseStatusResponse(BaseModel):
    monitoring: bool
    auto_response: bool
    blocked_ips: int
    vulnerabilities: int
    detected_attacks: int
    malicious_ips: int
    statistics: dict[str, Any] = {}


class BlockedIpsResponse(BaseModel):
    blocked_ips: list[str]


class UnblockRequest(BaseModel):
    ip: str = Field(..., description="要解封的 IP 地址")


class UnblockResponse(BaseModel):
    success: bool
    message: str


class DefenseReportResponse(BaseModel):
    success: bool
    report: dict[str, Any] = {}


# ===================================================================
# Network
# ===================================================================

class DiscoverRequest(BaseModel):
    network: Optional[str] = Field(None, description="网络段（如 192.168.1.0/24），默认自动检测")


class HostInfo(BaseModel):
    ip: str
    hostname: str = "Unknown"
    mac_address: str = "Unknown"
    open_ports: list[int] = []
    authorized: bool = False


class DiscoverResponse(BaseModel):
    success: bool
    hosts: list[HostInfo] = []


class TargetListResponse(BaseModel):
    targets: list[HostInfo] = []


class AuthorizeRequest(BaseModel):
    target_ip: str = Field(..., description="目标IP地址")
    username: str = Field(..., description="用户名")
    password: Optional[str] = Field(None, description="密码")
    key_file: Optional[str] = Field(None, description="SSH密钥文件路径")
    auth_type: str = Field("full", description="授权类型 (full/limited/read_only)")
    description: Optional[str] = Field(None, description="描述")


class AuthorizeResponse(BaseModel):
    success: bool
    message: str


class AuthorizationInfo(BaseModel):
    target_ip: str
    auth_type: str = "N/A"
    username: str = "N/A"
    created_at: str = "N/A"
    description: str = "N/A"


class AuthorizationListResponse(BaseModel):
    authorizations: list[AuthorizationInfo] = []


class RevokeResponse(BaseModel):
    success: bool
    message: str


# ===================================================================
# Database
# ===================================================================

class DbStatsResponse(BaseModel):
    conversations: int = 0
    prompt_chains: int = 0
    user_configs: int = 0
    crawler_tasks: int = 0
    crawler_tasks_by_status: dict[str, int] = {}


class ConversationRecord(BaseModel):
    timestamp: str = "N/A"
    agent_type: str = ""
    user_message: str = ""
    assistant_message: str = ""


class DbHistoryResponse(BaseModel):
    conversations: list[ConversationRecord] = []


class DbClearResponse(BaseModel):
    success: bool
    deleted_count: int
    message: str


# ===================================================================
# 通用
# ===================================================================

class ErrorResponse(BaseModel):
    detail: str
