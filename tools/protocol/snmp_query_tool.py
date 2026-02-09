"""SNMP 查询工具：通过 SNMP 协议查询目标设备的系统信息、接口列表等"""
import asyncio
import socket
import struct
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


# 常用 OID
COMMON_OIDS = {
    "sysDescr": "1.3.6.1.2.1.1.1.0",
    "sysObjectID": "1.3.6.1.2.1.1.2.0",
    "sysUpTime": "1.3.6.1.2.1.1.3.0",
    "sysContact": "1.3.6.1.2.1.1.4.0",
    "sysName": "1.3.6.1.2.1.1.5.0",
    "sysLocation": "1.3.6.1.2.1.1.6.0",
    "sysServices": "1.3.6.1.2.1.1.7.0",
}


class SnmpQueryTool(BaseTool):
    """SNMP 信息查询工具"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="snmp_query",
            description=(
                "通过 SNMP 协议查询目标设备信息（系统描述、联系人、位置等）。"
                "参数: target(目标 IP), community(社区字符串,默认 public), "
                "oid(OID 或预设名称: sysDescr/sysName/sysLocation 等, 默认查询全部常用 OID)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        target = kwargs.get("target", "").strip()
        community = kwargs.get("community", "public").strip()
        oid = kwargs.get("oid", "").strip()

        if not target:
            return ToolResult(success=False, result=None, error="缺少参数: target")

        loop = asyncio.get_event_loop()

        try:
            # 优先使用 pysnmp
            try:
                return await self._query_with_pysnmp(target, community, oid, loop)
            except ImportError:
                pass

            # Fallback: 纯 socket 实现（仅支持 SNMPv1 GET）
            return await self._query_with_socket(target, community, oid, loop)

        except Exception as e:
            return ToolResult(success=False, result=None, error=f"SNMP 查询失败: {e}")

    async def _query_with_pysnmp(self, target, community, oid, loop) -> ToolResult:
        """使用 pysnmp 库查询"""
        from pysnmp.hlapi import (
            getCmd, SnmpEngine, CommunityData, UdpTransportTarget,
            ContextData, ObjectType, ObjectIdentity,
        )

        results = {}

        if oid:
            oids_to_query = {oid: COMMON_OIDS.get(oid, oid)}
        else:
            oids_to_query = COMMON_OIDS

        def _query_single(oid_name, oid_value):
            iterator = getCmd(
                SnmpEngine(),
                CommunityData(community, mpModel=0),
                UdpTransportTarget((target, 161), timeout=5, retries=1),
                ContextData(),
                ObjectType(ObjectIdentity(oid_value)),
            )
            errorIndication, errorStatus, errorIndex, varBinds = next(iterator)
            if errorIndication:
                return oid_name, f"错误: {errorIndication}"
            elif errorStatus:
                return oid_name, f"错误: {errorStatus.prettyPrint()}"
            else:
                for varBind in varBinds:
                    return oid_name, str(varBind[1])
            return oid_name, None

        for name, oid_val in oids_to_query.items():
            try:
                k, v = await loop.run_in_executor(None, _query_single, name, oid_val)
                if v is not None:
                    results[k] = v
            except Exception as e:
                results[name] = f"查询失败: {e}"

        return ToolResult(
            success=True,
            result={
                "target": target,
                "community": community,
                "protocol": "SNMPv1",
                "results": results,
            },
        )

    async def _query_with_socket(self, target, community, oid, loop) -> ToolResult:
        """使用纯 socket 发送 SNMPv1 GET 请求"""

        if oid:
            oids_to_query = {oid: COMMON_OIDS.get(oid, oid)}
        else:
            oids_to_query = COMMON_OIDS

        results = {}

        for name, oid_str in oids_to_query.items():
            try:
                def _query(o=oid_str):
                    return self._snmp_get(target, community, o)
                value = await loop.run_in_executor(None, _query)
                if value is not None:
                    results[name] = value
            except Exception as e:
                results[name] = f"查询失败: {e}"

        if not results:
            return ToolResult(
                success=True,
                result={
                    "target": target,
                    "accessible": False,
                    "message": "SNMP 服务不可达或社区字符串错误",
                },
            )

        return ToolResult(
            success=True,
            result={
                "target": target,
                "community": community,
                "protocol": "SNMPv1 (socket)",
                "results": results,
            },
        )

    def _snmp_get(self, target: str, community: str, oid_str: str, timeout: int = 5) -> str:
        """构造并发送 SNMPv1 GET 请求（纯 socket）"""
        # 将 OID 字符串转为数字列表
        oid_parts = [int(x) for x in oid_str.split(".")]

        # 编码 OID
        oid_bytes = self._encode_oid(oid_parts)

        # 构造 SNMP GET 报文
        community_bytes = community.encode()

        # VarBind: SEQUENCE { OID, NULL }
        varbind = self._asn1_sequence(oid_bytes + b"\x05\x00")  # OID + NULL
        varbind_list = self._asn1_sequence(varbind)

        # PDU: GetRequest
        request_id = b"\x02\x01\x01"  # INTEGER 1
        error_status = b"\x02\x01\x00"
        error_index = b"\x02\x01\x00"
        pdu = b"\xa0" + self._asn1_length(
            len(request_id) + len(error_status) + len(error_index) + len(varbind_list)
        ) + request_id + error_status + error_index + varbind_list

        # SNMP Message
        version = b"\x02\x01\x00"  # SNMPv1
        community_enc = b"\x04" + self._asn1_length(len(community_bytes)) + community_bytes
        message = self._asn1_sequence(version + community_enc + pdu)

        # 发送
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(timeout)
        s.sendto(message, (target, 161))
        data, _ = s.recvfrom(4096)
        s.close()

        # 解析响应（简单提取值）
        return self._extract_value(data)

    def _encode_oid(self, parts: list) -> bytes:
        """ASN.1 编码 OID"""
        if len(parts) < 2:
            return b""
        encoded = bytes([parts[0] * 40 + parts[1]])
        for part in parts[2:]:
            if part < 128:
                encoded += bytes([part])
            else:
                # 多字节编码
                chunks = []
                val = part
                while val > 0:
                    chunks.append(val & 0x7F)
                    val >>= 7
                chunks.reverse()
                for i in range(len(chunks) - 1):
                    chunks[i] |= 0x80
                encoded += bytes(chunks)
        return b"\x06" + self._asn1_length(len(encoded)) + encoded

    def _asn1_length(self, length: int) -> bytes:
        if length < 128:
            return bytes([length])
        elif length < 256:
            return bytes([0x81, length])
        else:
            return bytes([0x82, (length >> 8) & 0xFF, length & 0xFF])

    def _asn1_sequence(self, data: bytes) -> bytes:
        return b"\x30" + self._asn1_length(len(data)) + data

    def _extract_value(self, data: bytes) -> str:
        """从 SNMP 响应中提取值（简化解析）"""
        # 查找 OctetString (0x04) 或 Integer (0x02) 或 TimeTicks (0x43)
        i = len(data) - 1
        while i > 0:
            tag = data[i]
            if tag in (0x04, 0x02, 0x43, 0x41, 0x42, 0x06, 0x40):
                break
            i -= 1

        # 从后往前查找最后一个值
        for pos in range(len(data) - 2, 4, -1):
            tag = data[pos]
            if tag == 0x04:  # OctetString
                length = data[pos + 1]
                if pos + 2 + length <= len(data):
                    return data[pos + 2:pos + 2 + length].decode(errors="ignore")
            elif tag == 0x02:  # Integer
                length = data[pos + 1]
                if length <= 4 and pos + 2 + length <= len(data):
                    val = int.from_bytes(data[pos + 2:pos + 2 + length], "big", signed=True)
                    return str(val)
            elif tag == 0x43:  # TimeTicks
                length = data[pos + 1]
                if length <= 4 and pos + 2 + length <= len(data):
                    val = int.from_bytes(data[pos + 2:pos + 2 + length], "big")
                    return f"{val / 100:.0f} 秒"

        return "(无法解析)"

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "target": {"type": "string", "description": "目标 IP 地址", "required": True},
                "community": {"type": "string", "description": "SNMP 社区字符串（默认 public）", "required": False},
                "oid": {"type": "string", "description": "OID 或预设名称（默认查询全部常用）", "required": False},
            },
        }
