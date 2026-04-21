"""
反制模块：自动响应和反制攻击
"""
import subprocess
import platform
from typing import Dict, List, Optional
from datetime import datetime
from utils.logger import logger


class Countermeasure:
    """反制措施：自动响应检测到的攻击"""

    def __init__(self):
        self.blocked_ips: set = set()
        self.countermeasure_history: List[Dict] = []

    def block_ip(self, ip: str, reason: str, duration: Optional[int] = None) -> bool:
        """封禁IP地址"""
        if ip in self.blocked_ips:
            logger.info(f"IP {ip} 已被封禁")
            return True

        try:
            if platform.system() == "Windows":
                # Windows防火墙规则
                rule_name = f"Block_{ip.replace('.', '_')}"
                subprocess.run(
                    [
                        "netsh", "advfirewall", "firewall", "add", "rule",
                        f"name={rule_name}",
                        "dir=in",
                        "action=block",
                        f"remoteip={ip}",
                        "enable=yes"
                    ],
                    capture_output=True,
                    timeout=10
                )
            else:
                # Linux iptables规则
                subprocess.run(
                    ["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"],
                    capture_output=True,
                    timeout=10
                )

            self.blocked_ips.add(ip)

            action = {
                "type": "block_ip",
                "ip": ip,
                "reason": reason,
                "timestamp": datetime.now().isoformat(),
                "duration": duration,
                "success": True
            }

            self.countermeasure_history.append(action)
            logger.warning(f"已封禁IP: {ip}, 原因: {reason}")
            return True

        except Exception as e:
            logger.error(f"封禁IP失败 {ip}: {e}")
            return False

    def unblock_ip(self, ip: str) -> bool:
        """解封IP地址"""
        if ip not in self.blocked_ips:
            return True

        try:
            if platform.system() == "Windows":
                rule_name = f"Block_{ip.replace('.', '_')}"
                subprocess.run(
                    [
                        "netsh", "advfirewall", "firewall", "delete", "rule",
                        f"name={rule_name}"
                    ],
                    capture_output=True,
                    timeout=10
                )
            else:
                subprocess.run(
                    ["iptables", "-D", "INPUT", "-s", ip, "-j", "DROP"],
                    capture_output=True,
                    timeout=10
                )

            self.blocked_ips.discard(ip)
            logger.info(f"已解封IP: {ip}")
            return True

        except Exception as e:
            logger.error(f"解封IP失败 {ip}: {e}")
            return False

    def rate_limit(self, ip: str, max_requests: int = 10, window: int = 60) -> bool:
        """对IP实施速率限制"""
        try:
            if platform.system() != "Windows":
                # Linux使用iptables limit模块
                subprocess.run(
                    [
                        "iptables", "-A", "INPUT", "-s", ip,
                        "-m", "limit", "--limit", f"{max_requests}/min",
                        "-j", "ACCEPT"
                    ],
                    capture_output=True,
                    timeout=10
                )

                action = {
                    "type": "rate_limit",
                    "ip": ip,
                    "max_requests": max_requests,
                    "window": window,
                    "timestamp": datetime.now().isoformat(),
                    "success": True
                }

                self.countermeasure_history.append(action)
                logger.info(f"已对 {ip} 实施速率限制: {max_requests} 请求/分钟")
                return True
        except Exception as e:
            logger.error(f"速率限制失败 {ip}: {e}")

        return False

    def close_connection(self, ip: str, port: Optional[int] = None) -> bool:
        """关闭与特定IP的连接"""
        try:
            import psutil

            connections = psutil.net_connections(kind='inet')
            closed = 0

            for conn in connections:
                if conn.raddr and conn.raddr.ip == ip:
                    if port is None or conn.raddr.port == port:
                        try:
                            proc = psutil.Process(conn.pid)
                            proc.terminate()
                            closed += 1
                        except Exception:
                            pass

            if closed > 0:
                action = {
                    "type": "close_connection",
                    "ip": ip,
                    "port": port,
                    "closed_count": closed,
                    "timestamp": datetime.now().isoformat(),
                    "success": True
                }

                self.countermeasure_history.append(action)
                logger.info(f"已关闭与 {ip} 的 {closed} 个连接")
                return True
        except Exception as e:
            logger.error(f"关闭连接失败 {ip}: {e}")

        return False

    def alert_admin(self, attack_info: Dict) -> bool:
        """向管理员发送警报"""
        try:
            # 这里可以集成邮件、短信、Webhook等通知方式
            logger.warning(f"安全警报: {attack_info.get('type')} 攻击来自 {attack_info.get('source_ip')}")

            action = {
                "type": "alert",
                "attack_info": attack_info,
                "timestamp": datetime.now().isoformat(),
                "success": True
            }

            self.countermeasure_history.append(action)
            return True
        except Exception as e:
            logger.error(f"发送警报失败: {e}")
            return False

    def auto_respond(self, attack: Dict) -> Dict:
        """自动响应攻击"""
        response = {
            "attack": attack,
            "actions_taken": [],
            "timestamp": datetime.now().isoformat()
        }

        attack_type = attack.get("type")
        source_ip = attack.get("source_ip")
        severity = attack.get("severity", "Medium")

        # 根据攻击类型和严重程度采取不同措施
        if severity in ["High", "Critical"]:
            # 严重攻击：立即封禁
            if self.block_ip(source_ip, f"{attack_type} 攻击"):
                response["actions_taken"].append("blocked_ip")

        elif attack_type == "brute_force":
            # 暴力破解：封禁IP
            if self.block_ip(source_ip, "暴力破解攻击"):
                response["actions_taken"].append("blocked_ip")

        elif attack_type == "dos":
            # DoS攻击：速率限制
            if self.rate_limit(source_ip, max_requests=5, window=60):
                response["actions_taken"].append("rate_limited")

        elif attack_type == "port_scan":
            # 端口扫描：关闭连接
            if self.close_connection(source_ip):
                response["actions_taken"].append("closed_connection")

        # 发送警报
        if self.alert_admin(attack):
            response["actions_taken"].append("alerted_admin")

        self.countermeasure_history.append(response)
        return response

    def get_blocked_ips(self) -> List[str]:
        """获取被封禁的IP列表"""
        return list(self.blocked_ips)

    def get_countermeasure_history(self, limit: Optional[int] = None) -> List[Dict]:
        """获取反制历史"""
        if limit:
            return self.countermeasure_history[-limit:]
        return self.countermeasure_history

