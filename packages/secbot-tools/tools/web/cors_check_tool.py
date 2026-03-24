"""CORS 配置检查工具：检测跨域资源共享的安全性"""
import asyncio
from typing import Any, Dict, List
from tools.base import BaseTool, ToolResult


class CorsCheckTool(BaseTool):
    """CORS 检查工具：检测目标的跨域资源共享配置是否安全"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="cors_check",
            description="检查目标Web应用的CORS跨域配置安全性（是否允许任意来源、是否暴露敏感头等）。参数: url(目标URL), test_origins(自定义测试来源列表, 可选)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        url = kwargs.get("url", "")
        if not url:
            return ToolResult(success=False, result=None, error="缺少参数: url")
        if not url.startswith("http"):
            url = f"http://{url}"

        custom_origins = kwargs.get("test_origins", [])

        try:
            import urllib.request
            import urllib.error

            loop = asyncio.get_event_loop()

            # 测试来源
            test_origins = [
                "https://evil.com",
                "https://attacker.example.com",
                "null",
            ] + custom_origins

            # 提取目标域名
            from urllib.parse import urlparse
            parsed = urlparse(url)
            target_origin = f"{parsed.scheme}://{parsed.netloc}"
            test_origins.insert(0, target_origin)

            results: List[Dict] = []
            vulnerabilities: List[str] = []

            for origin in test_origins:
                def _check(test_origin=origin):
                    req = urllib.request.Request(url, method="OPTIONS")
                    req.add_header("User-Agent", "Mozilla/5.0")
                    req.add_header("Origin", test_origin)
                    req.add_header("Access-Control-Request-Method", "GET")
                    req.add_header("Access-Control-Request-Headers", "Authorization, Content-Type")
                    try:
                        resp = urllib.request.urlopen(req, timeout=10)
                        return dict(resp.headers), resp.status
                    except urllib.error.HTTPError as e:
                        return dict(e.headers), e.code
                    except Exception:
                        # 也试 GET
                        try:
                            req2 = urllib.request.Request(url)
                            req2.add_header("Origin", test_origin)
                            resp2 = urllib.request.urlopen(req2, timeout=10)
                            return dict(resp2.headers), resp2.status
                        except urllib.error.HTTPError as e2:
                            return dict(e2.headers), e2.code
                        except Exception:
                            return {}, 0

                headers, status = await loop.run_in_executor(None, _check)

                acao = headers.get("Access-Control-Allow-Origin", "")
                acac = headers.get("Access-Control-Allow-Credentials", "")
                acam = headers.get("Access-Control-Allow-Methods", "")
                acah = headers.get("Access-Control-Allow-Headers", "")
                aceh = headers.get("Access-Control-Expose-Headers", "")

                entry = {
                    "test_origin": origin,
                    "status": status,
                    "allow_origin": acao,
                    "allow_credentials": acac,
                    "allow_methods": acam,
                    "allow_headers": acah,
                    "expose_headers": aceh,
                }
                results.append(entry)

            # 漏洞分析
            for r in results:
                acao = r["allow_origin"]
                acac = r["allow_credentials"]
                origin = r["test_origin"]

                if acao == "*":
                    vulnerabilities.append("允许任意来源 (Access-Control-Allow-Origin: *)")
                    if acac.lower() == "true":
                        vulnerabilities.append("严重: 允许任意来源 + 允许携带凭证")

                if acao and acao == origin and origin in ("https://evil.com", "https://attacker.example.com", "null"):
                    vulnerabilities.append(f"危险: 反射了恶意来源 {origin}")
                    if acac.lower() == "true":
                        vulnerabilities.append(f"严重: 反射恶意来源 {origin} + 允许凭证")

                if acao == "null":
                    vulnerabilities.append("允许 null 来源（可被 data: / sandboxed iframe 利用）")

            # 去重
            vulnerabilities = list(set(vulnerabilities))

            # 风险评级
            if any("严重" in v for v in vulnerabilities):
                risk = "CRITICAL"
            elif any("危险" in v for v in vulnerabilities):
                risk = "HIGH"
            elif vulnerabilities:
                risk = "MEDIUM"
            else:
                risk = "LOW"

            result = {
                "url": url,
                "cors_enabled": any(r["allow_origin"] for r in results),
                "risk_level": risk,
                "vulnerabilities": vulnerabilities,
                "test_results": results,
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
                "test_origins": {"type": "array", "description": "自定义测试来源列表"},
            },
        }
