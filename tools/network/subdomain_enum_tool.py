"""子域名枚举工具：枚举目标域名的子域名"""
import asyncio
import socket
from typing import Any, Dict, List
from tools.base import BaseTool, ToolResult


# 常见子域名字典
COMMON_SUBDOMAINS = [
    "www", "mail", "ftp", "smtp", "pop", "imap", "webmail",
    "admin", "portal", "api", "dev", "staging", "test", "beta",
    "blog", "shop", "store", "m", "mobile", "app", "cdn",
    "ns1", "ns2", "dns", "dns1", "dns2", "mx", "mx1", "mx2",
    "vpn", "remote", "gateway", "proxy", "ssh", "git", "gitlab",
    "jenkins", "ci", "jira", "confluence", "wiki", "docs",
    "monitor", "grafana", "prometheus", "kibana", "elastic",
    "db", "database", "mysql", "postgres", "redis", "mongo",
    "backup", "bak", "old", "new", "v2", "v3",
    "static", "assets", "img", "images", "media", "files",
    "auth", "login", "sso", "oauth", "id", "accounts",
    "help", "support", "status", "health", "internal",
    "office", "exchange", "autodiscover", "owa",
    "s3", "aws", "cloud", "storage", "bucket",
]


class SubdomainEnumTool(BaseTool):
    """子域名枚举工具：通过字典和 DNS 查询发现子域名"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="subdomain_enum",
            description="枚举目标域名的子域名（基于字典暴力解析 + DNS 查询）。参数: domain(目标域名), wordlist(自定义子域名列表, 可选)",
        )

    async def _resolve(self, subdomain: str) -> Dict:
        """解析单个子域名"""
        try:
            loop = asyncio.get_event_loop()
            ip = await loop.run_in_executor(None, socket.gethostbyname, subdomain)
            return {"subdomain": subdomain, "ip": ip, "alive": True}
        except socket.gaierror:
            return {"subdomain": subdomain, "ip": None, "alive": False}

    async def execute(self, **kwargs) -> ToolResult:
        domain = kwargs.get("domain", "")
        if not domain:
            return ToolResult(success=False, result=None, error="缺少参数: domain")

        custom_wordlist = kwargs.get("wordlist", [])
        wordlist = custom_wordlist if custom_wordlist else COMMON_SUBDOMAINS

        try:
            subdomains_to_check = [f"{w}.{domain}" for w in wordlist]

            # 并发解析（限制并发数）
            semaphore = asyncio.Semaphore(50)

            async def limited_resolve(sub):
                async with semaphore:
                    return await self._resolve(sub)

            tasks = [limited_resolve(s) for s in subdomains_to_check]
            results = await asyncio.gather(*tasks)

            found = [r for r in results if r["alive"]]

            return ToolResult(
                success=True,
                result={
                    "domain": domain,
                    "total_checked": len(results),
                    "found_count": len(found),
                    "subdomains": found,
                },
            )
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "domain": {"type": "string", "description": "目标域名", "required": True},
                "wordlist": {"type": "array", "description": "自定义子域名列表（可选）"},
            },
        }
