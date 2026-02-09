"""MySQL 信息探测工具：解析 MySQL Greeting 包获取版本、协议等信息"""
import asyncio
import socket
import struct
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class MysqlProbeTool(BaseTool):
    """MySQL 信息探测工具（仅抓取 Handshake，不做登录）"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="mysql_probe",
            description=(
                "探测目标 MySQL 服务的版本、协议号、能力标志等信息（仅读取 Greeting 包，不尝试登录）。"
                "参数: target(目标 IP 或域名), port(默认 3306)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        target = kwargs.get("target", "").strip()
        port = int(kwargs.get("port", 3306))

        if not target:
            return ToolResult(success=False, result=None, error="缺少参数: target")

        loop = asyncio.get_event_loop()

        try:
            def _probe():
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(10)
                s.connect((target, port))

                # MySQL 在连接后立即发送 Greeting 包
                data = s.recv(4096)
                s.close()

                if len(data) < 5:
                    return {
                        "target": target, "port": port,
                        "mysql_detected": False,
                        "message": "响应数据过短，可能不是 MySQL 服务",
                    }

                # 解析 MySQL Protocol Handshake (v10)
                # 4 bytes header: 3 bytes length + 1 byte sequence
                pkt_len = struct.unpack("<I", data[0:3] + b"\x00")[0]
                seq = data[3]
                payload = data[4:]

                # 检查是否是错误包
                if payload[0] == 0xFF:
                    err_code = struct.unpack("<H", payload[1:3])[0]
                    err_msg = payload[3:].decode(errors="ignore").strip()
                    return {
                        "target": target, "port": port,
                        "mysql_detected": True,
                        "error_code": err_code,
                        "error_message": err_msg,
                        "message": "MySQL 返回错误（可能禁止该 IP 连接）",
                    }

                # Handshake V10
                protocol_version = payload[0]

                # 服务器版本（null-terminated string）
                ver_end = payload.index(b"\x00", 1)
                server_version = payload[1:ver_end].decode(errors="ignore")
                pos = ver_end + 1

                # Connection ID (4 bytes)
                conn_id = struct.unpack("<I", payload[pos:pos + 4])[0]
                pos += 4

                # Auth plugin data part 1 (8 bytes) + filler (1 byte)
                pos += 8 + 1

                # Capability flags (lower 2 bytes)
                cap_lower = struct.unpack("<H", payload[pos:pos + 2])[0] if pos + 2 <= len(payload) else 0
                pos += 2

                # Character set (1 byte)
                charset = payload[pos] if pos < len(payload) else 0
                pos += 1

                # Status flags (2 bytes)
                status = struct.unpack("<H", payload[pos:pos + 2])[0] if pos + 2 <= len(payload) else 0
                pos += 2

                # Capability flags (upper 2 bytes)
                cap_upper = struct.unpack("<H", payload[pos:pos + 2])[0] if pos + 2 <= len(payload) else 0
                capabilities = cap_lower | (cap_upper << 16)

                # 解析能力标志
                cap_flags = []
                cap_map = {
                    0x00000001: "LONG_PASSWORD",
                    0x00000200: "TRANSACTIONS",
                    0x00000800: "CONNECT_WITH_DB",
                    0x00008000: "SECURE_CONNECTION",
                    0x00080000: "MULTI_STATEMENTS",
                    0x00100000: "MULTI_RESULTS",
                    0x00200000: "PS_MULTI_RESULTS",
                    0x00400000: "PLUGIN_AUTH",
                    0x00800000: "CONNECT_ATTRS",
                    0x08000000: "DEPRECATE_EOF",
                }
                for flag, name in cap_map.items():
                    if capabilities & flag:
                        cap_flags.append(name)

                # 安全发现
                findings = []
                if "5." in server_version and any(server_version.startswith(f"5.{x}") for x in ["0", "1", "5"]):
                    findings.append(f"MySQL 版本较旧 ({server_version})，可能存在已知漏洞")
                if not capabilities & 0x00008000:
                    findings.append("不支持 SECURE_CONNECTION，可能使用旧的认证方式")

                return {
                    "target": target,
                    "port": port,
                    "mysql_detected": True,
                    "protocol_version": protocol_version,
                    "server_version": server_version,
                    "connection_id": conn_id,
                    "charset": charset,
                    "status_flags": status,
                    "capabilities": cap_flags,
                    "findings": findings,
                }

            result = await loop.run_in_executor(None, _probe)
            return ToolResult(success=True, result=result)

        except socket.timeout:
            return ToolResult(success=True, result={
                "target": target, "port": port,
                "mysql_detected": False, "message": "连接超时，服务不可达",
            })
        except ConnectionRefusedError:
            return ToolResult(success=True, result={
                "target": target, "port": port,
                "mysql_detected": False, "message": "连接被拒绝，端口未开放",
            })
        except Exception as e:
            return ToolResult(success=False, result=None, error=f"MySQL 探测失败: {e}")

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "target": {"type": "string", "description": "目标 IP 或域名", "required": True},
                "port": {"type": "integer", "description": "MySQL 端口（默认 3306）", "required": False},
            },
        }
