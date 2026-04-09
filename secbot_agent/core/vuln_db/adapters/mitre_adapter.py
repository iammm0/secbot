"""
MITRE ATT&CK 适配器
基于 MITRE ATT&CK STIX/TAXII 或公开 JSON (attack.mitre.org) 获取攻击技术信息，
将技术映射到 UnifiedVuln 的 attack_techniques 字段。
"""
import asyncio
import json
import urllib.request
from typing import Dict, List, Optional

from loguru import logger

from secbot_agent.core.vuln_db.schema import (
    AttackTechnique,
    UnifiedVuln,
    VulnSeverity,
    VulnSource,
)
from .base_adapter import BaseVulnAdapter

ENTERPRISE_ATTACK_URL = (
    "https://raw.githubusercontent.com/mitre/cti/master/"
    "enterprise-attack/enterprise-attack.json"
)


class MitreAttackAdapter(BaseVulnAdapter):
    """MITRE ATT&CK 数据适配器"""

    source_name = "mitre_attack"

    def __init__(self, timeout: int = 30):
        self._timeout = timeout
        self._technique_cache: Dict[str, dict] = {}
        self._loaded = False

    # ------------------------------------------------------------------
    async def load_dataset(self) -> None:
        """预加载 MITRE ATT&CK 企业矩阵（可选，大约 15MB JSON）"""
        if self._loaded:
            return
        loop = asyncio.get_event_loop()
        try:
            raw = await loop.run_in_executor(None, self._download_dataset)
            data = json.loads(raw)
            for obj in data.get("objects", []):
                if obj.get("type") == "attack-pattern":
                    ext_refs = obj.get("external_references", [])
                    for ref in ext_refs:
                        if ref.get("source_name") == "mitre-attack":
                            tid = ref.get("external_id", "")
                            if tid:
                                self._technique_cache[tid] = obj
                                break
            self._loaded = True
            logger.info(f"MITRE ATT&CK 加载完成: {len(self._technique_cache)} 个技术")
        except Exception as exc:
            logger.warning(f"MITRE ATT&CK 数据集加载失败: {exc}")

    def _download_dataset(self) -> str:
        req = urllib.request.Request(ENTERPRISE_ATTACK_URL)
        req.add_header("User-Agent", "secbot/1.0")
        with urllib.request.urlopen(req, timeout=self._timeout) as resp:
            return resp.read().decode()

    # ------------------------------------------------------------------
    async def fetch_by_id(self, technique_id: str) -> Optional[UnifiedVuln]:
        if not self._loaded:
            await self.load_dataset()

        tid = technique_id.upper()
        obj = self._technique_cache.get(tid)
        if not obj:
            return None
        return self._normalize(tid, obj)

    async def search(self, keyword: str, limit: int = 20) -> List[UnifiedVuln]:
        if not self._loaded:
            await self.load_dataset()

        kw_lower = keyword.lower()
        results: List[UnifiedVuln] = []
        for tid, obj in self._technique_cache.items():
            name = obj.get("name", "").lower()
            desc = obj.get("description", "").lower()
            if kw_lower in name or kw_lower in desc or kw_lower in tid.lower():
                vuln = self._normalize(tid, obj)
                if vuln:
                    results.append(vuln)
                if len(results) >= limit:
                    break
        return results

    async def get_techniques_for_tactic(self, tactic: str) -> List[AttackTechnique]:
        """获取指定战术下的所有技术"""
        if not self._loaded:
            await self.load_dataset()

        tactic_lower = tactic.lower().replace(" ", "-")
        techniques: List[AttackTechnique] = []
        for tid, obj in self._technique_cache.items():
            phases = obj.get("kill_chain_phases", [])
            for phase in phases:
                if phase.get("phase_name", "").lower() == tactic_lower:
                    techniques.append(self._to_technique(tid, obj))
                    break
        return techniques

    # ------------------------------------------------------------------
    def _normalize(self, tid: str, obj: dict) -> UnifiedVuln:
        tech = self._to_technique(tid, obj)
        desc = obj.get("description", "")[:2000]

        platforms = obj.get("x_mitre_platforms", [])
        tactics = [
            p.get("phase_name", "")
            for p in obj.get("kill_chain_phases", [])
        ]

        return UnifiedVuln(
            vuln_id=tid,
            source=VulnSource.MITRE_ATTACK,
            title=obj.get("name", tid),
            description=desc,
            severity=VulnSeverity.UNKNOWN,
            attack_techniques=[tech],
            tags=platforms + tactics,
            references=[
                ref.get("url", "")
                for ref in obj.get("external_references", [])[:5]
                if ref.get("url")
            ],
        )

    @staticmethod
    def _to_technique(tid: str, obj: dict) -> AttackTechnique:
        phases = obj.get("kill_chain_phases", [])
        tactic = phases[0].get("phase_name", "") if phases else ""
        url = ""
        for ref in obj.get("external_references", []):
            if ref.get("source_name") == "mitre-attack":
                url = ref.get("url", "")
                break
        return AttackTechnique(
            technique_id=tid,
            name=obj.get("name", ""),
            tactic=tactic,
            description=obj.get("description", "")[:500],
            url=url,
        )
