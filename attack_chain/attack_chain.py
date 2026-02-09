"""
自动化攻击链
实现完整的渗透测试流程
"""
import asyncio
from typing import Dict, List, Optional, Any
from datetime import datetime
from utils.logger import logger


class AttackChain:
    """自动化攻击链：完整的渗透测试流程"""
    
    def __init__(self):
        self.stages = []
        self.results = {}
    
    async def execute_full_chain(self, target: str, options: Optional[Dict] = None) -> Dict[str, Any]:
        """执行完整的攻击链"""
        logger.info(f"开始执行完整攻击链: {target}")
        
        start_time = datetime.now()
        
        # 阶段1: 信息收集
        recon_result = await self._reconnaissance(target, options)
        self.results["reconnaissance"] = recon_result
        
        # 阶段2: 漏洞扫描
        scan_result = await self._vulnerability_scanning(target, recon_result, options)
        self.results["vulnerability_scanning"] = scan_result
        
        # 阶段3: 漏洞利用
        exploit_result = await self._exploitation(target, scan_result, options)
        self.results["exploitation"] = exploit_result
        
        # 阶段4: 后渗透
        if exploit_result.get("success"):
            post_result = await self._post_exploitation(target, exploit_result, options)
            self.results["post_exploitation"] = post_result
        
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()
        
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
        from scanner.port_scanner import PortScanner
        from scanner.vulnerability_scanner import VulnerabilityScanner
        
        port_scanner = PortScanner()
        vuln_scanner = VulnerabilityScanner()

        # 端口扫描（PortScanner 使用 scan_host）
        scan_result = await port_scanner.scan_host(target)
        ports = scan_result.get("ports", [])

        # 漏洞扫描
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
            "ports": ports,
            "vulnerabilities": vulnerabilities
        }
    
    async def _exploitation(self, target: str, scan_result: Dict, options: Optional[Dict]) -> Dict:
        """漏洞利用阶段"""
        from .exploitation import Exploitation
        from exploit.exploit_engine import ExploitEngine
        
        exploitation = Exploitation()
        exploit_engine = ExploitEngine()
        
        # 根据发现的漏洞选择利用方式
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

