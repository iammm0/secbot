"""HTTP 安全头分析工具：全面评估 Web 应用的 HTTP 安全头配置"""
import asyncio
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


# 安全头评估标准
SECURITY_HEADERS = {
    "Strict-Transport-Security": {
        "description": "HSTS：强制 HTTPS 连接",
        "severity": "HIGH",
        "recommendation": "添加 Strict-Transport-Security: max-age=31536000; includeSubDomains; preload",
    },
    "Content-Security-Policy": {
        "description": "CSP：防止 XSS 和数据注入",
        "severity": "HIGH",
        "recommendation": "配置 Content-Security-Policy 限制资源加载来源",
    },
    "X-Frame-Options": {
        "description": "防止点击劫持",
        "severity": "MEDIUM",
        "recommendation": "添加 X-Frame-Options: DENY 或 SAMEORIGIN",
    },
    "X-Content-Type-Options": {
        "description": "防止 MIME 类型嗅探",
        "severity": "MEDIUM",
        "recommendation": "添加 X-Content-Type-Options: nosniff",
    },
    "X-XSS-Protection": {
        "description": "浏览器 XSS 过滤器",
        "severity": "LOW",
        "recommendation": "添加 X-XSS-Protection: 1; mode=block",
    },
    "Referrer-Policy": {
        "description": "控制 Referer 头泄露",
        "severity": "LOW",
        "recommendation": "添加 Referrer-Policy: strict-origin-when-cross-origin",
    },
    "Permissions-Policy": {
        "description": "限制浏览器功能权限（摄像头、麦克风等）",
        "severity": "LOW",
        "recommendation": "添加 Permissions-Policy 限制不必要的浏览器功能",
    },
    "Cross-Origin-Opener-Policy": {
        "description": "隔离跨域窗口",
        "severity": "LOW",
        "recommendation": "添加 Cross-Origin-Opener-Policy: same-origin",
    },
    "Cross-Origin-Resource-Policy": {
        "description": "限制跨域资源加载",
        "severity": "LOW",
        "recommendation": "添加 Cross-Origin-Resource-Policy: same-origin",
    },
    "Cross-Origin-Embedder-Policy": {
        "description": "控制嵌入跨域资源",
        "severity": "LOW",
        "recommendation": "添加 Cross-Origin-Embedder-Policy: require-corp",
    },
}

# 应该移除的不安全头
INSECURE_HEADERS = {
    "Server": "泄露服务器版本信息",
    "X-Powered-By": "泄露后端技术栈信息",
    "X-AspNet-Version": "泄露 ASP.NET 版本",
    "X-AspNetMvc-Version": "泄露 ASP.NET MVC 版本",
}


class HeaderAnalyzeTool(BaseTool):
    """HTTP 安全头分析工具：全面评估 HTTP 安全头配置并给出改进建议"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="header_analyze",
            description="分析目标Web应用的HTTP安全头配置（HSTS、CSP、X-Frame-Options等），给出安全评分和改进建议。参数: url(目标URL)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        url = kwargs.get("url", "")
        if not url:
            return ToolResult(success=False, result=None, error="缺少参数: url")
        if not url.startswith("http"):
            url = f"https://{url}"

        try:
            import urllib.request
            import urllib.error

            loop = asyncio.get_event_loop()

            def _fetch():
                req = urllib.request.Request(url)
                req.add_header("User-Agent", "Mozilla/5.0")
                resp = urllib.request.urlopen(req, timeout=15)
                return dict(resp.headers), resp.status

            headers, status = await loop.run_in_executor(None, _fetch)
            headers_lower = {k.lower(): v for k, v in headers.items()}

            present = []
            missing = []
            score = 100

            # 检查安全头
            for header, info in SECURITY_HEADERS.items():
                value = headers_lower.get(header.lower())
                if value:
                    entry = {
                        "header": header,
                        "value": value,
                        "status": "present",
                        "description": info["description"],
                    }
                    # 检查配置是否足够
                    warnings = self._check_header_quality(header, value)
                    if warnings:
                        entry["warnings"] = warnings
                        score -= 2
                    present.append(entry)
                else:
                    missing.append({
                        "header": header,
                        "status": "missing",
                        "severity": info["severity"],
                        "description": info["description"],
                        "recommendation": info["recommendation"],
                    })
                    # 扣分
                    penalty = {"HIGH": 15, "MEDIUM": 10, "LOW": 5}.get(info["severity"], 5)
                    score -= penalty

            # 检查泄露信息的头
            info_leaks = []
            for header, reason in INSECURE_HEADERS.items():
                value = headers_lower.get(header.lower())
                if value:
                    info_leaks.append({
                        "header": header,
                        "value": value,
                        "risk": reason,
                    })
                    score -= 3

            score = max(0, score)
            grade = "A+" if score >= 95 else "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 50 else "D" if score >= 30 else "F"

            result = {
                "url": url,
                "status_code": status,
                "score": score,
                "grade": grade,
                "present_headers": present,
                "missing_headers": sorted(missing, key=lambda x: {"HIGH": 0, "MEDIUM": 1, "LOW": 2}.get(x["severity"], 3)),
                "information_leaks": info_leaks,
                "all_headers": headers,
            }

            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def _check_header_quality(self, header: str, value: str) -> list:
        """检查安全头配置质量"""
        warnings = []
        hl = header.lower()

        if hl == "strict-transport-security":
            if "max-age=0" in value:
                warnings.append("max-age=0 实际等于禁用了 HSTS")
            elif "max-age" in value:
                try:
                    age = int(value.split("max-age=")[1].split(";")[0].strip())
                    if age < 31536000:
                        warnings.append(f"max-age={age} 不足一年，建议至少 31536000")
                except (ValueError, IndexError):
                    pass
            if "includesubdomains" not in value.lower():
                warnings.append("建议添加 includeSubDomains")

        elif hl == "content-security-policy":
            if "unsafe-inline" in value.lower():
                warnings.append("包含 unsafe-inline，可能不安全")
            if "unsafe-eval" in value.lower():
                warnings.append("包含 unsafe-eval，可能不安全")

        elif hl == "x-frame-options":
            if value.upper() not in ("DENY", "SAMEORIGIN"):
                warnings.append(f"不标准的值: {value}")

        return warnings

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "url": {"type": "string", "description": "目标 URL", "required": True},
            },
        }
