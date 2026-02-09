"""JWT 分析工具：解码和分析 JSON Web Token 的安全性"""
import base64
import json
import time
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class JwtAnalyzeTool(BaseTool):
    """JWT 分析工具：解码 JWT Token、检查有效期、分析算法安全性"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="jwt_analyze",
            description="解码和分析JWT Token的安全性（Header、Payload、算法、有效期、常见漏洞）。参数: token(JWT字符串)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        token = kwargs.get("token", "")
        if not token:
            return ToolResult(success=False, result=None, error="缺少参数: token")

        try:
            parts = token.strip().split(".")
            if len(parts) != 3:
                return ToolResult(
                    success=False,
                    result=None,
                    error=f"无效的 JWT 格式（应包含 3 部分，实际 {len(parts)} 部分）",
                )

            # 解码 Header
            header = self._decode_segment(parts[0])
            payload = self._decode_segment(parts[1])
            signature = parts[2]

            if not header or not payload:
                return ToolResult(success=False, result=None, error="JWT 解码失败")

            # 分析
            result = {
                "header": header,
                "payload": payload,
                "signature_present": bool(signature and signature != ""),
                "signature_length": len(signature),
            }

            # 安全分析
            vulnerabilities = []
            warnings = []

            # 1. 算法分析
            alg = header.get("alg", "").upper()
            if alg == "NONE":
                vulnerabilities.append({
                    "severity": "CRITICAL",
                    "issue": "使用 'none' 算法 — 签名未校验",
                    "description": "攻击者可以随意修改 Payload 而无需签名",
                })
            elif alg in ("HS256", "HS384", "HS512"):
                warnings.append({
                    "severity": "INFO",
                    "issue": f"使用对称算法 {alg}",
                    "description": "密钥需要在服务端安全保管，如果密钥弱则容易被暴力破解",
                })
            elif alg in ("RS256", "RS384", "RS512", "ES256", "ES384", "ES512"):
                pass  # 非对称算法，通常安全
            elif alg == "":
                vulnerabilities.append({
                    "severity": "HIGH",
                    "issue": "未指定算法",
                })

            # 2. 有效期分析
            now = int(time.time())
            exp = payload.get("exp")
            iat = payload.get("iat")
            nbf = payload.get("nbf")

            if exp is None:
                warnings.append({
                    "severity": "MEDIUM",
                    "issue": "未设置过期时间 (exp)",
                    "description": "Token 永不过期，被盗用后无法自动失效",
                })
            elif isinstance(exp, (int, float)):
                if exp < now:
                    result["expired"] = True
                    result["expired_since_seconds"] = now - int(exp)
                else:
                    result["expired"] = False
                    result["expires_in_seconds"] = int(exp) - now
                    # 检查过期时间是否太长
                    ttl = int(exp) - (iat or now)
                    if ttl > 86400 * 30:  # 超过30天
                        warnings.append({
                            "severity": "MEDIUM",
                            "issue": f"Token 有效期过长（{ttl // 86400} 天）",
                        })

            if iat and isinstance(iat, (int, float)):
                result["issued_at"] = iat

            # 3. 敏感信息检查
            sensitive_keys = ["password", "passwd", "secret", "private_key", "credit_card", "ssn"]
            for key in payload:
                if any(s in key.lower() for s in sensitive_keys):
                    vulnerabilities.append({
                        "severity": "HIGH",
                        "issue": f"Payload 中包含敏感字段: {key}",
                        "description": "JWT Payload 是 Base64 编码（非加密），任何人都可以解码查看",
                    })

            # 4. 检查 kid (Key ID) 注入
            kid = header.get("kid")
            if kid:
                if any(c in str(kid) for c in ["'", '"', ";", "/", "\\", ".."]):
                    vulnerabilities.append({
                        "severity": "HIGH",
                        "issue": f"kid 字段包含可疑字符: {kid}",
                        "description": "可能存在 kid 注入攻击（SQL 注入或路径遍历）",
                    })

            # 5. 检查 jku / x5u
            for field in ("jku", "x5u"):
                if header.get(field):
                    warnings.append({
                        "severity": "MEDIUM",
                        "issue": f"Header 包含 {field}: {header[field]}",
                        "description": f"{field} 指定了外部密钥 URL，可能被攻击者替换",
                    })

            result["vulnerabilities"] = vulnerabilities
            result["warnings"] = warnings
            result["security_score"] = self._calc_score(vulnerabilities, warnings)

            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def _decode_segment(self, segment: str) -> Dict:
        """Base64URL 解码 JWT 段"""
        try:
            # 添加 padding
            padding = 4 - len(segment) % 4
            if padding != 4:
                segment += "=" * padding
            decoded = base64.urlsafe_b64decode(segment)
            return json.loads(decoded)
        except Exception:
            return {}

    def _calc_score(self, vulns: list, warnings: list) -> int:
        score = 100
        for v in vulns:
            sev = v.get("severity", "")
            if sev == "CRITICAL":
                score -= 40
            elif sev == "HIGH":
                score -= 25
            elif sev == "MEDIUM":
                score -= 15
        for w in warnings:
            sev = w.get("severity", "")
            if sev == "MEDIUM":
                score -= 5
            elif sev == "LOW" or sev == "INFO":
                score -= 2
        return max(0, score)

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "token": {"type": "string", "description": "JWT Token 字符串", "required": True},
            },
        }
