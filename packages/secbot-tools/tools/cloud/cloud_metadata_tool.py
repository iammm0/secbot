"""云元数据探测工具：检测云环境元数据端点是否可访问（SSRF 风险评估）"""
import asyncio
from typing import Any, Dict, List
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from tools.base import BaseTool, ToolResult


# 云厂商元数据端点
METADATA_ENDPOINTS = {
    "AWS": {
        "url": "http://169.254.169.254/latest/meta-data/",
        "token_url": "http://169.254.169.254/latest/api/token",
        "description": "AWS EC2 Instance Metadata Service (IMDSv1/v2)",
    },
    "GCP": {
        "url": "http://metadata.google.internal/computeMetadata/v1/",
        "headers": {"Metadata-Flavor": "Google"},
        "description": "Google Cloud Compute Engine Metadata",
    },
    "Azure": {
        "url": "http://169.254.169.254/metadata/instance?api-version=2021-02-01",
        "headers": {"Metadata": "true"},
        "description": "Azure Instance Metadata Service",
    },
    "DigitalOcean": {
        "url": "http://169.254.169.254/metadata/v1/",
        "description": "DigitalOcean Droplet Metadata",
    },
    "Alibaba": {
        "url": "http://100.100.100.200/latest/meta-data/",
        "description": "阿里云 ECS 实例元数据",
    },
    "Tencent": {
        "url": "http://metadata.tencentyun.com/latest/meta-data/",
        "description": "腾讯云 CVM 实例元数据",
    },
}


class CloudMetadataTool(BaseTool):
    """云元数据探测工具"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="cloud_metadata_detect",
            description=(
                "检测当前环境或目标是否可访问云元数据端点（AWS/GCP/Azure/阿里云/腾讯云等），"
                "评估 SSRF 攻击风险。参数: target(可选,指定要测试的 URL,默认测试本机), "
                "providers(可选,指定要测试的云厂商列表)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        target = kwargs.get("target", "").strip()
        providers = kwargs.get("providers", list(METADATA_ENDPOINTS.keys()))

        if isinstance(providers, str):
            providers = [providers]

        loop = asyncio.get_event_loop()
        results = []

        for provider in providers:
            if provider not in METADATA_ENDPOINTS:
                continue
            endpoint = METADATA_ENDPOINTS[provider]
            url = endpoint["url"]
            headers = endpoint.get("headers", {})

            try:
                def _check(u=url, h=headers):
                    req = Request(u)
                    for k, v in h.items():
                        req.add_header(k, v)
                    req.add_header("User-Agent", "HackBot/1.0")
                    with urlopen(req, timeout=3) as resp:
                        body = resp.read().decode(errors="ignore")[:1000]
                        return {
                            "status": resp.status,
                            "body_preview": body,
                            "headers": dict(resp.headers),
                        }

                resp_info = await loop.run_in_executor(None, _check)
                results.append({
                    "provider": provider,
                    "endpoint": url,
                    "description": endpoint["description"],
                    "accessible": True,
                    "status_code": resp_info["status"],
                    "response_preview": resp_info["body_preview"],
                    "risk": "high",
                })

            except (URLError, HTTPError, OSError, TimeoutError):
                results.append({
                    "provider": provider,
                    "endpoint": url,
                    "description": endpoint["description"],
                    "accessible": False,
                    "risk": "none",
                })
            except Exception:
                results.append({
                    "provider": provider,
                    "endpoint": url,
                    "accessible": False,
                    "risk": "none",
                })

        accessible = [r for r in results if r["accessible"]]

        return ToolResult(
            success=True,
            result={
                "target": target or "localhost",
                "providers_tested": len(results),
                "accessible_endpoints": len(accessible),
                "risk_level": "high" if accessible else "low",
                "findings": results,
                "recommendation": (
                    "检测到可访问的云元数据端点！建议：1) 启用 IMDSv2 (AWS) 2) 限制网络访问 3) 检查 SSRF 漏洞"
                    if accessible else "未检测到可访问的云元数据端点"
                ),
            },
        )

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "target": {"type": "string", "description": "测试目标（可选，默认本机）", "required": False},
                "providers": {
                    "type": "array",
                    "description": f"要测试的云厂商列表（可选，默认全部）: {list(METADATA_ENDPOINTS.keys())}",
                    "required": False,
                },
            },
        }
