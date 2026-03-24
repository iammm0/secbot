"""Web 技术栈识别工具：识别目标使用的 Web 框架、CMS、JS 库等"""
import asyncio
import re
from typing import Any, Dict, List
from tools.base import BaseTool, ToolResult


# 技术栈指纹库
TECH_SIGNATURES = {
    # Web 服务器
    "Nginx": {"server": ["nginx"]},
    "Apache": {"server": ["apache"]},
    "IIS": {"server": ["microsoft-iis"]},
    "LiteSpeed": {"server": ["litespeed"]},
    "Caddy": {"server": ["caddy"]},
    # 编程语言 / 运行时
    "PHP": {"headers": ["x-powered-by:php"], "body": [".php", "<?php"]},
    "Python": {"headers": ["x-powered-by:python", "x-powered-by:flask", "x-powered-by:django"]},
    "Node.js": {"headers": ["x-powered-by:express"], "body": ["node_modules"]},
    "ASP.NET": {"headers": ["x-aspnet-version", "x-powered-by:asp.net"], "cookies": ["asp.net_sessionid"]},
    "Java": {"headers": ["x-powered-by:servlet"], "cookies": ["jsessionid"]},
    "Ruby on Rails": {"headers": ["x-powered-by:phusion passenger"], "cookies": ["_rails_session"]},
    # CMS
    "WordPress": {"body": ["wp-content", "wp-includes", "wp-json"], "meta": ["generator.*wordpress"]},
    "Drupal": {"body": ["drupal.js", "sites/default"], "headers": ["x-drupal-cache", "x-generator:drupal"]},
    "Joomla": {"body": ["joomla", "/media/jui/"], "meta": ["generator.*joomla"]},
    "Ghost": {"body": ["ghost-"], "meta": ["generator.*ghost"]},
    "Hugo": {"meta": ["generator.*hugo"]},
    "Jekyll": {"meta": ["generator.*jekyll"]},
    # JS 框架
    "React": {"body": ["react", "__NEXT_DATA__", "_next/static", "react-root", "data-reactroot"]},
    "Vue.js": {"body": ["vue.js", "vue.min.js", "__vue__", "data-v-", "nuxt"]},
    "Angular": {"body": ["ng-version", "ng-app", "angular.js", "angular.min.js"]},
    "jQuery": {"body": ["jquery.js", "jquery.min.js", "jquery-"]},
    "Bootstrap": {"body": ["bootstrap.css", "bootstrap.min.css", "bootstrap.js"]},
    "Tailwind CSS": {"body": ["tailwind", "tw-"]},
    # 其他
    "Google Analytics": {"body": ["google-analytics.com", "ga.js", "gtag("]},
    "Cloudflare": {"body": ["cloudflare", "cf-ray"]},
    "reCAPTCHA": {"body": ["recaptcha", "g-recaptcha"]},
    "Socket.io": {"body": ["socket.io"]},
    "GraphQL": {"body": ["graphql", "__schema"]},
}


class TechDetectTool(BaseTool):
    """Web 技术栈识别工具：识别目标使用的服务器、框架、CMS、JS 库等"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="tech_detect",
            description="识别目标Web应用的技术栈（服务器、编程语言、CMS、前端框架、JS库等）。参数: url(目标URL)",
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

            def _fetch():
                req = urllib.request.Request(url)
                req.add_header("User-Agent", "Mozilla/5.0 (compatible; secbot-cli/1.0)")
                resp = urllib.request.urlopen(req, timeout=15)
                headers = dict(resp.headers)
                body = resp.read(50000).decode(errors="ignore")
                return headers, body

            headers, body = await loop.run_in_executor(None, _fetch)
            body_lower = body.lower()
            headers_lower = {k.lower(): v.lower() for k, v in headers.items()}

            detected: List[Dict] = []
            cookies_str = headers.get("Set-Cookie", "").lower()

            for tech, sigs in TECH_SIGNATURES.items():
                confidence = 0

                # Server 头
                server = headers_lower.get("server", "")
                for s in sigs.get("server", []):
                    if s in server:
                        confidence += 40

                # 响应头
                for h in sigs.get("headers", []):
                    if ":" in h:
                        hname, hval = h.split(":", 1)
                        if hname in headers_lower and hval in headers_lower[hname]:
                            confidence += 30
                    else:
                        if h in headers_lower:
                            confidence += 30

                # Cookie
                for c in sigs.get("cookies", []):
                    if c in cookies_str:
                        confidence += 25

                # 响应体
                for b in sigs.get("body", []):
                    if b.lower() in body_lower:
                        confidence += 20

                # Meta 标签
                for m in sigs.get("meta", []):
                    if re.search(m, body_lower):
                        confidence += 35

                if confidence > 0:
                    detected.append({
                        "technology": tech,
                        "confidence": min(confidence, 100),
                    })

            # 从 HTML 提取 meta generator
            generator_match = re.search(r'<meta[^>]*name=["\']generator["\'][^>]*content=["\']([^"\']+)', body, re.I)
            if generator_match:
                gen = generator_match.group(1)
                detected.append({"technology": f"Generator: {gen}", "confidence": 95})

            # 排序
            detected.sort(key=lambda x: x["confidence"], reverse=True)

            result = {
                "url": url,
                "server": headers.get("Server", "未知"),
                "powered_by": headers.get("X-Powered-By", "未知"),
                "detected_technologies": detected,
                "total_detected": len(detected),
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
