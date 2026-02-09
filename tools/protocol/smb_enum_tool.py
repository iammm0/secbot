"""SMB 枚举工具：探测 SMB 服务的共享目录、OS 版本、签名状态等信息"""
import asyncio
import socket
import struct
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class SmbEnumTool(BaseTool):
    """SMB 协议枚举工具"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="smb_enum",
            description=(
                "探测目标 SMB 服务的基本信息（OS 版本、域名、签名状态、共享目录等）。"
                "参数: target(目标 IP 或域名), port(默认 445)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        target = kwargs.get("target", "").strip()
        port = int(kwargs.get("port", 445))

        if not target:
            return ToolResult(success=False, result=None, error="缺少参数: target")

        loop = asyncio.get_event_loop()

        try:
            # 先尝试使用 impacket
            try:
                return await self._enum_with_impacket(target, port, loop)
            except ImportError:
                pass

            # Fallback: 纯 socket SMB negotiate
            return await self._enum_with_socket(target, port, loop)
        except Exception as e:
            return ToolResult(success=False, result=None, error=f"SMB 枚举失败: {e}")

    async def _enum_with_impacket(self, target: str, port: int, loop) -> ToolResult:
        """使用 impacket 进行详细枚举"""
        from impacket.smbconnection import SMBConnection

        def _enum():
            conn = SMBConnection(target, target, sess_port=port)
            conn.login("", "")  # 匿名登录

            info = {
                "target": target,
                "port": port,
                "server_os": conn.getServerOS(),
                "server_name": conn.getServerName(),
                "server_domain": conn.getServerDomain(),
                "server_dns_domain": conn.getServerDNSDomainName(),
                "signing_required": conn.isSigningRequired(),
                "login_required": conn.isLoginRequired(),
                "shares": [],
            }

            try:
                shares = conn.listShares()
                for share in shares:
                    info["shares"].append({
                        "name": share["shi1_netname"].rstrip("\0"),
                        "type": share["shi1_type"],
                        "remark": share.get("shi1_remark", "").rstrip("\0"),
                    })
            except Exception:
                info["shares_error"] = "无法列出共享（可能需要认证）"

            conn.close()
            return info

        result = await loop.run_in_executor(None, _enum)
        return ToolResult(success=True, result=result)

    async def _enum_with_socket(self, target: str, port: int, loop) -> ToolResult:
        """纯 socket 方式发送 SMB Negotiate 请求"""

        def _negotiate():
            # SMB1 Negotiate Protocol Request
            negotiate_packet = (
                b"\x00\x00\x00\x55"  # NetBIOS header (length 85)
                b"\xff\x53\x4d\x42"  # SMB magic
                b"\x72"              # Command: Negotiate
                b"\x00\x00\x00\x00"  # Status
                b"\x18"              # Flags
                b"\x53\xc8"          # Flags2
                b"\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00"  # Extra
                b"\x00\x00\x00\x00\x00\x00\x00\x00"  # Extra
                b"\x00\x00"          # TID
                b"\xff\xfe"          # PID
                b"\x00\x00"          # UID
                b"\x00\x00"          # MID
                b"\x00"              # WCT
                b"\x24\x00"          # BCC (36)
                b"\x02\x4e\x54\x20\x4c\x4d\x20\x30\x2e\x31\x32\x00"  # NT LM 0.12
                b"\x02\x53\x4d\x42\x20\x32\x2e\x30\x30\x32\x00"      # SMB 2.002
                b"\x02\x53\x4d\x42\x20\x32\x2e\x3f\x3f\x3f\x00"      # SMB 2.???
            )

            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(10)
            s.connect((target, port))
            s.send(negotiate_packet)
            data = s.recv(4096)
            s.close()

            info = {
                "target": target,
                "port": port,
                "smb_available": True,
                "raw_response_length": len(data),
            }

            # 尝试解析 SMB1 Negotiate Response
            if len(data) > 36 and data[4:8] == b"\xff\x53\x4d\x42":
                info["protocol"] = "SMB1"
                info["signing"] = "required" if (data[26] & 0x08) else "optional"
            elif len(data) > 72 and data[4:8] == b"\xfe\x53\x4d\x42":
                info["protocol"] = "SMB2+"
                if len(data) > 70:
                    dialect = struct.unpack("<H", data[72:74])[0] if len(data) > 74 else 0
                    info["dialect"] = f"0x{dialect:04x}"
                    info["signing"] = "required" if (data[70] & 0x01) else "optional"

            return info

        result = await loop.run_in_executor(None, _negotiate)
        return ToolResult(success=True, result=result)

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "target": {"type": "string", "description": "目标 IP 或域名", "required": True},
                "port": {"type": "integer", "description": "SMB 端口（默认 445）", "required": False},
            },
        }
