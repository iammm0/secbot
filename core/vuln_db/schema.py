"""
统一漏洞数据模型
将 CVE/NVD/Exploit-DB/MITRE ATT&CK 等数据源格式化为结构化 schema，
支持向量化 embedding 和 LLM 检索。
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class VulnSeverity(str, Enum):
    """漏洞严重性等级"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"
    UNKNOWN = "unknown"


class VulnSource(str, Enum):
    """漏洞信息来源"""
    CVE = "cve"
    NVD = "nvd"
    EXPLOIT_DB = "exploit_db"
    MITRE_ATTACK = "mitre_attack"
    SCAN = "scan"


class AffectedProduct(BaseModel):
    """受影响软件/产品"""
    vendor: str = ""
    product: str = ""
    versions: List[str] = Field(default_factory=list)
    cpe: Optional[str] = None


class ExploitRef(BaseModel):
    """可利用 Exploit 引用"""
    url: str = ""
    title: str = ""
    exploit_type: str = ""          # poc | exploit | metasploit_module | nuclei_template
    tool: str = ""                  # metasploit | sqlmap | nuclei | manual
    verified: bool = False
    source: str = ""                # exploit_db | github | packetstorm


class AttackTechnique(BaseModel):
    """MITRE ATT&CK 攻击技术"""
    technique_id: str = ""          # T1059 等
    name: str = ""
    tactic: str = ""                # initial-access | execution | persistence ...
    description: str = ""
    url: str = ""


class Mitigation(BaseModel):
    """缓解/修复措施"""
    description: str = ""
    url: str = ""
    patch_available: bool = False


class UnifiedVuln(BaseModel):
    """统一漏洞数据模型 —— 所有数据源归一化后的结构"""

    vuln_id: str                    # CVE-xxxx-xxxxx / EDB-xxxxx / Txxxx
    source: VulnSource = VulnSource.CVE
    title: str = ""
    description: str = ""

    affected_software: List[AffectedProduct] = Field(default_factory=list)

    severity: VulnSeverity = VulnSeverity.UNKNOWN
    cvss_score: Optional[float] = None
    cvss_vector: Optional[str] = None

    exploits: List[ExploitRef] = Field(default_factory=list)
    attack_techniques: List[AttackTechnique] = Field(default_factory=list)
    mitigations: List[Mitigation] = Field(default_factory=list)

    references: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)

    date_published: Optional[datetime] = None
    date_modified: Optional[datetime] = None
    state: str = ""                  # PUBLISHED / REJECTED / RESERVED

    raw_data: Optional[dict] = None  # 原始 JSON（按需保留）

    def build_embedding_text(self) -> str:
        """拼接用于向量化的文本"""
        parts = [self.vuln_id, self.title, self.description]

        for prod in self.affected_software:
            parts.append(f"{prod.vendor} {prod.product} {' '.join(prod.versions[:5])}")

        for exp in self.exploits:
            parts.append(exp.title or exp.url)

        for tech in self.attack_techniques:
            parts.append(f"{tech.technique_id} {tech.name} {tech.tactic}")

        parts.append(self.severity.value)
        if self.cvss_score is not None:
            parts.append(f"CVSS {self.cvss_score}")

        for tag in self.tags:
            parts.append(tag)

        return " | ".join(filter(None, parts))

    def to_summary(self) -> str:
        """生成人类可读摘要"""
        lines = [
            f"[{self.vuln_id}] {self.title or '(无标题)'}",
            f"  严重性: {self.severity.value.upper()}  CVSS: {self.cvss_score or 'N/A'}",
            f"  描述: {self.description[:200]}",
        ]
        if self.affected_software:
            prods = ", ".join(
                f"{p.vendor}/{p.product}" for p in self.affected_software[:3]
            )
            lines.append(f"  影响: {prods}")
        if self.exploits:
            lines.append(f"  可利用: {len(self.exploits)} 个 exploit")
        return "\n".join(lines)


class ScanVulnMapping(BaseModel):
    """扫描结果 → 漏洞库映射记录"""
    scan_vuln_type: str              # 扫描器输出的 type 字段
    scan_description: str = ""
    matched_vulns: List[UnifiedVuln] = Field(default_factory=list)
    match_score: float = 0.0         # 向量相似度或关键词匹配分
