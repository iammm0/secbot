"""
通用 REST API 客户端工具：支持自定义请求与内置常用 API 模板
"""
import json
from typing import Any, Dict, Optional
from tools.base import BaseTool, ToolResult
from utils.logger import logger


# 内置 API 模板
API_PRESETS: Dict[str, Dict[str, Any]] = {
    "weather": {
        "name": "天气查询 (wttr.in)",
        "url_template": "https://wttr.in/{query}?format=j1",
        "method": "GET",
        "headers": {"Accept": "application/json"},
        "description": "查询城市天气信息，query 为城市名（支持中英文）",
    },
    "ip_info": {
        "name": "IP 信息查询 (ip-api.com)",
        "url_template": "http://ip-api.com/json/{query}?lang=zh-CN",
        "method": "GET",
        "headers": {},
        "description": "查询 IP 地址的地理位置等信息，query 为 IP 地址",
    },
    "ip_self": {
        "name": "本机公网 IP (httpbin.org)",
        "url_template": "https://httpbin.org/ip",
        "method": "GET",
        "headers": {},
        "description": "获取本机的公网 IP 地址",
    },
    "github_user": {
        "name": "GitHub 用户信息",
        "url_template": "https://api.github.com/users/{query}",
        "method": "GET",
        "headers": {"Accept": "application/vnd.github.v3+json"},
        "description": "查询 GitHub 用户公开信息，query 为用户名",
    },
    "github_repo": {
        "name": "GitHub 仓库信息",
        "url_template": "https://api.github.com/repos/{query}",
        "method": "GET",
        "headers": {"Accept": "application/vnd.github.v3+json"},
        "description": "查询 GitHub 仓库信息，query 为 owner/repo 格式",
    },
    "exchange_rate": {
        "name": "汇率查询 (open.er-api.com)",
        "url_template": "https://open.er-api.com/v6/latest/{query}",
        "method": "GET",
        "headers": {},
        "description": "查询货币汇率，query 为基础货币代码如 USD/CNY/EUR",
    },
    "random_fact": {
        "name": "随机趣闻 (uselessfacts.jsph.pl)",
        "url_template": "https://uselessfacts.jsph.pl/api/v2/facts/random?language=en",
        "method": "GET",
        "headers": {},
        "description": "获取一条随机英文趣闻",
    },
    "country_info": {
        "name": "国家信息 (restcountries.com)",
        "url_template": "https://restcountries.com/v3.1/name/{query}",
        "method": "GET",
        "headers": {},
        "description": "查询国家信息，query 为国家名称（英文）",
    },
    "dns_resolve": {
        "name": "DNS 解析 (dns.google)",
        "url_template": "https://dns.google/resolve?name={query}&type=A",
        "method": "GET",
        "headers": {},
        "description": "使用 Google DNS 解析域名，query 为域名",
    },
    "url_shorten": {
        "name": "URL 缩短检查 (unshorten.me)",
        "url_template": "https://unshorten.me/json/{query}",
        "method": "GET",
        "headers": {},
        "description": "展开短链接，query 为完整短链接 URL",
    },
}


