"""
报告生成模块：生成安全报告
"""
import json
from typing import Dict, List, Optional
from datetime import datetime
from pathlib import Path
from utils.logger import logger


class ReportGenerator:
    """报告生成器：生成安全分析报告"""

    def __init__(self):
        self.reports: List[Dict] = []

    def generate_security_report(
        self,
        system_info: Dict,
        vulnerabilities: List[Dict],
        network_analysis: Dict,
        detected_attacks: List[Dict],
        traffic_stats: Optional[Dict] = None
    ) -> Dict:
        """生成完整的安全报告"""
        report = {
            "report_id": f"SEC-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "generated_at": datetime.now().isoformat(),
            "summary": self._generate_summary(vulnerabilities, detected_attacks),
            "system_info": {
                "hostname": system_info.get("hostname", "Unknown"),
                "platform": system_info.get("platform", "Unknown"),
                "ip_addresses": system_info.get("network", {}).get("ip_addresses", [])
            },
            "vulnerabilities": {
                "total": len(vulnerabilities),
                "by_severity": self._count_by_severity(vulnerabilities),
                "details": vulnerabilities
            },
            "network_analysis": {
                "total_connections": network_analysis.get("total_connections", 0),
                "suspicious_connections": len(network_analysis.get("suspicious", [])),
                "suspicious_details": network_analysis.get("suspicious", [])
            },
            "detected_attacks": {
                "total": len(detected_attacks),
                "by_type": self._count_by_type(detected_attacks),
                "recent_attacks": detected_attacks[-20:] if len(detected_attacks) > 20 else detected_attacks
            },
            "traffic_stats": traffic_stats or {},
            "recommendations": self._generate_recommendations(vulnerabilities, detected_attacks)
        }

        self.reports.append(report)
        logger.info(f"生成安全报告: {report['report_id']}")
        return report

    def generate_vulnerability_report(self, vulnerabilities: List[Dict]) -> Dict:
        """生成漏洞报告"""
        report = {
            "report_id": f"VULN-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "generated_at": datetime.now().isoformat(),
            "type": "Vulnerability Scan",
            "summary": {
                "total_vulnerabilities": len(vulnerabilities),
                "critical": len([v for v in vulnerabilities if v.get("severity") == "Critical"]),
                "high": len([v for v in vulnerabilities if v.get("severity") == "High"]),
                "medium": len([v for v in vulnerabilities if v.get("severity") == "Medium"]),
                "low": len([v for v in vulnerabilities if v.get("severity") == "Low"])
            },
            "vulnerabilities": vulnerabilities,
            "recommendations": self._generate_vulnerability_recommendations(vulnerabilities)
        }

        return report

    def generate_attack_report(self, attacks: List[Dict]) -> Dict:
        """生成攻击报告"""
        report = {
            "report_id": f"ATTACK-{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "generated_at": datetime.now().isoformat(),
            "type": "Attack Detection",
            "summary": {
                "total_attacks": len(attacks),
                "by_type": self._count_by_type(attacks),
                "by_severity": self._count_by_severity(attacks)
            },
            "attacks": attacks,
            "top_attackers": self._get_top_attackers(attacks),
            "recommendations": self._generate_attack_recommendations(attacks)
        }

        return report

    def save_report(self, report: Dict, output_path: Path, format: str = "json"):
        """保存报告到文件"""
        output_path.parent.mkdir(parents=True, exist_ok=True)

        if format == "json":
            with open(output_path, "w", encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
        elif format == "txt":
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(self._format_text_report(report))
        else:
            raise ValueError(f"不支持的格式: {format}")

        logger.info(f"报告已保存到: {output_path}")

    def _generate_summary(self, vulnerabilities: List[Dict], attacks: List[Dict]) -> Dict:
        """生成摘要"""
        return {
            "vulnerabilities": {
                "total": len(vulnerabilities),
                "critical": len([v for v in vulnerabilities if v.get("severity") == "Critical"]),
                "high": len([v for v in vulnerabilities if v.get("severity") == "High"])
            },
            "attacks": {
                "total": len(attacks),
                "high_severity": len([a for a in attacks if a.get("severity") in ["High", "Critical"]])
            },
            "risk_level": self._calculate_risk_level(vulnerabilities, attacks)
        }

    def _count_by_severity(self, items: List[Dict]) -> Dict:
        """按严重程度统计"""
        counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
        for item in items:
            severity = item.get("severity", "Unknown")
            if severity in counts:
                counts[severity] += 1
        return counts

    def _count_by_type(self, items: List[Dict]) -> Dict:
        """按类型统计"""
        counts = {}
        for item in items:
            item_type = item.get("type", "Unknown")
            counts[item_type] = counts.get(item_type, 0) + 1
        return counts

    def _get_top_attackers(self, attacks: List[Dict], top_n: int = 10) -> List[Dict]:
        """获取顶级攻击者"""
        ip_counts = {}
        for attack in attacks:
            ip = attack.get("source_ip", "unknown")
            if ip not in ip_counts:
                ip_counts[ip] = {"count": 0, "types": set(), "severity": "Low"}

            ip_counts[ip]["count"] += 1
            ip_counts[ip]["types"].add(attack.get("type", "Unknown"))

            severity = attack.get("severity", "Low")
            if severity in ["High", "Critical"]:
                ip_counts[ip]["severity"] = severity

        top = sorted(ip_counts.items(), key=lambda x: x[1]["count"], reverse=True)[:top_n]
        return [
            {
                "ip": ip,
                "attack_count": info["count"],
                "attack_types": list(info["types"]),
                "severity": info["severity"]
            }
            for ip, info in top
        ]

    def _calculate_risk_level(self, vulnerabilities: List[Dict], attacks: List[Dict]) -> str:
        """计算风险等级"""
        critical_vulns = len([v for v in vulnerabilities if v.get("severity") == "Critical"])
        high_vulns = len([v for v in vulnerabilities if v.get("severity") == "High"])
        high_attacks = len([a for a in attacks if a.get("severity") in ["High", "Critical"]])

        if critical_vulns > 0 or high_attacks > 5:
            return "Critical"
        elif high_vulns > 3 or high_attacks > 0:
            return "High"
        elif len(vulnerabilities) > 10 or len(attacks) > 10:
            return "Medium"
        else:
            return "Low"

    def _generate_recommendations(
        self,
        vulnerabilities: List[Dict],
        attacks: List[Dict]
    ) -> List[str]:
        """生成建议"""
        recommendations = []

        # 基于漏洞的建议
        if vulnerabilities:
            recommendations.append(f"修复发现的 {len(vulnerabilities)} 个漏洞")

            critical_vulns = [v for v in vulnerabilities if v.get("severity") == "Critical"]
            if critical_vulns:
                recommendations.append(f"优先修复 {len(critical_vulns)} 个严重漏洞")

        # 基于攻击的建议
        if attacks:
            recommendations.append("加强入侵检测和防护措施")

            brute_force = [a for a in attacks if a.get("type") == "brute_force"]
            if brute_force:
                recommendations.append("实施更强的密码策略和账户锁定机制")

            dos_attacks = [a for a in attacks if a.get("type") == "dos"]
            if dos_attacks:
                recommendations.append("实施DDoS防护和速率限制")

        return recommendations

    def _generate_vulnerability_recommendations(self, vulnerabilities: List[Dict]) -> List[str]:
        """生成漏洞修复建议"""
        recommendations = []

        for vuln in vulnerabilities:
            if "recommendation" in vuln:
                recommendations.append(f"{vuln.get('type')}: {vuln['recommendation']}")

        return list(set(recommendations))  # 去重

    def _generate_attack_recommendations(self, attacks: List[Dict]) -> List[str]:
        """生成攻击防护建议"""
        recommendations = []

        attack_types = set(a.get("type") for a in attacks)

        if "brute_force" in attack_types:
            recommendations.append("实施账户锁定策略和双因素认证")

        if "sql_injection" in attack_types:
            recommendations.append("使用参数化查询和输入验证")

        if "xss" in attack_types:
            recommendations.append("实施输出编码和内容安全策略")

        if "dos" in attack_types:
            recommendations.append("实施速率限制和DDoS防护")

        if "port_scan" in attack_types:
            recommendations.append("配置防火墙规则限制端口扫描")

        return recommendations

    def _format_text_report(self, report: Dict) -> str:
        """格式化文本报告"""
        lines = []
        lines.append("=" * 60)
        lines.append(f"安全报告: {report.get('report_id', 'N/A')}")
        lines.append(f"生成时间: {report.get('generated_at', 'N/A')}")
        lines.append("=" * 60)
        lines.append("")

        if "summary" in report:
            lines.append("摘要:")
            summary = report["summary"]
            if isinstance(summary, dict):
                for key, value in summary.items():
                    lines.append(f"  {key}: {value}")
            lines.append("")

        if "vulnerabilities" in report:
            vuln_info = report["vulnerabilities"]
            lines.append("漏洞信息:")
            lines.append(f"  总数: {vuln_info.get('total', 0)}")
            if "by_severity" in vuln_info:
                lines.append("  按严重程度:")
                for severity, count in vuln_info["by_severity"].items():
                    lines.append(f"    {severity}: {count}")
            lines.append("")

        if "detected_attacks" in report:
            attack_info = report["detected_attacks"]
            lines.append("检测到的攻击:")
            lines.append(f"  总数: {attack_info.get('total', 0)}")
            if "by_type" in attack_info:
                lines.append("  按类型:")
                for attack_type, count in attack_info["by_type"].items():
                    lines.append(f"    {attack_type}: {count}")
            lines.append("")

        if "recommendations" in report:
            lines.append("建议:")
            for i, rec in enumerate(report["recommendations"], 1):
                lines.append(f"  {i}. {rec}")

        return "\n".join(lines)

