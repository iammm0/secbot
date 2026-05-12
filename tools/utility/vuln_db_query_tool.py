"""
统一漏洞库查询工具（供 ExploreAgent 使用，与 npm vuln_db_query 对齐）。
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from tools.base import BaseTool, ToolResult


def _vuln_to_dict(v: Any) -> dict:
    if hasattr(v, "model_dump"):
        return v.model_dump()
    if isinstance(v, dict):
        return v
    return {"repr": str(v)}


class VulnDbQueryTool(BaseTool):
    """查询 NVD/CVE.org/Exploit-DB/MITRE 等聚合漏洞信息。"""

    sensitivity = "low"

    _svc = None

    def __init__(self):
        super().__init__(
            name="vuln_db_query",
            description=(
                "查询开源漏洞库。参数: "
                "cve_id(精确 CVE 编号), query(自然语言/关键词), "
                "scan_result(可选 dict，扫描器单条结果)。"
                "至少提供其一。"
            ),
        )

    def _get_service(self):
        if VulnDbQueryTool._svc is None:
            from secbot_agent.core.vuln_db.vuln_db_service import VulnDBService

            VulnDbQueryTool._svc = VulnDBService(
                nvd_api_key=os.environ.get("NVD_API_KEY"),
            )
        return VulnDbQueryTool._svc

    async def execute(self, **kwargs) -> ToolResult:
        cve_id = (kwargs.get("cve_id") or "").strip()
        query = (kwargs.get("query") or "").strip()
        scan_result = kwargs.get("scan_result")

        try:
            svc = self._get_service()
            if cve_id:
                v = await svc.search_by_cve_id(cve_id.upper())
                if v:
                    return ToolResult(success=True, result=_vuln_to_dict(v))
                return ToolResult(
                    success=False, result=None, error=f"未找到 {cve_id}"
                )
            if isinstance(scan_result, dict) and scan_result:
                mapping = await svc.search_by_scan_result(scan_result, limit=5)
                return ToolResult(
                    success=True,
                    result={
                        "matched": [_vuln_to_dict(x) for x in mapping.matched_vulns],
                        "match_score": mapping.match_score,
                    },
                )
            if query:
                items = await svc.search_natural_language(query, limit=8)
                return ToolResult(
                    success=True,
                    result={"items": [_vuln_to_dict(x) for x in items]},
                )
            return ToolResult(
                success=False,
                result=None,
                error="需要 cve_id、query 或 scan_result",
            )
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))
