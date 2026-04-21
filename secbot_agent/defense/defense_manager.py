"""
防御管理器：统一管理所有防御模块
"""
import asyncio
from typing import Dict, List, Optional

from secbot_agent.defense.info_collector import InfoCollector
from secbot_agent.defense.vulnerability_scanner import SelfVulnerabilityScanner
from secbot_agent.defense.network_analyzer import NetworkAnalyzer
from secbot_agent.defense.intrusion_detector import IntrusionDetector
from secbot_agent.defense.report_generator import ReportGenerator
from secbot_agent.defense.countermeasure import Countermeasure
from utils.logger import logger


class DefenseManager:
    """防御管理器：统一管理防御系统"""

    def __init__(self, auto_response: bool = True):
        self.info_collector = InfoCollector()
        self.vulnerability_scanner = SelfVulnerabilityScanner()
        self.network_analyzer = NetworkAnalyzer()
        self.intrusion_detector = IntrusionDetector()
        self.report_generator = ReportGenerator()
        self.countermeasure = Countermeasure()

        self.auto_response = auto_response
        self.monitoring = False
        self.monitor_task: Optional[asyncio.Task] = None

        logger.info("防御管理器初始化完成")

    async def full_scan(self) -> Dict:
        """执行完整的安全扫描"""
        logger.info("开始完整安全扫描...")

        # 1. 收集系统信息
        system_info = self.info_collector.collect_all()

        # 2. 扫描漏洞
        vulnerabilities = self.vulnerability_scanner.scan_all()

        # 3. 分析网络
        network_analysis = self.network_analyzer.analyze_connections()
        traffic_stats = self.network_analyzer.analyze_traffic()

        # 4. 检查已检测到的攻击
        detected_attacks = self.intrusion_detector.get_recent_attacks(hours=24)

        # 5. 生成报告
        report = self.report_generator.generate_security_report(
            system_info=system_info,
            vulnerabilities=vulnerabilities,
            network_analysis=network_analysis,
            detected_attacks=detected_attacks,
            traffic_stats=traffic_stats
        )

        logger.info(f"完整扫描完成，生成报告: {report['report_id']}")
        return report

    async def start_monitoring(self, interval: int = 60):
        """启动实时监控"""
        if self.monitoring:
            logger.warning("监控已在运行")
            return

        self.monitoring = True
        logger.info(f"启动实时监控，检查间隔: {interval}秒")

        while self.monitoring:
            try:
                # 分析网络连接
                network_analysis = self.network_analyzer.analyze_connections()

                # 检查可疑连接
                suspicious = network_analysis.get("suspicious", [])
                for conn in suspicious:
                    # 检测攻击
                    attack = self.intrusion_detector.detect_attack(
                        source_ip=conn.get("ip", "unknown"),
                        data=str(conn),
                        connection_info=conn
                    )

                    if attack and self.auto_response:
                        # 自动反制
                        response = self.countermeasure.auto_respond(attack)
                        logger.warning(f"检测到攻击并自动响应: {response}")

                # 分析流量
                self.network_analyzer.analyze_traffic()

                await asyncio.sleep(interval)

            except Exception as e:
                logger.error(f"监控错误: {e}")
                await asyncio.sleep(interval)

    async def stop_monitoring(self):
        """停止监控"""
        self.monitoring = False
        logger.info("实时监控已停止")

    def detect_and_respond(self, source_ip: str, data: str) -> Optional[Dict]:
        """检测攻击并响应"""
        # 检测攻击
        attack = self.intrusion_detector.detect_attack(source_ip, data)

        if attack:
            # 更新IP信誉
            self.intrusion_detector.update_ip_reputation(
                source_ip,
                attack["type"],
                attack["severity"]
            )

            # 自动响应
            if self.auto_response:
                response = self.countermeasure.auto_respond(attack)
                return response

        return None

    def generate_report(self, report_type: str = "full") -> Dict:
        """生成报告"""
        if report_type == "full":
            # 需要先执行扫描
            return {}
        elif report_type == "vulnerability":
            vulnerabilities = self.vulnerability_scanner.get_vulnerabilities()
            return self.report_generator.generate_vulnerability_report(vulnerabilities)
        elif report_type == "attack":
            attacks = self.intrusion_detector.get_recent_attacks(hours=24)
            return self.report_generator.generate_attack_report(attacks)
        else:
            raise ValueError(f"未知的报告类型: {report_type}")

    def get_status(self) -> Dict:
        """获取防御系统状态"""
        return {
            "monitoring": self.monitoring,
            "auto_response": self.auto_response,
            "blocked_ips": len(self.countermeasure.get_blocked_ips()),
            "vulnerabilities": len(self.vulnerability_scanner.get_vulnerabilities()),
            "detected_attacks": len(self.intrusion_detector.detected_attacks),
            "malicious_ips": len(self.intrusion_detector.ip_reputation),
            "statistics": self.intrusion_detector.get_statistics()
        }

    def get_blocked_ips(self) -> List[str]:
        """获取被封禁的IP列表"""
        return self.countermeasure.get_blocked_ips()

    def unblock_ip(self, ip: str) -> bool:
        """解封IP"""
        return self.countermeasure.unblock_ip(ip)