class ApiClientTool(BaseTool):
    """通用 REST API 客户端：支持自定义请求和内置 API 模板"""

    sensitivity = "low"

    def __init__(self):
        preset_list = ", ".join(f"{k}({v['name']})" for k, v in API_PRESETS.items())
        super().__init__(
            name="api_client",
            description=(
                "通用REST API客户端，可发送HTTP请求并解析JSON响应。"
                "支持两种用法: (1) 自定义请求: 指定url/method/headers/body; "
                "(2) 内置模板: 指定preset和query即可快速调用常用API。"
                f"可用模板: {preset_list}。"
                "参数: url(自定义URL), method(GET/POST等,默认GET), headers(请求头dict), "
                "params(query参数dict), body(请求体), "
                "auth_type(none/bearer/api_key), auth_value(认证值), "
                "preset(模板名), query(模板查询参数)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        preset = kwargs.get("preset", "").strip()
        query = kwargs.get("query", "").strip()

        # 模式 1: 使用内置模板
        if preset:
            return await self._execute_preset(preset, query, kwargs)

        # 模式 2: 自定义请求
        url = kwargs.get("url", "").strip()
        if not url:
            # 列出可用模板
            presets_info = []
            for key, val in API_PRESETS.items():
                presets_info.append({
                    "preset": key,
                    "name": val["name"],
                    "description": val["description"],
                })
            return ToolResult(
                success=True,
                result={
                    "message": "未指定 url 或 preset，以下是可用的内置 API 模板:",
                    "presets": presets_info,
                },
            )

        return await self._execute_custom(url, kwargs)

    # ------------------------------------------------------------------
    # 模板请求
    # ------------------------------------------------------------------

    async def _execute_preset(self, preset: str, query: str, kwargs: dict) -> ToolResult:
        """执行内置模板请求"""
        if preset not in API_PRESETS:
            available = ", ".join(API_PRESETS.keys())
            return ToolResult(
                success=False, result=None,
                error=f"未知模板: {preset}，可用模板: {available}",
            )

        config = API_PRESETS[preset]
        url = config["url_template"].format(query=query) if query else config["url_template"]
        method = config.get("method", "GET")
        headers = dict(config.get("headers", {}))

        # 支持额外 headers 和 auth
        extra_headers = kwargs.get("headers", {})
        if isinstance(extra_headers, dict):
            headers.update(extra_headers)

        auth_type = kwargs.get("auth_type", "none").strip().lower()
        auth_value = kwargs.get("auth_value", "").strip()
        headers = self._apply_auth(headers, auth_type, auth_value)

        return await self._do_request(url, method, headers, params=None, body=None, preset_name=config["name"])

    # ------------------------------------------------------------------
    # 自定义请求
    # ------------------------------------------------------------------

    async def _execute_custom(self, url: str, kwargs: dict) -> ToolResult:
        """执行自定义 API 请求"""
        method = kwargs.get("method", "GET").upper()
        headers = kwargs.get("headers", {})
        if isinstance(headers, str):
            try:
                headers = json.loads(headers)
            except json.JSONDecodeError:
                headers = {}
        params = kwargs.get("params", {})
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except json.JSONDecodeError:
                params = {}
        body = kwargs.get("body")

        auth_type = kwargs.get("auth_type", "none").strip().lower()
        auth_value = kwargs.get("auth_value", "").strip()
        headers = self._apply_auth(headers, auth_type, auth_value)

        return await self._do_request(url, method, headers, params, body)

    # ------------------------------------------------------------------
    # 核心请求
    # ------------------------------------------------------------------

    async def _do_request(
        self,
        url: str,
        method: str,
        headers: dict,
        params: Optional[dict],
        body: Any,
        preset_name: str = "",
    ) -> ToolResult:
        """发送 HTTP 请求并解析响应"""
        try:
            import httpx

            headers.setdefault("User-Agent", "HackBot-ApiClient/2.0")

            async with httpx.AsyncClient(
                timeout=20,
                follow_redirects=True,
                verify=False,
            ) as client:
                request_kwargs: Dict[str, Any] = {
                    "method": method,
                    "url": url,
                    "headers": headers,
                }
                if params:
                    request_kwargs["params"] = params
                if body:
                    if isinstance(body, dict):
                        request_kwargs["json"] = body
                    elif isinstance(body, str):
                        request_kwargs["content"] = body

                resp = await client.request(**request_kwargs)

            # 解析响应
            result: Dict[str, Any] = {
                "url": str(resp.url),
                "method": method,
                "status_code": resp.status_code,
                "content_type": resp.headers.get("content-type", ""),
                "elapsed_ms": resp.elapsed.total_seconds() * 1000,
            }

            if preset_name:
                result["preset"] = preset_name

            # 尝试解析 JSON
            try:
                json_data = resp.json()
                # 限制 JSON 输出大小
                json_str = json.dumps(json_data, ensure_ascii=False, indent=2)
                if len(json_str) > 5000:
                    result["data"] = json_data if isinstance(json_data, dict) else {"items": json_data[:20] if isinstance(json_data, list) else json_data}
                    result["data_truncated"] = True
                    result["total_size"] = len(json_str)
                else:
                    result["data"] = json_data
            except (json.JSONDecodeError, Exception):
                # 非 JSON 响应
                text = resp.text[:3000]
                result["body_preview"] = text

            result["response_headers"] = dict(list(resp.headers.items())[:20])

            return ToolResult(success=True, result=result)

        except Exception as e:
            logger.error(f"ApiClientTool 请求错误: {e}")
            return ToolResult(success=False, result=None, error=str(e))

    # ------------------------------------------------------------------
    # 辅助方法
    # ------------------------------------------------------------------

    @staticmethod
    def _apply_auth(headers: dict, auth_type: str, auth_value: str) -> dict:
        """应用认证"""
        if auth_type == "bearer" and auth_value:
            headers["Authorization"] = f"Bearer {auth_value}"
        elif auth_type == "api_key" and auth_value:
            headers["X-API-Key"] = auth_value
        return headers

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "url": {"type": "string", "description": "自定义请求的目标 URL", "required": False},
                "method": {"type": "string", "description": "HTTP 方法（默认 GET）", "default": "GET"},
                "headers": {"type": "object", "description": "自定义请求头"},
                "params": {"type": "object", "description": "URL 查询参数"},
                "body": {"type": "string", "description": "请求体数据"},
                "auth_type": {"type": "string", "description": "认证类型: none/bearer/api_key", "default": "none"},
                "auth_value": {"type": "string", "description": "认证值（token 或 API key）"},
                "preset": {"type": "string", "description": "内置 API 模板名称"},
                "query": {"type": "string", "description": "模板查询参数"},
            },
        }
