"""
漏洞库接入层
统一管理 CVE/NVD/Exploit-DB/MITRE ATT&CK 等公开漏洞信息源，
提供结构化数据模型、向量化检索和自然语言查询能力。
"""
from .schema import (
    UnifiedVuln,
    AffectedProduct,
    ExploitRef,
    VulnSeverity,
    VulnSource,
)

__all__ = [
    "UnifiedVuln",
    "AffectedProduct",
    "ExploitRef",
    "VulnSeverity",
    "VulnSource",
]
