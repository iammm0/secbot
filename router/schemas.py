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
    mode: ChatMode = Field("agent", description="模式: ask=仅提问, plan=编写计划, agent=执行智能体")
    agent: str = Field("hackbot", description="智能体类型 (hackbot/superhackbot)，mode=agent 时有效")
    prompt: Optional[str] = Field(None, description="自定义系统提示词")
    model: Optional[str] = Field(None, description="模型偏好（如 deepseek-reasoner / gpt-oss:20b），后端可选使用")


class ChatResponse(BaseModel):
    response: str = Field(..., description="智能体回复")
    agent: str = Field(..., description="使用的智能体类型")


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
