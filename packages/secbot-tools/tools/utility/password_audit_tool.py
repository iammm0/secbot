"""密码强度审计工具：评估密码强度、检查常见弱密码、审计系统密码策略"""
import math
import re
import string
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


# 常见弱密码 Top 50
COMMON_WEAK_PASSWORDS = {
    "123456", "password", "12345678", "qwerty", "123456789",
    "12345", "1234", "111111", "1234567", "dragon",
    "123123", "baseball", "abc123", "football", "monkey",
    "letmein", "696969", "shadow", "master", "666666",
    "qwertyuiop", "123321", "mustang", "1234567890", "michael",
    "654321", "pussy", "superman", "1qaz2wsx", "7777777",
    "121212", "000000", "qazwsx", "123qwe", "killer",
    "trustno1", "jordan", "jennifer", "zxcvbnm", "asdfgh",
    "hunter", "buster", "soccer", "harley", "batman",
    "andrew", "tigger", "sunshine", "iloveyou", "admin",
}


class PasswordAuditTool(BaseTool):
    """密码强度与策略审计工具"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="password_audit",
            description=(
                "评估密码强度（熵值、复杂度、弱密码检查）或审计系统密码策略。"
                "参数: password(要评估的密码,可选), policy_check(是否检查系统密码策略,bool,默认false)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        password = kwargs.get("password", "")
        policy_check = kwargs.get("policy_check", False)

        results = {}

        if password:
            results["password_analysis"] = self._analyze_password(password)

        if policy_check:
            results["policy_analysis"] = self._check_system_policy()

        if not password and not policy_check:
            return ToolResult(success=False, result=None, error="请提供 password 或设置 policy_check=true")

        return ToolResult(success=True, result=results)

    def _analyze_password(self, password: str) -> Dict:
        """分析密码强度"""
        length = len(password)

        # 字符集分析
        has_lower = bool(re.search(r"[a-z]", password))
        has_upper = bool(re.search(r"[A-Z]", password))
        has_digit = bool(re.search(r"\d", password))
        has_special = bool(re.search(r"[^a-zA-Z0-9]", password))

        # 计算字符空间
        charset_size = 0
        if has_lower:
            charset_size += 26
        if has_upper:
            charset_size += 26
        if has_digit:
            charset_size += 10
        if has_special:
            charset_size += 32

        # 计算熵
        entropy = length * math.log2(charset_size) if charset_size > 0 else 0

        # 评分（0-100）
        score = 0
        score += min(length * 4, 40)  # 长度，最多 40 分
        score += 10 if has_lower else 0
        score += 10 if has_upper else 0
        score += 10 if has_digit else 0
        score += 15 if has_special else 0
        score += min(entropy / 2, 15)  # 熵值加分

        # 减分项
        weaknesses = []
        if password.lower() in COMMON_WEAK_PASSWORDS:
            score = max(score - 50, 0)
            weaknesses.append("匹配常见弱密码列表")

        if re.match(r"^(.)\1+$", password):
            score = max(score - 30, 0)
            weaknesses.append("全部为重复字符")

        if re.match(r"^(012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)+$", password.lower()):
            score = max(score - 20, 0)
            weaknesses.append("包含连续字符序列")

        if length < 8:
            weaknesses.append("长度不足 8 位")
        if not has_upper:
            weaknesses.append("缺少大写字母")
        if not has_lower:
            weaknesses.append("缺少小写字母")
        if not has_digit:
            weaknesses.append("缺少数字")
        if not has_special:
            weaknesses.append("缺少特殊字符")

        # 强度等级
        if score >= 80:
            strength = "强"
        elif score >= 60:
            strength = "中等"
        elif score >= 40:
            strength = "弱"
        else:
            strength = "非常弱"

        # 估算暴力破解时间（假设 10 亿次/秒）
        combinations = charset_size ** length if charset_size > 0 else 0
        seconds = combinations / 1_000_000_000
        if seconds < 1:
            crack_time = "不到 1 秒"
        elif seconds < 60:
            crack_time = f"约 {seconds:.0f} 秒"
        elif seconds < 3600:
            crack_time = f"约 {seconds/60:.0f} 分钟"
        elif seconds < 86400:
            crack_time = f"约 {seconds/3600:.0f} 小时"
        elif seconds < 86400 * 365:
            crack_time = f"约 {seconds/86400:.0f} 天"
        else:
            crack_time = f"约 {seconds/(86400*365):.1e} 年"

        return {
            "length": length,
            "charset": {
                "has_lowercase": has_lower,
                "has_uppercase": has_upper,
                "has_digits": has_digit,
                "has_special": has_special,
                "charset_size": charset_size,
            },
            "entropy_bits": round(entropy, 2),
            "score": min(round(score), 100),
            "strength": strength,
            "weaknesses": weaknesses,
            "estimated_crack_time": crack_time,
            "is_common_password": password.lower() in COMMON_WEAK_PASSWORDS,
        }

    def _check_system_policy(self) -> Dict:
        """检查系统密码策略"""
        import platform
        import subprocess

        system = platform.system()
        policy = {"system": system, "checks": []}

        try:
            if system == "Linux":
                # 检查 PAM 配置
                try:
                    with open("/etc/pam.d/common-password", "r") as f:
                        content = f.read()
                    policy["pam_config"] = content[:1000]
                    if "minlen" in content:
                        policy["checks"].append("密码最小长度已配置")
                    else:
                        policy["checks"].append("[警告] 未检测到密码最小长度限制")
                    if "ucredit" in content or "dcredit" in content:
                        policy["checks"].append("密码复杂度规则已配置")
                    else:
                        policy["checks"].append("[警告] 未检测到密码复杂度要求")
                except FileNotFoundError:
                    policy["checks"].append("未找到 /etc/pam.d/common-password")

                # 检查密码过期策略
                try:
                    with open("/etc/login.defs", "r") as f:
                        for line in f:
                            line = line.strip()
                            if line.startswith("PASS_MAX_DAYS"):
                                policy["max_days"] = line.split()[-1]
                            elif line.startswith("PASS_MIN_DAYS"):
                                policy["min_days"] = line.split()[-1]
                            elif line.startswith("PASS_MIN_LEN"):
                                policy["min_len"] = line.split()[-1]
                except FileNotFoundError:
                    policy["checks"].append("未找到 /etc/login.defs")

            elif system == "Darwin":
                # macOS 密码策略
                try:
                    result = subprocess.run(
                        ["pwpolicy", "getaccountpolicies"],
                        capture_output=True, text=True, timeout=5,
                    )
                    policy["pwpolicy_output"] = result.stdout[:1000]
                    policy["checks"].append("已读取 macOS 密码策略")
                except Exception:
                    policy["checks"].append("无法读取 macOS 密码策略")

            elif system == "Windows":
                try:
                    result = subprocess.run(
                        ["net", "accounts"],
                        capture_output=True, text=True, timeout=5,
                    )
                    policy["net_accounts"] = result.stdout[:1000]
                    policy["checks"].append("已读取 Windows 密码策略")
                except Exception:
                    policy["checks"].append("无法读取 Windows 密码策略")

        except Exception as e:
            policy["error"] = str(e)

        return policy

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "password": {"type": "string", "description": "要评估的密码（可选）", "required": False},
                "policy_check": {"type": "boolean", "description": "是否检查系统密码策略（默认 false）", "required": False},
            },
        }
