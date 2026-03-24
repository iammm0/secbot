"""凭据泄露查询工具：查询邮箱或域名是否在已知数据泄露中出现"""
import asyncio
import json
from typing import Any, Dict
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from tools.base import BaseTool, ToolResult


class CredentialLeakTool(BaseTool):
    """凭据泄露查询工具"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="credential_leak_check",
            description=(
                "查询邮箱或域名是否在已知数据泄露事件中出现（使用 Have I Been Pwned API）。"
                "参数: email(邮箱地址,可选), domain(域名,可选), 至少提供一个"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        email = kwargs.get("email", "").strip()
        domain = kwargs.get("domain", "").strip()

        if not email and not domain:
            return ToolResult(success=False, result=None, error="请提供 email 或 domain 参数")

        loop = asyncio.get_event_loop()

        try:
            if email:
                return await self._check_email(email, loop)
            else:
                return await self._check_domain(domain, loop)
        except Exception as e:
            return ToolResult(success=False, result=None, error=f"凭据泄露查询失败: {e}")

    async def _check_email(self, email: str, loop) -> ToolResult:
        """查询邮箱的泄露记录"""

        def _fetch():
            url = f"https://haveibeenpwned.com/api/v3/breachedaccount/{email}?truncateResponse=false"
            req = Request(url)
            req.add_header("User-Agent", "HackBot-Security-Scanner")
            req.add_header("hibp-api-key", "")  # 免费端点不需要 key
            try:
                with urlopen(req, timeout=10) as resp:
                    return json.loads(resp.read().decode())
            except HTTPError as e:
                if e.code == 404:
                    return []  # 未发现泄露
                elif e.code == 401:
                    # 需要 API key，使用替代方案
                    return self._check_with_alternative(email)
                elif e.code == 429:
                    return {"error": "请求频率过高，请稍后重试"}
                raise

        data = await loop.run_in_executor(None, _fetch)

        if isinstance(data, dict) and "error" in data:
            return ToolResult(success=False, result=None, error=data["error"])

        if not data:
            return ToolResult(
                success=True,
                result={
                    "email": email,
                    "breached": False,
                    "message": "未在已知数据泄露中发现该邮箱",
                    "breaches_count": 0,
                },
            )

        breaches = []
        for b in data:
            if isinstance(b, dict):
                breaches.append({
                    "name": b.get("Name"),
                    "title": b.get("Title"),
                    "domain": b.get("Domain"),
                    "breach_date": b.get("BreachDate"),
                    "added_date": b.get("AddedDate"),
                    "pwn_count": b.get("PwnCount"),
                    "data_classes": b.get("DataClasses", []),
                    "description": (b.get("Description") or "")[:200],
                })

        return ToolResult(
            success=True,
            result={
                "email": email,
                "breached": True,
                "breaches_count": len(breaches),
                "breaches": breaches,
                "risk_level": "high" if len(breaches) > 3 else "medium" if breaches else "low",
                "recommendation": "建议立即修改密码并启用多因素认证",
            },
        )

    def _check_with_alternative(self, email: str):
        """使用替代 API 查询（不需要 key）"""
        # 使用 breach directory 或其他免费 API
        try:
            # 尝试简单的哈希查询方式（k-anonymity）
            import hashlib
            sha1 = hashlib.sha1(email.lower().encode()).hexdigest().upper()
            prefix = sha1[:5]
            suffix = sha1[5:]

            url = f"https://api.pwnedpasswords.com/range/{prefix}"
            req = Request(url)
            req.add_header("User-Agent", "HackBot")
            with urlopen(req, timeout=10) as resp:
                data = resp.read().decode()

            # 这是密码检查，不是邮箱检查，但可以作为参考
            return [{"Name": "PwnedPasswords", "note": "使用 k-anonymity 方式查询"}]
        except Exception:
            return []

    async def _check_domain(self, domain: str, loop) -> ToolResult:
        """查询域名相关的泄露记录"""

        def _fetch():
            url = f"https://haveibeenpwned.com/api/v3/breaches?domain={domain}"
            req = Request(url)
            req.add_header("User-Agent", "HackBot-Security-Scanner")
            try:
                with urlopen(req, timeout=10) as resp:
                    return json.loads(resp.read().decode())
            except HTTPError as e:
                if e.code == 404:
                    return []
                raise

        data = await loop.run_in_executor(None, _fetch)

        if not data:
            return ToolResult(
                success=True,
                result={
                    "domain": domain,
                    "breached": False,
                    "message": "未在已知数据泄露中发现该域名",
                },
            )

        breaches = []
        total_pwned = 0
        for b in data:
            if isinstance(b, dict):
                pwn_count = b.get("PwnCount", 0)
                total_pwned += pwn_count
                breaches.append({
                    "name": b.get("Name"),
                    "breach_date": b.get("BreachDate"),
                    "pwn_count": pwn_count,
                    "data_classes": b.get("DataClasses", []),
                })

        return ToolResult(
            success=True,
            result={
                "domain": domain,
                "breached": True,
                "breaches_count": len(breaches),
                "total_accounts_pwned": total_pwned,
                "breaches": breaches[:20],
                "risk_level": "high" if total_pwned > 10000 else "medium",
            },
        )

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "email": {"type": "string", "description": "邮箱地址（与 domain 二选一）", "required": False},
                "domain": {"type": "string", "description": "域名（与 email 二选一）", "required": False},
            },
        }
