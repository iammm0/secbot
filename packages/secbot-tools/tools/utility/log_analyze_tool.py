"""日志分析工具：分析系统/应用日志中的安全相关事件"""
import re
from pathlib import Path
from typing import Any, Dict, List
from collections import Counter, defaultdict
from tools.base import BaseTool, ToolResult


# 日志中常见的安全相关模式
SECURITY_PATTERNS = {
    "failed_login": re.compile(r"(?i)(failed|invalid|wrong).*(login|password|auth|credential)", re.IGNORECASE),
    "brute_force": re.compile(r"(?i)(too many|rate limit|max.*attempt|repeated.*fail)", re.IGNORECASE),
    "sql_injection": re.compile(r"(?i)(sql.*syntax|union.*select|drop.*table|or.*1\s*=\s*1)", re.IGNORECASE),
    "xss_attempt": re.compile(r"(?i)(<script|javascript:|onerror\s*=|onload\s*=)", re.IGNORECASE),
    "path_traversal": re.compile(r"(\.\./|\.\.\\|%2e%2e)", re.IGNORECASE),
    "command_injection": re.compile(r"(?i)(;.*cat|;.*ls|;.*wget|;.*curl|\|.*sh|\$\()", re.IGNORECASE),
    "error": re.compile(r"(?i)(error|exception|traceback|panic|fatal|critical)", re.IGNORECASE),
    "warning": re.compile(r"(?i)(warning|warn|deprecated)", re.IGNORECASE),
    "suspicious_ip": re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
    "sensitive_file": re.compile(r"(?i)(/etc/passwd|/etc/shadow|\.env|\.git|wp-config|\.htaccess)"),
}


class LogAnalyzeTool(BaseTool):
    """日志分析工具：分析日志文件中的安全事件、异常模式、统计信息"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="log_analyze",
            description="分析日志文件中的安全事件（失败登录、攻击特征、异常访问等）。参数: path(日志文件路径), lines(分析最近N行, 默认1000), pattern(自定义正则匹配), log_text(直接传入日志文本)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        file_path = kwargs.get("path")
        lines_limit = int(kwargs.get("lines", 1000))
        custom_pattern = kwargs.get("pattern")
        log_text = kwargs.get("log_text")

        try:
            # 获取日志内容
            if log_text:
                log_lines = log_text.split("\n")
            elif file_path:
                p = Path(file_path)
                if not p.exists():
                    return ToolResult(success=False, result=None, error=f"文件不存在: {file_path}")
                with open(p, "r", errors="ignore") as f:
                    all_lines = f.readlines()
                    log_lines = all_lines[-lines_limit:]
            else:
                return ToolResult(success=False, result=None, error="需要 path 或 log_text 参数")

            result = self._analyze_lines(log_lines, custom_pattern)
            result["source"] = file_path or "(inline text)"
            result["total_lines_analyzed"] = len(log_lines)

            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def _analyze_lines(self, lines: List[str], custom_pattern: str = None) -> Dict:
        """分析日志行"""
        findings: Dict[str, List] = defaultdict(list)
        ip_counter = Counter()
        severity_counter = Counter()
        timeline = defaultdict(int)

        for i, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue

            # 检查安全模式
            for pattern_name, regex in SECURITY_PATTERNS.items():
                if regex.search(line):
                    if len(findings[pattern_name]) < 20:  # 限制每种最多 20 条
                        findings[pattern_name].append({
                            "line_no": i,
                            "content": line[:300],
                        })

                    # 提取 IP
                    if pattern_name == "suspicious_ip":
                        ips = re.findall(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b", line)
                        for ip in ips:
                            ip_counter[ip] += 1

                    # 统计严重级别
                    if pattern_name in ("sql_injection", "xss_attempt", "command_injection", "path_traversal"):
                        severity_counter["HIGH"] += 1
                    elif pattern_name in ("failed_login", "brute_force", "sensitive_file"):
                        severity_counter["MEDIUM"] += 1
                    elif pattern_name in ("error",):
                        severity_counter["LOW"] += 1

            # 自定义模式
            if custom_pattern:
                try:
                    if re.search(custom_pattern, line, re.IGNORECASE):
                        findings.setdefault("custom_match", [])
                        if len(findings["custom_match"]) < 50:
                            findings["custom_match"].append({
                                "line_no": i,
                                "content": line[:300],
                            })
                except re.error:
                    pass

        # 汇总
        summary = {
            "security_events": {k: len(v) for k, v in findings.items()},
            "severity_distribution": dict(severity_counter),
            "top_ips": ip_counter.most_common(20),
            "total_security_events": sum(len(v) for v in findings.values()),
        }

        # 风险评级
        total_high = severity_counter.get("HIGH", 0)
        total_medium = severity_counter.get("MEDIUM", 0)
        if total_high > 10:
            summary["risk_level"] = "CRITICAL"
        elif total_high > 0:
            summary["risk_level"] = "HIGH"
        elif total_medium > 5:
            summary["risk_level"] = "MEDIUM"
        elif total_medium > 0:
            summary["risk_level"] = "LOW"
        else:
            summary["risk_level"] = "NONE"

        return {
            "summary": summary,
            "findings": {k: v for k, v in findings.items()},
        }

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "path": {"type": "string", "description": "日志文件路径"},
                "lines": {"type": "integer", "description": "分析最近 N 行", "default": 1000},
                "pattern": {"type": "string", "description": "自定义正则匹配"},
                "log_text": {"type": "string", "description": "直接传入日志文本"},
            },
        }
