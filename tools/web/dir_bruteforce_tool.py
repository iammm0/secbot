"""目录/路径枚举工具：暴力探测 Web 服务器上的隐藏目录和文件"""
import asyncio
from typing import Any, Dict, List
from tools.base import BaseTool, ToolResult


# 常见目录和文件字典
COMMON_PATHS = [
    # 管理面板
    "admin", "admin/", "administrator", "login", "wp-admin", "wp-login.php",
    "dashboard", "panel", "manager", "console", "cpanel",
    # 备份和配置
    ".env", ".git", ".git/config", ".gitignore", ".htaccess", ".htpasswd",
    "backup", "backup.zip", "backup.tar.gz", "backup.sql", "db.sql",
    "config", "config.php", "config.yml", "config.json", "settings.py",
    "web.config", "wp-config.php", "wp-config.php.bak",
    # API
    "api", "api/v1", "api/v2", "graphql", "swagger", "swagger-ui",
    "api-docs", "openapi.json", "swagger.json",
    # 常见路径
    "robots.txt", "sitemap.xml", "crossdomain.xml", "favicon.ico",
    ".well-known/security.txt", "security.txt", "humans.txt",
    # 开发/调试
    "debug", "test", "dev", "staging", "phpinfo.php", "info.php",
    "server-status", "server-info", "status", "health", "healthcheck",
    # 目录
    "upload", "uploads", "files", "images", "img", "assets", "static",
    "media", "tmp", "temp", "cache", "logs", "log",
    # 数据库
    "phpmyadmin", "pma", "adminer", "adminer.php",
    "mysql", "postgres", "redis", "mongo",
    # 其他
    "cgi-bin", "cgi-bin/", "bin", "includes", "include",
    "vendor", "node_modules", "bower_components",
    ".DS_Store", "Thumbs.db", ".svn", ".hg",
    "README", "README.md", "CHANGELOG", "LICENSE",
    "docker-compose.yml", "Dockerfile", "Makefile",
    "package.json", "composer.json", "Gemfile", "requirements.txt",
]


class DirBruteforceTool(BaseTool):
    """目录枚举工具：暴力探测 Web 服务上的隐藏路径和文件"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="dir_bruteforce",
            description="枚举Web服务器的隐藏目录和文件（管理面板、备份文件、配置文件、API端点等）。参数: url(目标URL), wordlist(自定义路径列表, 可选), extensions(扩展名列表如['.php','.bak'], 可选), threads(并发数, 默认20)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        url = kwargs.get("url", "").rstrip("/")
        if not url:
            return ToolResult(success=False, result=None, error="缺少参数: url")

        wordlist = kwargs.get("wordlist", COMMON_PATHS)
        extensions = kwargs.get("extensions", [])
        threads = int(kwargs.get("threads", 20))

        try:
            import urllib.request
            import urllib.error

            # 构建完整路径列表
            paths = list(wordlist)
            for ext in extensions:
                for w in wordlist:
                    if not w.endswith("/") and "." not in w:
                        paths.append(f"{w}{ext}")

            semaphore = asyncio.Semaphore(threads)
            loop = asyncio.get_event_loop()
            found: List[Dict] = []

            async def check_path(path: str):
                full_url = f"{url}/{path}"
                async with semaphore:
                    def _request():
                        try:
                            req = urllib.request.Request(full_url)
                            req.add_header("User-Agent", "Mozilla/5.0 (compatible; hackbot/1.0)")
                            resp = urllib.request.urlopen(req, timeout=8)
                            return resp.status, len(resp.read()), resp.headers.get("Content-Type", "")
                        except urllib.error.HTTPError as e:
                            return e.code, 0, ""
                        except Exception:
                            return None, 0, ""

                    status, size, ctype = await loop.run_in_executor(None, _request)
                    if status and status < 400:
                        found.append({
                            "path": f"/{path}",
                            "url": full_url,
                            "status": status,
                            "size": size,
                            "content_type": ctype,
                        })

            tasks = [check_path(p) for p in paths]
            await asyncio.gather(*tasks)

            # 按状态码排序
            found.sort(key=lambda x: (x["status"], x["path"]))

            return ToolResult(
                success=True,
                result={
                    "target": url,
                    "total_checked": len(paths),
                    "found_count": len(found),
                    "found_paths": found,
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
                "url": {"type": "string", "description": "目标 URL（如 http://example.com）", "required": True},
                "wordlist": {"type": "array", "description": "自定义路径列表"},
                "extensions": {"type": "array", "description": "扩展名列表（如 ['.php', '.bak']）"},
                "threads": {"type": "integer", "description": "并发数", "default": 20},
            },
        }
