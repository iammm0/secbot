"""Redis 未授权检测工具：检测目标 Redis 是否存在未授权访问"""
import asyncio
import socket
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class RedisProbeTool(BaseTool):
    """Redis 未授权访问检测工具"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="redis_probe",
            description=(
                "检测目标 Redis 是否存在未授权访问漏洞，获取服务器信息。"
                "参数: target(目标 IP 或域名), port(默认 6379)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        target = kwargs.get("target", "").strip()
        port = int(kwargs.get("port", 6379))

        if not target:
            return ToolResult(success=False, result=None, error="缺少参数: target")

        loop = asyncio.get_event_loop()

        try:
            def _probe():
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(10)
                s.connect((target, port))

                result = {
                    "target": target,
                    "port": port,
                    "accessible": False,
                    "auth_required": False,
                    "info": {},
                    "risk_level": "low",
                    "findings": [],
                }

                # 发送 PING 命令
                s.send(b"PING\r\n")
                resp = s.recv(1024).decode(errors="ignore").strip()

                if "+PONG" in resp:
                    result["accessible"] = True
                    result["auth_required"] = False
                    result["findings"].append("Redis 允许无认证访问（PING 返回 PONG）")
                    result["risk_level"] = "high"
                elif "-NOAUTH" in resp or "authentication" in resp.lower():
                    result["accessible"] = True
                    result["auth_required"] = True
                    result["findings"].append("Redis 需要认证（已配置密码）")
                    result["risk_level"] = "low"
                    s.close()
                    return result
                else:
                    result["findings"].append(f"Redis 响应异常: {resp[:200]}")
                    s.close()
                    return result

                # 如果无认证，尝试获取更多信息
                # INFO 命令
                s.send(b"INFO server\r\n")
                info_resp = s.recv(4096).decode(errors="ignore")
                if info_resp and not info_resp.startswith("-"):
                    info_dict = {}
                    for line in info_resp.split("\r\n"):
                        if ":" in line and not line.startswith("$") and not line.startswith("*"):
                            k, _, v = line.partition(":")
                            info_dict[k.strip()] = v.strip()
                    result["info"] = {
                        "redis_version": info_dict.get("redis_version"),
                        "os": info_dict.get("os"),
                        "arch_bits": info_dict.get("arch_bits"),
                        "tcp_port": info_dict.get("tcp_port"),
                        "uptime_in_days": info_dict.get("uptime_in_days"),
                        "config_file": info_dict.get("config_file"),
                        "executable": info_dict.get("executable"),
                    }

                # CONFIG GET 检查危险配置
                s.send(b"CONFIG GET dir\r\n")
                config_resp = s.recv(1024).decode(errors="ignore")
                if config_resp and not config_resp.startswith("-"):
                    result["findings"].append("CONFIG GET 可执行（可能被利用写文件）")
                    result["risk_level"] = "critical"

                # DBSIZE 检查数据量
                s.send(b"DBSIZE\r\n")
                dbsize_resp = s.recv(256).decode(errors="ignore").strip()
                if dbsize_resp.startswith(":"):
                    result["info"]["db_size"] = dbsize_resp[1:]

                s.close()
                return result

            result = await loop.run_in_executor(None, _probe)
            return ToolResult(success=True, result=result)

        except socket.timeout:
            return ToolResult(success=True, result={
                "target": target, "port": port,
                "accessible": False, "message": "连接超时，服务不可达",
            })
        except ConnectionRefusedError:
            return ToolResult(success=True, result={
                "target": target, "port": port,
                "accessible": False, "message": "连接被拒绝，端口未开放",
            })
        except Exception as e:
            return ToolResult(success=False, result=None, error=f"Redis 探测失败: {e}")

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "target": {"type": "string", "description": "目标 IP 或域名", "required": True},
                "port": {"type": "integer", "description": "Redis 端口（默认 6379）", "required": False},
            },
        }
