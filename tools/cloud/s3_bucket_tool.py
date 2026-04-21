"""S3 存储桶枚举工具：枚举公开的 S3 存储桶并检查权限"""
import asyncio
from typing import Any, Dict
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from tools.base import BaseTool, ToolResult


# 常见桶名后缀
DEFAULT_SUFFIXES = [
    "", "-backup", "-bak", "-dev", "-staging", "-prod", "-production",
    "-assets", "-static", "-media", "-uploads", "-data", "-logs",
    "-private", "-public", "-internal", "-test", "-tmp", "-temp",
    "-archive", "-old", "-config", "-db", "-database", "-files",
    "-www", "-web", "-api", "-cdn", "-img", "-images",
]


class S3BucketEnumTool(BaseTool):
    """S3 存储桶枚举工具"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="s3_bucket_enum",
            description=(
                "枚举公开的 AWS S3 存储桶，检查是否存在未授权的列目录或读取权限。"
                "参数: keyword(用于生成桶名猜测的关键词), wordlist(自定义桶名后缀列表,可选)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        keyword = kwargs.get("keyword", "").strip()
        wordlist = kwargs.get("wordlist", DEFAULT_SUFFIXES)

        if not keyword:
            return ToolResult(success=False, result=None, error="缺少参数: keyword（用于生成桶名）")

        loop = asyncio.get_event_loop()

        # 生成桶名列表
        bucket_names = set()
        for suffix in wordlist:
            bucket_names.add(f"{keyword}{suffix}")
            bucket_names.add(f"{keyword.lower()}{suffix}")
            # 也试带点号的格式
            if "." not in keyword:
                bucket_names.add(f"{keyword}.{suffix.lstrip('-')}" if suffix else keyword)

        bucket_names = sorted(bucket_names)
        results = []

        # 并发检查（限制并发数）
        semaphore = asyncio.Semaphore(10)

        async def check_bucket(name):
            async with semaphore:
                return await loop.run_in_executor(None, self._check_bucket, name)

        tasks = [check_bucket(name) for name in bucket_names[:100]]
        check_results = await asyncio.gather(*tasks, return_exceptions=True)

        for r in check_results:
            if isinstance(r, dict):
                results.append(r)

        found = [r for r in results if r.get("exists")]
        accessible = [r for r in results if r.get("list_accessible")]

        return ToolResult(
            success=True,
            result={
                "keyword": keyword,
                "buckets_tested": len(bucket_names),
                "buckets_found": len(found),
                "buckets_accessible": len(accessible),
                "risk_level": "high" if accessible else ("medium" if found else "low"),
                "details": results[:50],
            },
        )

    def _check_bucket(self, bucket_name: str) -> Dict:
        """检查单个 S3 桶"""
        url = f"https://{bucket_name}.s3.amazonaws.com/"
        result = {
            "bucket": bucket_name,
            "url": url,
            "exists": False,
            "list_accessible": False,
            "status_code": None,
        }

        try:
            req = Request(url)
            req.add_header("User-Agent", "Mozilla/5.0 (HackBot)")
            with urlopen(req, timeout=5) as resp:
                body = resp.read().decode(errors="ignore")[:1000]
                result["exists"] = True
                result["status_code"] = resp.status

                # 检查是否返回了 XML ListBucket 结果
                if "<ListBucketResult" in body or "<Contents>" in body:
                    result["list_accessible"] = True
                    result["risk"] = "high"
                    result["finding"] = "存储桶可列目录（未授权访问）"
                    result["preview"] = body[:500]
                else:
                    result["finding"] = "存储桶存在但需要认证"

        except HTTPError as e:
            result["status_code"] = e.code
            if e.code == 403:
                result["exists"] = True
                result["finding"] = "存储桶存在（403 Forbidden）"
            elif e.code == 404:
                result["exists"] = False
            elif e.code == 301:
                result["exists"] = True
                result["finding"] = "存储桶存在（区域重定向）"
        except (URLError, OSError, TimeoutError):
            pass

        return result

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "keyword": {"type": "string", "description": "关键词（用于生成桶名猜测）", "required": True},
                "wordlist": {"type": "array", "description": "自定义桶名后缀列表（可选）", "required": False},
            },
        }
