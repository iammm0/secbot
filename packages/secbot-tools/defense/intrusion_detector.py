"""
入侵检测模块：检测网络攻击和入侵行为
"""
import re
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from collections import defaultdict
from utils.logger import logger


class IntrusionDetector:
    """入侵检测器：实时检测攻击行为"""
    
    def __init__(self):
        self.attack_patterns: Dict[str, List[str]] = {
            "port_scan": [
                r"Connection.*refused",
                r"Connection.*timeout",
                r"Too many connections"
            ],
            "brute_force": [
                r"Failed.*password",
                r"Authentication.*failed",
                r"Invalid.*credentials",
                r"Login.*failed"
            ],
            "sql_injection": [
                r"SQL.*syntax",
                r"mysql.*error",
                r"postgresql.*error",
                r"database.*error"
            ],
            "xss": [
                r"<script>",
                r"javascript:",
                r"onerror=",
                r"onload="
            ],
            "dos": [
                r"Too many requests",
                r"Rate limit",
                r"Connection.*flood"
            ],
            "malware": [
                r"cmd\.exe",
                r"/bin/sh",
                r"powershell.*-encodedcommand",
                r"eval\(.*\)"
            ]
        }
        
        self.detected_attacks: List[Dict] = []
        self.attack_counts: defaultdict = defaultdict(int)
        self.ip_reputation: Dict[str, Dict] = {}
    
    def detect_attack(self, source_ip: str, data: str, connection_info: Optional[Dict] = None) -> Optional[Dict]:
        """检测攻击"""
        detected = None
        
        for attack_type, patterns in self.attack_patterns.items():
            for pattern in patterns:
                if re.search(pattern, data, re.IGNORECASE):
                    detected = {
                        "type": attack_type,
                        "source_ip": source_ip,
                        "timestamp": datetime.now().isoformat(),
                        "pattern": pattern,
                        "severity": self._get_severity(attack_type),
                        "connection_info": connection_info,
                        "data_sample": data[:200]  # 限制长度
                    }
                    
                    self.detected_attacks.append(detected)
                    self.attack_counts[source_ip] += 1
                    
                    logger.warning(f"检测到 {attack_type} 攻击，来源: {source_ip}")
                    break
            
            if detected:
                break
        
        return detected
    
    def detect_port_scan(self, connection_logs: List[Dict]) -> List[Dict]:
        """检测端口扫描"""
        scans = []
        
        # 按源IP分组
        ip_ports = defaultdict(set)
        for log in connection_logs:
            if "source_ip" in log and "port" in log:
                ip_ports[log["source_ip"]].add(log["port"])
        
        # 检测扫描行为（短时间内访问多个端口）
        for ip, ports in ip_ports.items():
            if len(ports) > 10:  # 阈值
                scans.append({
                    "type": "Port Scan",
                    "source_ip": ip,
                    "ports_scanned": len(ports),
                    "ports": list(ports)[:20],  # 限制显示
                    "severity": "Medium",
                    "timestamp": datetime.now().isoformat()
                })
        
        return scans
    
    def detect_brute_force(self, failed_logins: List[Dict]) -> List[Dict]:
        """检测暴力破解"""
        brute_forces = []
        
        # 按IP和用户名分组
        ip_user_attempts = defaultdict(lambda: defaultdict(int))
        for login in failed_logins:
            ip = login.get("source_ip", "unknown")
            user = login.get("username", "unknown")
            ip_user_attempts[ip][user] += 1
        
        # 检测暴力破解（同一IP对同一用户多次失败登录）
        for ip, users in ip_user_attempts.items():
            for user, attempts in users.items():
                if attempts > 5:  # 阈值
                    brute_forces.append({
                        "type": "Brute Force",
                        "source_ip": ip,
                        "target_user": user,
                        "attempts": attempts,
                        "severity": "High",
                        "timestamp": datetime.now().isoformat()
                    })
        
        return brute_forces
    
    def detect_dos(self, request_logs: List[Dict], time_window: int = 60) -> List[Dict]:
        """检测DoS攻击"""
        dos_attacks = []
        
        # 按时间窗口和源IP统计请求
        now = datetime.now()
        window_start = now - timedelta(seconds=time_window)
        
        ip_requests = defaultdict(int)
        for log in request_logs:
            log_time = datetime.fromisoformat(log.get("timestamp", now.isoformat()))
            if log_time >= window_start:
                ip_requests[log.get("source_ip", "unknown")] += 1
        
        # 检测DoS（短时间内大量请求）
        for ip, count in ip_requests.items():
            if count > 100:  # 阈值：每分钟100个请求
                dos_attacks.append({
                    "type": "DoS",
                    "source_ip": ip,
                    "requests_per_minute": count,
                    "severity": "High",
                    "timestamp": datetime.now().isoformat()
                })
        
        return dos_attacks
    
    def update_ip_reputation(self, ip: str, attack_type: str, severity: str):
        """更新IP信誉"""
        if ip not in self.ip_reputation:
            self.ip_reputation[ip] = {
                "attack_count": 0,
                "attack_types": set(),
                "severity": "Low",
                "first_seen": datetime.now().isoformat(),
                "last_seen": datetime.now().isoformat()
            }
        
        self.ip_reputation[ip]["attack_count"] += 1
        self.ip_reputation[ip]["attack_types"].add(attack_type)
        self.ip_reputation[ip]["last_seen"] = datetime.now().isoformat()
        
        # 更新严重程度
        severity_levels = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}
        current_level = severity_levels.get(self.ip_reputation[ip]["severity"], 0)
        new_level = severity_levels.get(severity, 0)
        if new_level > current_level:
            self.ip_reputation[ip]["severity"] = severity
    
    def get_malicious_ips(self, min_attacks: int = 3) -> List[Dict]:
        """获取恶意IP列表"""
        malicious = []
        
        for ip, reputation in self.ip_reputation.items():
            if reputation["attack_count"] >= min_attacks:
                malicious.append({
                    "ip": ip,
                    "attack_count": reputation["attack_count"],
                    "attack_types": list(reputation["attack_types"]),
                    "severity": reputation["severity"],
                    "first_seen": reputation["first_seen"],
                    "last_seen": reputation["last_seen"]
                })
        
        return sorted(malicious, key=lambda x: x["attack_count"], reverse=True)
    
    def get_recent_attacks(self, hours: int = 24) -> List[Dict]:
        """获取最近的攻击"""
        cutoff = datetime.now() - timedelta(hours=hours)
        
        recent = [
            attack for attack in self.detected_attacks
            if datetime.fromisoformat(attack["timestamp"]) >= cutoff
        ]
        
        return sorted(recent, key=lambda x: x["timestamp"], reverse=True)
    
    def _get_severity(self, attack_type: str) -> str:
        """获取攻击严重程度"""
        severity_map = {
            "port_scan": "Low",
            "brute_force": "High",
            "sql_injection": "High",
            "xss": "Medium",
            "dos": "High",
            "malware": "Critical"
        }
        return severity_map.get(attack_type, "Medium")
    
    def get_statistics(self) -> Dict:
        """获取检测统计"""
        return {
            "total_attacks": len(self.detected_attacks),
            "malicious_ips": len(self.ip_reputation),
            "attack_types": {
                attack_type: sum(1 for a in self.detected_attacks if a["type"] == attack_type)
                for attack_type in self.attack_patterns.keys()
            },
            "top_attackers": dict(sorted(self.attack_counts.items(), key=lambda x: x[1], reverse=True)[:10])
        }

