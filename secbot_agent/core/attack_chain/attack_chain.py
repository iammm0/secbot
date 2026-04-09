"""
自动化攻击链
实现完整的渗透测试流程，整合漏洞库检索和 LangGraph 图推理。
"""
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime
import time
from utils.logger import logger


class AttackChain:
    """自动化攻击链：完整的渗透测试流程"""

    def __init__(self):
        self.stages = []
        self.results = {}

    async def execute_full_chain(self, target: str, options: Optional[Dict] = None) -> Dict[str, Any]:
        """执行完整的攻击链"""
        started = time.perf_counter()
        logger.bind(event="stage_start", tool="attack_chain", attempt=1).info(f"开始执行完整攻击链: {target}")

        start_time = datetime.now()

        # 阶段 1: 信息收集
        recon_result = await self._reconnaissance(target, options)
        self.results["reconnaissance"] = recon_result

        # 阶段 2: 漏洞扫描
        scan_result = await self._vulnerability_scanning(target, recon_result, options)
        self.results["vulnerability_scanning"] = scan_result

        # 阶段 2.5: 漏洞库检索（enrichment）
        enriched_vulns = await self._vuln_db_enrichment(scan_result, options)
        self.results["vuln_db_enrichment"] = {
            "count": len(enriched_vulns),
            "vulns": [
                {"vuln_id": v.get("vuln_id", ""), "severity": v.get("severity", "")}
                for v in enriched_vulns[:20]
            ],
        }

        # 阶段 3: 攻击链推理 + 漏洞利用
        exploit_result = await self._exploitation(target, scan_result, enriched_vulns, options)
        self.results["exploitation"] = exploit_result

        # 阶段 4: 后渗透
        if exploit_result.get("success"):
            post_result = await self._post_exploitation(target, exploit_result, options)
            self.results["post_exploitation"] = post_result

        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        logger.bind(event="stage_end", tool="attack_chain", attempt=1, duration_ms=int((time.perf_counter() - started) * 1000)).info("完整攻击链执行完成")

        return {
            "success": True,
            "target": target,
            "start_time": start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "duration": duration,
            "results": self.results
        }

    async def _reconnaissance(self, target: str, options: Optional[Dict]) -> Dict:
        """信息收集阶段"""
        from .reconnaissance import Reconnaissance
        recon = Reconnaissance()
        return await recon.gather_info(target, options)

    async def _vulnerability_scanning(self, target: str, recon_result: Dict, options: Optional[Dict]) -> Dict:
        """漏洞扫描阶段"""
        from secbot_agent.scanner.port_scanner import PortScanner
        from secbot_agent.scanner.vulnerability_scanner import VulnerabilityScanner

        port_scanner = PortScanner()
        vuln_scanner = VulnerabilityScanner()

        scan_result = await port_scanner.scan_host(target)
        ports = scan_result.get("ports", [])

        vulnerabilities = []
        for port_info in ports:
            if port_info.get("status") == "open":
                vulns = await vuln_scanner.scan_vulnerabilities(
                    target,
                    port_info["port"],
                    port_info.get("service", "unknown")
                )
                vulnerabilities.extend(vulns)

        return {
            "success": True,
            "target": target,
            "ports": ports,
            "vulnerabilities": vulnerabilities
        }

    async def _vuln_db_enrichment(self, scan_result: Dict, options: Optional[Dict]) -> List[Dict]:
        """漏洞库检索阶段：将扫描结果映射到公开漏洞信息"""
        try:
            from secbot_agent.core.vuln_db.vuln_db_service import VulnDBService

            service = VulnDBService()
            enriched: List[Dict] = []

            for vuln in scan_result.get("vulnerabilities", []):
                try:
                    mapping = await service.search_by_scan_result(vuln, limit=3)
                    for mv in mapping.matched_vulns:
                        enriched.append({
                            "vuln_id": mv.vuln_id,
                            "source": mv.source.value,
                            "title": mv.title,
                            "description": mv.description[:300],
                            "severity": mv.severity.value,
                            "cvss_score": mv.cvss_score,
                            "exploits": [
                                {
                                    "url": e.url,
                                    "title": e.title,
                                    "exploit_type": e.exploit_type,
                                    "tool": e.tool,
                                    "verified": e.verified,
                                }
                                for e in mv.exploits
                            ],
                            "mitigations": [m.description for m in mv.mitigations],
                            "references": mv.references[:5],
                        })
                except Exception as exc:
                    logger.bind(event="tool_error", tool="vuln_db_search", attempt=1).debug(f"漏洞库检索跳过: {exc}")

            service.close()
            logger.bind(event="stage_end", tool="vuln_db_enrichment", attempt=1).info(f"漏洞库 enrichment 完成: {len(enriched)} 条")
            return enriched

        except Exception as exc:
            logger.bind(event="tool_error", tool="vuln_db_enrichment", attempt=1).warning(f"漏洞库检索失败，降级跳过: {exc}")
            return []

    async def _exploitation(
        self,
        target: str,
        scan_result: Dict,
        enriched_vulns: List[Dict],
        options: Optional[Dict],
    ) -> Dict:
        """漏洞利用阶段：先用 LangGraph 生成攻击链，再逐步执行"""
        try:
            from secbot_agent.core.attack_chain.graph.workflow import AttackChainGraphAgent

            agent = AttackChainGraphAgent(max_steps=options.get("max_steps", 15) if options else 15)
            chain_result = await agent.generate_attack_chain(
                scan_results=scan_result,
                enriched_vulns=enriched_vulns,
                goal=options.get("goal", "获取最高权限") if options else "获取最高权限",
            )

            chain_dict = chain_result.model_dump() if hasattr(chain_result, "model_dump") else {}

            return {
                "success": chain_result.success,
                "attack_chain": chain_dict,
                "exploits": [
                    {
                        "step_id": s.step_id,
                        "vuln_id": s.vuln_id,
                        "target": s.target,
                        "exploit_tool": s.exploit_tool,
                        "status": s.status.value if hasattr(s.status, "value") else str(s.status),
                        "result": s.result,
                        "permission_gained": s.permission_gained,
                    }
                    for s in chain_result.steps
                ],
                "rollbacks": len(chain_result.rollbacks),
                "final_permission": chain_result.final_permission,
                "summary": chain_result.summary,
            }

        except Exception as exc:
            logger.bind(event="llm_fallback", tool="attack_chain_graph", attempt=1).warning(f"LangGraph 攻击链推理失败，回退到传统模式: {exc}")
            return await self._exploitation_fallback(target, scan_result, options)

    async def _exploitation_fallback(self, target: str, scan_result: Dict, options: Optional[Dict]) -> Dict:
        """传统漏洞利用回退（保持向后兼容）"""
        from tools.offense.exploit.exploit_engine import ExploitEngine

        exploit_engine = ExploitEngine()
        vulnerabilities = scan_result.get("vulnerabilities", [])

        exploit_results = []
        for vuln in vulnerabilities:
            vuln_type = vuln.get("type", "")
            if vuln_type in ["sql_injection", "xss", "command_injection"]:
                result = await exploit_engine.execute_exploit(
                    "web",
                    target,
                    payload={"type": vuln_type}
                )
                exploit_results.append(result)

        return {
            "success": len(exploit_results) > 0,
            "exploits": exploit_results
        }

    async def _post_exploitation(self, target: str, exploit_result: Dict, options: Optional[Dict]) -> Dict:
        """后渗透阶段"""
        from .post_exploitation import PostExploitationChain

        post_exploit = PostExploitationChain()
        return await post_exploit.execute(target, exploit_result, options)
