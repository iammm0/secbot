"""
攻击链图推理的状态定义
LangGraph StateGraph 的核心状态类型。
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# =====================================================================
# 图节点数据模型
# =====================================================================


class AssetNode(BaseModel):
    """资产节点"""
    asset_id: str
    host: str
    ip: str = ""
    port: int = 0
    service: str = ""
    os_type: str = ""
    tags: List[str] = Field(default_factory=list)


class VulnNode(BaseModel):
    """漏洞节点"""
    vuln_id: str
    description: str = ""
    exploitability: str = ""       # none | low | medium | high
    cvss_score: Optional[float] = None
    vuln_type: str = ""
    asset_id: str = ""             # 关联的资产


class PermissionNode(BaseModel):
    """权限节点"""
    perm_id: str
    level: str = "none"            # none | user | admin | system | root
    access_type: str = ""          # local | remote | web
    asset_id: str = ""
    description: str = ""


class ExploitNodeData(BaseModel):
    """Exploit 节点"""
    exploit_id: str
    vuln_id: str = ""
    payload_type: str = ""
    tool: str = ""                 # metasploit | sqlmap | nuclei | builtin
    conditions: str = ""           # 执行前提条件
    command: str = ""


# =====================================================================
# 攻击步骤与结果
# =====================================================================


class StepStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    ROLLED_BACK = "rolled_back"


class AttackStep(BaseModel):
    """单步攻击描述"""
    step_id: int = 0
    target: str = ""
    vuln_id: str = ""
    exploit_tool: str = ""
    payload: Dict[str, Any] = Field(default_factory=dict)
    status: StepStatus = StepStatus.PENDING
    result: Dict[str, Any] = Field(default_factory=dict)
    error: str = ""
    alternatives_tried: int = 0
    permission_gained: str = ""    # 利用后获得的权限级别


class AttackChainResult(BaseModel):
    """完整攻击链结果"""
    success: bool = False
    goal: str = ""
    steps: List[AttackStep] = Field(default_factory=list)
    rollbacks: List[AttackStep] = Field(default_factory=list)
    final_permission: str = "none"
    summary: str = ""


# =====================================================================
# LangGraph 状态（TypedDict 兼容的 Pydantic 模型）
# =====================================================================


class AttackChainState(BaseModel):
    """LangGraph StateGraph 中流转的状态"""

    # 图中的节点
    assets: List[AssetNode] = Field(default_factory=list)
    vulnerabilities: List[VulnNode] = Field(default_factory=list)
    permissions: List[PermissionNode] = Field(default_factory=list)
    exploits: List[ExploitNodeData] = Field(default_factory=list)

    # 推理状态
    current_step: int = 0
    current_path: List[AttackStep] = Field(default_factory=list)
    rollback_history: List[AttackStep] = Field(default_factory=list)
    visited_vulns: List[str] = Field(default_factory=list)
    max_steps: int = 15
    goal: str = ""                  # 期望达成的权限或目标

    # LLM 决策上下文
    llm_reasoning: str = ""
    next_action: str = ""           # select | exploit | verify | rollback | finish

    # 最终输出
    finished: bool = False
    chain_result: Optional[AttackChainResult] = None

    # 扫描/漏洞库的原始输入
    scan_results: Dict[str, Any] = Field(default_factory=dict)
    enriched_vulns: List[Dict[str, Any]] = Field(default_factory=list)
