"""WAF/防火墙检测工具：识别目标是否部署了 Web 应用防火墙"""
import asyncio
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


# 常见 WAF 指纹
WAF_SIGNATURES = {
    "Cloudflare": {
        "headers": ["cf-ray", "cf-cache-status", "__cfduid", "cf-request-id"],
        "server": ["cloudflare"],
        "cookies": ["__cfduid", "__cf_bm"],
    },
    "AWS WAF / CloudFront": {
        "headers": ["x-amz-cf-id", "x-amz-cf-pop", "x-amzn-requestid"],
        "server": ["cloudfront", "amazons3"],
    },
    "Akamai": {
        "headers": ["x-akamai-transformed", "akamai-origin-hop"],
        "server": ["akamaighost"],
    },
    "Imperva / Incapsula": {
        "headers": ["x-iinfo", "x-cdn"],
        "cookies": ["incap_ses_", "visid_incap_"],
    },
    "F5 BIG-IP ASM": {
        "headers": ["x-wa-info"],
        "server": ["bigip"],
        "cookies": ["ts", "bigipserver"],
    },
    "ModSecurity": {
        "server": ["mod_security", "modsecurity"],
        "body_patterns": ["mod_security", "not acceptable", "406"],
    },
    "Sucuri": {
        "headers": ["x-sucuri-id", "x-sucuri-cache"],
        "server": ["sucuri"],
    },
    "Barracuda": {
        "headers": ["barra_counter_session"],
        "cookies": ["barra_counter_session"],
    },
    "阿里云 WAF": {
        "headers": ["ali-swift-global-savetime"],
        "cookies": ["aliyungf_tc"],
    },
    "腾讯云 WAF": {
        "headers": ["tencent-cloud"],
    },
    "Nginx (Rate Limiting)": {
        "body_patterns": ["503 service temporarily unavailable", "limit_req"],
    },
}


class WafDetectTool(BaseTool):
    """WAF 检测工具：识别目标部署的 Web 应用防火墙类型"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="waf_detect",
            description="检测目标Web服务是否部署了WAF防火墙（Cloudflare、AWS WAF、Akamai、ModSecurity等）。参数: url(目标URL)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        url = kwargs.get("url", "")
        if not url:
            return ToolResult(success=False, result=None, error="缺少参数: url")
        if not url.startswith("http"):
            url = f"http://{url}"

        try:
            import urllib.request
            import urllib.error

            loop = asyncio.get_event_loop()

            # 1. 正常请求
            def _normal_request():
                req = urllib.request.Request(url)
                req.add_header("User-Agent", "Mozilla/5.0")
                try:
                    resp = urllib.request.urlopen(req, timeout=10)
                    return dict(resp.headers), resp.read(5000).decode(errors="ignore"), resp.status
                except urllib.error.HTTPError as e:
                    return dict(e.headers), e.read(5000).decode(errors="ignore"), e.code
                except Exception as e:
                    return {}, str(e), 0

            # 2. 触发 WAF 的恶意请求
            def _malicious_request():
                evil_url = f"{url}/?id=1' OR '1'='1'--&<script>alert(1)</script>&cmd=cat /etc/passwd"
                req = urllib.request.Request(evil_url)
                req.add_header("User-Agent", "Mozilla/5.0")
                try:
                    resp = urllib.request.urlopen(req, timeout=10)
                    return dict(resp.headers), resp.read(5000).decode(errors="ignore"), resp.status
                except urllib.error.HTTPError as e:
                    return dict(e.headers), e.read(5000).decode(errors="ignore"), e.code
                except Exception as e:
                    return {}, str(e), 0

            normal_headers, normal_body, normal_status = await loop.run_in_executor(None, _normal_request)
            mal_headers, mal_body, mal_status = await loop.run_in_executor(None, _malicious_request)

            detected_wafs = []
            all_headers = {**normal_headers, **mal_headers}
            all_body = normal_body + mal_body

            # 获取 cookies
            cookies_str = all_headers.get("Set-Cookie", "") + all_headers.get("set-cookie", "")

            for waf_name, sigs in WAF_SIGNATURES.items():
                score = 0

                # 检查 Header 指纹
                for h in sigs.get("headers", []):
                    if any(h.lower() in k.lower() for k in all_headers):
                        score += 2

                # 检查 Server 头
                server = all_headers.get("Server", "").lower() + all_headers.get("server", "").lower()
                for s in sigs.get("server", []):
                    if s.lower() in server:
                        score += 3

                # 检查 Cookie
                for c in sigs.get("cookies", []):
                    if c.lower() in cookies_str.lower():
                        score += 2

                # 检查响应体
                for p in sigs.get("body_patterns", []):
                    if p.lower() in all_body.lower():
                        score += 1

                if score >= 2:
                    detected_wafs.append({
                        "waf": waf_name,
                        "confidence": min(score * 20, 100),
                    })

            # 分析 WAF 行为
            waf_behavior = {}
            if mal_status != normal_status:
                waf_behavior["status_code_change"] = f"{normal_status} -> {mal_status}"
            if mal_status in (403, 406, 429, 503):
                waf_behavior["blocking_detected"] = True
                waf_behavior["block_status"] = mal_status

            result = {
                "url": url,
                "waf_detected": len(detected_wafs) > 0 or waf_behavior.get("blocking_detected"),
                "detected_wafs": sorted(detected_wafs, key=lambda x: x["confidence"], reverse=True),
                "waf_behavior": waf_behavior,
                "server_header": normal_headers.get("Server", "未知"),
                "normal_status": normal_status,
                "malicious_status": mal_status,
            }

            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "url": {"type": "string", "description": "目标 URL", "required": True},
            },
        }
