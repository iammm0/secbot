"""
网络分析模块：分析网络流量和连接
"""
import psutil
import socket
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from collections import defaultdict
from utils.logger import logger


class NetworkAnalyzer:
    """网络分析器：监控和分析网络流量"""
    
    def __init__(self):
        self.connection_history: List[Dict] = []
        self.traffic_stats: Dict = {}
        self.suspicious_connections: List[Dict] = []
    
    def analyze_connections(self) -> Dict:
        """分析当前网络连接"""
        connections = psutil.net_connections(kind='inet')
        
        analysis = {
            "total_connections": len(connections),
            "by_status": defaultdict(int),
            "by_remote_ip": defaultdict(int),
            "by_port": defaultdict(int),
            "established": [],
            "listening": [],
            "suspicious": []
        }
        
        for conn in connections:
            if conn.status:
                analysis["by_status"][conn.status] += 1
            
            if conn.raddr:
                analysis["by_remote_ip"][conn.raddr.ip] += 1
            
            if conn.laddr:
                analysis["by_port"][conn.laddr.port] += 1
            
            if conn.status == "ESTABLISHED":
                analysis["established"].append({
                    "local": f"{conn.laddr.ip}:{conn.laddr.port}" if conn.laddr else None,
                    "remote": f"{conn.raddr.ip}:{conn.raddr.port}" if conn.raddr else None,
                    "pid": conn.pid
                })
            
            if conn.status == "LISTEN":
                analysis["listening"].append({
                    "address": f"{conn.laddr.ip}:{conn.laddr.port}" if conn.laddr else None,
                    "pid": conn.pid
                })
        
        # 检测可疑连接
        analysis["suspicious"] = self._detect_suspicious_connections(connections)
        
        self.connection_history.append({
            "timestamp": datetime.now().isoformat(),
            "analysis": analysis
        })
        
        return analysis
    
    def analyze_traffic(self) -> Dict:
        """分析网络流量"""
        io_counters = psutil.net_io_counters(pernic=True)
        
        traffic = {
            "interfaces": {},
            "total_bytes_sent": 0,
            "total_bytes_recv": 0,
            "timestamp": datetime.now().isoformat()
        }
        
        for interface, counters in io_counters.items():
            traffic["interfaces"][interface] = {
                "bytes_sent": counters.bytes_sent,
                "bytes_recv": counters.bytes_recv,
                "packets_sent": counters.packets_sent,
                "packets_recv": counters.packets_recv,
                "errin": counters.errin,
                "errout": counters.errout,
                "dropin": counters.dropin,
                "dropout": counters.dropout
            }
            
            traffic["total_bytes_sent"] += counters.bytes_sent
            traffic["total_bytes_recv"] += counters.bytes_recv
        
        # 检测异常流量
        anomalies = self._detect_traffic_anomalies(traffic)
        if anomalies:
            traffic["anomalies"] = anomalies
        
        self.traffic_stats = traffic
        return traffic
    
    def _detect_suspicious_connections(self, connections: List) -> List[Dict]:
        """检测可疑连接"""
        suspicious = []
        
        # 检查大量连接到同一IP
        ip_counts = defaultdict(int)
        for conn in connections:
            if conn.raddr:
                ip_counts[conn.raddr.ip] += 1
        
        for ip, count in ip_counts.items():
            if count > 10:  # 阈值
                suspicious.append({
                    "type": "Multiple Connections",
                    "severity": "Medium",
                    "description": f"检测到大量连接到 {ip} ({count} 个连接)",
                    "ip": ip,
                    "count": count
                })
        
        # 检查连接到可疑端口
        suspicious_ports = [4444, 5555, 6666, 12345, 31337]  # 常见后门端口
        for conn in connections:
            if conn.raddr and conn.raddr.port in suspicious_ports:
                suspicious.append({
                    "type": "Suspicious Port",
                    "severity": "High",
                    "description": f"连接到可疑端口 {conn.raddr.port}",
                    "remote": f"{conn.raddr.ip}:{conn.raddr.port}"
                })
        
        # 检查异常的外部连接
        local_ips = self._get_local_ips()
        for conn in connections:
            if conn.raddr and conn.raddr.ip not in local_ips:
                # 检查是否为已知恶意IP（简化，实际应该查询威胁情报）
                if self._is_suspicious_ip(conn.raddr.ip):
                    suspicious.append({
                        "type": "Suspicious IP",
                        "severity": "High",
                        "description": f"连接到可疑IP {conn.raddr.ip}",
                        "remote": f"{conn.raddr.ip}:{conn.raddr.port}"
                    })
        
        self.suspicious_connections.extend(suspicious)
        return suspicious
    
    def _detect_traffic_anomalies(self, traffic: Dict) -> List[Dict]:
        """检测流量异常"""
        anomalies = []
        
        # 检查异常高的流量
        for interface, stats in traffic["interfaces"].items():
            # 简化检测，实际应该基于历史数据
            if stats["bytes_sent"] > 1000000000 or stats["bytes_recv"] > 1000000000:  # 1GB
                anomalies.append({
                    "type": "High Traffic",
                    "severity": "Medium",
                    "description": f"接口 {interface} 流量异常高",
                    "interface": interface,
                    "bytes_sent": stats["bytes_sent"],
                    "bytes_recv": stats["bytes_recv"]
                })
            
            # 检查错误包
            if stats["errin"] > 1000 or stats["errout"] > 1000:
                anomalies.append({
                    "type": "Network Errors",
                    "severity": "Medium",
                    "description": f"接口 {interface} 存在大量网络错误",
                    "interface": interface,
                    "errors": stats["errin"] + stats["errout"]
                })
        
        return anomalies
    
    def _get_local_ips(self) -> List[str]:
        """获取本地IP地址列表"""
        local_ips = ["127.0.0.1", "localhost"]
        
        interfaces = psutil.net_if_addrs()
        for interface_name, addresses in interfaces.items():
            for addr in addresses:
                if addr.family == socket.AF_INET:
                    local_ips.append(addr.address)
        
        return local_ips
    
    def _is_suspicious_ip(self, ip: str) -> bool:
        """检查IP是否可疑（简化实现）"""
        # 实际应该查询威胁情报数据库
        # 这里简化处理，检查是否为私有IP
        parts = ip.split(".")
        if len(parts) == 4:
            first = int(parts[0])
            if first == 10 or (first == 172 and 16 <= int(parts[1]) <= 31) or (first == 192 and int(parts[1]) == 168):
                return False  # 私有IP，通常不可疑
        return False  # 简化实现，不标记为可疑
    
    def get_connection_summary(self) -> Dict:
        """获取连接摘要"""
        if not self.connection_history:
            return {}
        
        latest = self.connection_history[-1]["analysis"]
        return {
            "total_connections": latest["total_connections"],
            "established": len(latest["established"]),
            "listening": len(latest["listening"]),
            "suspicious_count": len(latest["suspicious"]),
            "top_remote_ips": dict(sorted(latest["by_remote_ip"].items(), key=lambda x: x[1], reverse=True)[:5])
        }
    
    def get_traffic_summary(self) -> Dict:
        """获取流量摘要"""
        if not self.traffic_stats:
            return {}
        
        return {
            "total_sent": self.traffic_stats["total_bytes_sent"],
            "total_recv": self.traffic_stats["total_bytes_recv"],
            "interface_count": len(self.traffic_stats["interfaces"]),
            "anomalies": len(self.traffic_stats.get("anomalies", []))
        }

