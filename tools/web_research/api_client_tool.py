"""
通用 REST API 客户端工具：支持自定义请求与内置常用 API 模板
"""
import json
import traceback
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
from tools.base import BaseTool, ToolResult
from utils.logger import logger


# 错误信息收集器
@dataclass
class ErrorCollector:
    """收集API调用错误信息"""
    errors: List[Dict[str, Any]] = field(default_factory=list)
    max_size: int = 100

    def add_error(self, error_type: str, message: str, context: Dict[str, Any]):
        """添加错误信息"""
        if len(self.errors) >= self.max_size:
            self.errors.pop(0)
        self.errors.append({
            "timestamp": datetime.now().isoformat(),
            "type": error_type,
            "message": message,
            "context": context
        })

    def get_recent_errors(self, count: int = 10) -> List[Dict[str, Any]]:
        """获取最近的错误信息"""
        return self.errors[-count:]

    def clear(self):
        """清空错误记录"""
        self.errors.clear()


# 全局错误收集器实例
_error_collector = ErrorCollector()


def _ensure_str(val: Any, default: str = "") -> str:
    """将参数规范为字符串：若为 dict 则取 city/query/q 或首个值，避免 'dict' has no attribute 'strip'"""
    if val is None:
        return default
    if isinstance(val, str):
        return (val or default).strip()
    if isinstance(val, dict):
        s = val.get("city") or val.get("query") or val.get("q") or (
            next(iter(val.values()), None) if val else None)
        return _ensure_str(s, default)
    return str(val).strip() if val else default


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
        preset_list = ", ".join(
            f"{k}({v['name']})" for k, v in API_PRESETS.items())
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
        preset = _ensure_str(kwargs.get("preset"))
        query = _ensure_str(kwargs.get("query"))

        # 模式 1: 使用内置模板
        if preset:
            return await self._execute_preset(preset, query, kwargs)

        # 模式 2: 自定义请求
        url = _ensure_str(kwargs.get("url"))
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
                success=False,
                result=None,
                error=f"未知模板: {preset}，可用模板: {available}",
            )

        config = API_PRESETS[preset]
        # 部分模板需要单参数（如天气需城市名）
        if "{query}" in config["url_template"] and not query:
            if preset == "weather":
                # 1) 优先根据本机 IP 自动推断城市
                auto_city = await self._detect_city_from_ip()
                if auto_city:
                    query = auto_city
                else:
                    # 2) 回退到固定默认城市，保证不会报错
                    query = "北京"
            else:
                return ToolResult(
                    success=False,
                    result=None,
                    error=f"模板 {preset} 需要 query 参数，请提供。",
                )
        url = config["url_template"].format(
            query=query) if query else config["url_template"]
        method = config.get("method", "GET")
        headers = dict(config.get("headers", {}))

        # 支持额外 headers 和 auth
        extra_headers = kwargs.get("headers", {})
        if isinstance(extra_headers, dict):
            headers.update(extra_headers)

        auth_type = _ensure_str(kwargs.get("auth_type"), "none").lower()
        auth_value = _ensure_str(kwargs.get("auth_value"))
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

        auth_type = _ensure_str(kwargs.get("auth_type"), "none").lower()
        auth_value = _ensure_str(kwargs.get("auth_value"))
        headers = self._apply_auth(headers, auth_type, auth_value)

        timeout = self._parse_timeout(kwargs)

        return await self._do_request(url, method, headers, params, body, timeout=timeout)

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
        timeout: Optional[float] = None,
    ) -> ToolResult:
        """发送 HTTP 请求并解析响应"""
        # 规范化超时时间（秒）
        timeout_val: float = 20.0
        if timeout is not None:
            try:
                t = float(timeout)
                if t > 0:
                    timeout_val = max(1.0, min(t, 60.0))
            except (TypeError, ValueError):
                pass

        # 重试配置
        max_retries = 3
        retry_delay = 1.0

        # 请求上下文信息
        request_context = {
            "url": url,
            "method": method,
            "headers": {k: v for k, v in headers.items() if k.lower() not in ["authorization", "x-api-key"]},
            "params": params,
            "timeout": timeout_val,
            "preset_name": preset_name,
        }

        # 尝试导入 httpx
        try:
            import httpx
        except ImportError as e:
            msg = f"缺少依赖: httpx，请先安装: pip install httpx"
            logger.error(msg)
            _error_collector.add_error("ImportError", msg, request_context)
            return ToolResult(success=False, result=None, error=msg)

        # SSL 警告
        if not headers.get("verify", True):
            logger.warning(f"SSL 验证已禁用: {url}")

        # 重试循环
        last_exception = None
        for attempt in range(max_retries):
            try:
                headers.setdefault("User-Agent", "HackBot-ApiClient/2.0")

                async with httpx.AsyncClient(
                    timeout=timeout_val,
                    follow_redirects=True,
                    verify=False,  # 注意：生产环境应启用
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

                # 解析响应（无论状态码如何都尝试返回内容）
                result: Dict[str, Any] = {
                    "url": str(resp.url),
                    "method": method,
                    "status_code": resp.status_code,
                    "content_type": resp.headers.get("content-type", ""),
                    "elapsed_ms": resp.elapsed.total_seconds() * 1000,
                }

                if preset_name:
                    result["preset"] = preset_name

                # HTTP 状态辅助字段
                ok = 200 <= resp.status_code < 300
                result["ok"] = ok
                if not ok:
                    result["http_error"] = {
                        "status_code": resp.status_code,
                        "reason": getattr(resp, "reason_phrase", ""),
                    }

                # 尝试解析 JSON
                try:
                    json_data = resp.json()
                    # 限制 JSON 输出大小
                    json_str = json.dumps(
                        json_data, ensure_ascii=False, indent=2)
                    if len(json_str) > 5000:
                        if isinstance(json_data, dict):
                            result["data"] = json_data
                        elif isinstance(json_data, list):
                            result["data"] = {"items": json_data[:20]}
                        else:
                            result["data"] = json_data
                        result["data_truncated"] = True
                        result["total_size"] = len(json_str)
                    else:
                        result["data"] = json_data
                except (json.JSONDecodeError, Exception):
                    # 非 JSON 响应
                    text = resp.text[:3000]
                    result["body_preview"] = text

                result["response_headers"] = dict(
                    list(resp.headers.items())[:20])

                # 即使 HTTP 非 2xx，也视为成功返回结果，由调用方根据 ok/http_error 决定处理方式
                return ToolResult(success=True, result=result)

            # ============== 详细的异常处理 ==============
            except httpx.TimeoutException as e:
                err_type = "TimeoutException"
                err_msg = f"请求超时 (attempt {attempt + 1}/{max_retries}): {str(e)}"
                logger.warning(err_msg)
                _error_collector.add_error(
                    err_type, err_msg, {**request_context, "attempt": attempt + 1})
                last_exception = e

            except httpx.ConnectError as e:
                err_type = "ConnectError"
                err_msg = f"连接失败 (attempt {attempt + 1}/{max_retries}): {str(e)}"
                logger.warning(err_msg)
                _error_collector.add_error(
                    err_type, err_msg, {**request_context, "attempt": attempt + 1})
                last_exception = e

            except httpx.HTTPStatusError as e:
                err_type = "HTTPStatusError"
                err_msg = f"HTTP 错误 {e.response.status_code}: {str(e)}"
                # HTTP 错误不重试，直接返回
                logger.error(err_msg)
                _error_collector.add_error(err_type, err_msg, {
                    **request_context,
                    "status_code": e.response.status_code,
                    "response_body": str(e.response.text)[:500]
                })
                return ToolResult(
                    success=False,
                    result={
                        "url": url,
                        "method": method,
                        "status_code": e.response.status_code,
                    },
                    error=err_msg,
                )

            except httpx.TooManyRedirects as e:
                err_type = "TooManyRedirects"
                err_msg = f"重定向过多: {str(e)}"
                logger.error(err_msg)
                _error_collector.add_error(err_type, err_msg, request_context)
                return ToolResult(success=False, result={"url": url, "method": method}, error=err_msg)

            except httpx.RequestError as e:
                err_type = "RequestError"
                err_msg = f"请求错误 (attempt {attempt + 1}/{max_retries}): {str(e)}"
                logger.warning(err_msg)
                _error_collector.add_error(
                    err_type, err_msg, {**request_context, "attempt": attempt + 1})
                last_exception = e

            except Exception as e:
                err_type = type(e).__name__
                err_msg = f"未知错误: {str(e)}"
                logger.error(f"ApiClientTool 请求错误 [{err_type}]: {err_msg}")
                logger.debug(f"详细堆栈: {traceback.format_exc()}")
                _error_collector.add_error(err_type, err_msg, {
                    **request_context,
                    "traceback": traceback.format_exc()
                })
                return ToolResult(
                    success=False,
                    result={"url": url, "method": method},
                    error=err_msg,
                )

            # 重试前等待
            if attempt < max_retries - 1:
                import asyncio
                await asyncio.sleep(retry_delay * (attempt + 1))  # 指数退避

        # 所有重试都失败
        err_msg = f"请求失败，已重试 {max_retries} 次: {str(last_exception)}"
        logger.error(err_msg)
        _error_collector.add_error("MaxRetriesExceeded", err_msg, {
                                   **request_context, "max_retries": max_retries})
        return ToolResult(
            success=False,
            result={"url": url, "method": method, "retries": max_retries},
            error=err_msg,
        )

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

    @staticmethod
    def _parse_timeout(kwargs: dict) -> Optional[float]:
        """从参数中解析 timeout（秒），返回合法的 float 或 None"""
        raw = kwargs.get("timeout")
        if raw is None or raw == "":
            return None
        try:
            t = float(raw)
            if t <= 0:
                return None
            return t
        except (TypeError, ValueError):
            return None

    async def _detect_city_from_ip(self) -> Optional[str]:
        """
        尝试通过公网 IP 自动推断所在城市：
        1) 使用 httpbin.org 获取本机公网 IP
        2) 使用 ip-api.com 查询地理位置（中文）
        失败时返回 None，不抛异常
        """
        try:
            try:
                import httpx
            except ImportError:
                logger.warning("自动定位城市失败: 缺少依赖 httpx")
                return None

            timeout_val = 8.0
            headers = {"User-Agent": "HackBot-ApiClient/2.0"}

            async with httpx.AsyncClient(
                timeout=timeout_val,
                follow_redirects=True,
                verify=False,
            ) as client:
                # 第一步：获取公网 IP
                ip_resp = await client.get("https://httpbin.org/ip", headers=headers)
                ip_data = ip_resp.json()
                ip = (
                    ip_data.get("origin")
                    or ip_data.get("ip")
                    or (ip_data.get("origin_ip") if isinstance(ip_data, dict) else None)
                )
                if not ip:
                    logger.warning("自动定位城市失败: 未能从 httpbin.org 响应中提取 IP")
                    return None

                # httpbin 可能返回 "1.2.3.4, 5.6.7.8" 形式，取第一个
                if isinstance(ip, str) and "," in ip:
                    ip = ip.split(",")[0].strip()

                # 第二步：通过 ip-api 查询地理位置（返回中文字段）
                geo_url = f"http://ip-api.com/json/{ip}?lang=zh-CN"
                geo_resp = await client.get(geo_url, headers=headers)
                geo_data = geo_resp.json()

                if not isinstance(geo_data, dict) or geo_data.get("status") != "success":
                    logger.warning("自动定位城市失败: ip-api 返回非 success 状态")
                    return None

                city = (
                    _ensure_str(geo_data.get("city"))
                    or _ensure_str(geo_data.get("regionName"))
                    or _ensure_str(geo_data.get("country"))
                )
                city = city.strip()
                if not city:
                    logger.warning("自动定位城市失败: 未能从 ip-api 响应中提取城市信息")
                    return None

                return city

        except Exception as e:
            logger.warning(f"自动定位城市失败: {e}")
            return None

    # ------------------------------------------------------------------
    # 错误信息收集接口
    # ------------------------------------------------------------------

    @staticmethod
    def get_recent_errors(count: int = 10) -> List[Dict[str, Any]]:
        """获取最近的错误信息"""
        return _error_collector.get_recent_errors(count)

    @staticmethod
    def get_error_stats() -> Dict[str, Any]:
        """获取错误统计信息"""
        errors = _error_collector.errors
        if not errors:
            return {"total_errors": 0, "by_type": {}}

        error_types = {}
        for err in errors:
            err_type = err.get("type", "Unknown")
            error_types[err_type] = error_types.get(err_type, 0) + 1

        return {
            "total_errors": len(errors),
            "by_type": error_types,
            "oldest": errors[0]["timestamp"] if errors else None,
            "newest": errors[-1]["timestamp"] if errors else None,
        }

    @staticmethod
    def clear_errors():
        """清空错误记录"""
        _error_collector.clear()

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
                "timeout": {"type": "number", "description": "请求超时时间（秒，默认 20，最大 60）", "required": False},
                "auth_type": {"type": "string", "description": "认证类型: none/bearer/api_key", "default": "none"},
                "auth_value": {"type": "string", "description": "认证值（token 或 API key）"},
                "preset": {"type": "string", "description": "内置 API 模板名称"},
                "query": {"type": "string", "description": "模板查询参数"},
            },
        }
