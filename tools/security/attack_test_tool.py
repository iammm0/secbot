"""攻击测试工具（高敏感度，需用户确认）"""
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class AttackTestTool(BaseTool):
    """攻击测试工具：执行暴力破解、SQL注入、XSS、DoS 等攻击测试"""

    sensitivity = "high"

    def __init__(self):
        super().__init__(
            name="attack_test",
            description=(
                "执行攻击测试（需用户确认）。"
                "参数: attack_type(brute_force/sql_injection/xss/dos), target_url(目标URL), "
                "parameter(测试参数名, 用于sql_injection/xss), username(用于brute_force)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        from scanner.attack_tester import AttackTester

        attack_type = kwargs.get("attack_type", "")
        target_url = kwargs.get("target_url", "")
        if not attack_type or not target_url:
            return ToolResult(success=False, result=None, error="缺少参数: attack_type 和 target_url")

        try:
            tester = AttackTester()
            if attack_type == "sql_injection":
                param = kwargs.get("parameter", "id")
                result = await tester.sql_injection_attack(target_url, param)
            elif attack_type == "xss":
                param = kwargs.get("parameter", "q")
                result = await tester.xss_attack(target_url, param)
            elif attack_type == "brute_force":
                username = kwargs.get("username", "admin")
                passwords = kwargs.get("passwords", ["admin", "123456", "password", "root", "test"])
                result = await tester.brute_force_login(target_url, username, passwords)
            elif attack_type == "dos":
                duration = kwargs.get("duration", 5)
                concurrent = kwargs.get("concurrent", 50)
                result = await tester.dos_test(target_url, duration=duration, concurrent_requests=concurrent)
            else:
                return ToolResult(success=False, result=None, error=f"不支持的攻击类型: {attack_type}")

            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "attack_type": {
                    "type": "string",
                    "description": "攻击类型: brute_force / sql_injection / xss / dos",
                    "required": True,
                },
                "target_url": {"type": "string", "description": "目标 URL", "required": True},
                "parameter": {"type": "string", "description": "测试参数名（sql_injection/xss 用）"},
                "username": {"type": "string", "description": "用户名（brute_force 用）", "default": "admin"},
            },
        }
