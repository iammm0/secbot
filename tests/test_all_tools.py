"""
全部工具导入 & 基础执行测试
运行: python tests/test_all_tools.py
"""

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

PASS = 0
FAIL = 0
SKIP = 0


def mark(name: str, ok: bool, detail: str = ""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✓ {name}  {detail}")
    else:
        FAIL += 1
        print(f"  ✗ {name}  {detail}")


def skip(name: str, reason: str = ""):
    global SKIP
    SKIP += 1
    print(f"  - {name} SKIP {reason}")


# ===================================================================
# 1. 所有工具可导入 + schema 合规
# ===================================================================
def test_import_and_schema():
    print("\n=== 1. 导入 & Schema ===")
    from tools.pentest.security import ALL_SECURITY_TOOLS
    from tools.base import BaseTool

    for t in ALL_SECURITY_TOOLS:
        name = t.name
        is_tool = isinstance(t, BaseTool)
        schema = t.get_schema()
        has_name = schema.get("name") == name
        has_desc = bool(schema.get("description"))
        ok = is_tool and has_name and has_desc
        mark(
            f"{name:22s} schema",
            ok,
            f"params={list(schema.get('parameters', {}).keys())}",
        )


# ===================================================================
# 2. 工具实例化后 dict 名称唯一
# ===================================================================
def test_unique_names():
    print("\n=== 2. 名称唯一性 ===")
    from tools.pentest.security import ALL_SECURITY_TOOLS

    names = [t.name for t in ALL_SECURITY_TOOLS]
    duplicates = [n for n in names if names.count(n) > 1]
    mark(
        "所有工具名称唯一",
        len(set(duplicates)) == 0,
        f"重复: {set(duplicates)}" if duplicates else f"{len(names)} 个名称均唯一",
    )


# ===================================================================
# 3. 快速可执行测试（不依赖外部网络）
# ===================================================================
async def test_hash_tool():
    from tools.utility.hash_tool import HashTool

    t = HashTool()
    # 计算哈希
    r = await t.execute(action="hash", text="hello")
    mark("hash_tool hash", r.success and "MD5" in r.result["hashes"])
    # 识别
    r2 = await t.execute(
        action="identify", hash_value="5d41402abc4b2a76b9719d911017c592"
    )
    mark("hash_tool identify", r2.success and "MD5" in r2.result["possible_types"])
    # 验证
    r3 = await t.execute(
        action="verify",
        text="hello",
        hash_value="5d41402abc4b2a76b9719d911017c592",
        algorithm="md5",
    )
    mark("hash_tool verify", r3.success and r3.result["match"])


async def test_encode_decode_tool():
    from tools.utility.encode_decode_tool import EncodeDecodeTool

    t = EncodeDecodeTool()
    r = await t.execute(action="encode", format="base64", text="hello world")
    mark(
        "encode_decode base64 encode",
        r.success and r.result["output"] == "aGVsbG8gd29ybGQ=",
    )
    r2 = await t.execute(action="decode", format="base64", text="aGVsbG8gd29ybGQ=")
    mark(
        "encode_decode base64 decode",
        r2.success and r2.result["output"] == "hello world",
    )
    r3 = await t.execute(action="encode", format="hex", text="AB")
    mark("encode_decode hex encode", r3.success and r3.result["output"] == "4142")
    r4 = await t.execute(action="encode", format="url", text="hello world&foo=bar")
    mark(
        "encode_decode url encode",
        r4.success and "hello%20world" in r4.result["output"],
    )
    r5 = await t.execute(action="auto_detect", text="aGVsbG8gd29ybGQ=")
    mark(
        "encode_decode auto_detect",
        r5.success and "base64" in r5.result.get("detected_decodings", {}),
    )


async def test_file_analyze_tool():
    from tools.utility.file_analyze_tool import FileAnalyzeTool

    t = FileAnalyzeTool()
    # 分析自己
    r = await t.execute(path=str(Path(__file__)))
    mark("file_analyze self", r.success and r.result["extension"] == ".py")
    # 不存在的文件
    r2 = await t.execute(path="/nonexistent_file_12345.xyz")
    mark("file_analyze nonexistent", not r2.success)


async def test_log_analyze_tool():
    from tools.utility.log_analyze_tool import LogAnalyzeTool

    t = LogAnalyzeTool()
    sample = """
2024-01-15 10:00:01 ERROR Failed password for admin from 192.168.1.100
2024-01-15 10:00:02 ERROR Failed password for admin from 192.168.1.100
2024-01-15 10:00:03 WARNING Login failed: Invalid credentials
2024-01-15 10:00:04 INFO Successful login for user
2024-01-15 10:00:05 ERROR SQL syntax error: UNION SELECT * FROM users
2024-01-15 10:00:06 WARNING <script>alert(1)</script> in parameter
"""
    r = await t.execute(log_text=sample)
    mark("log_analyze", r.success)
    events = r.result["summary"]["security_events"]
    mark(
        "log_analyze found_login", events.get("failed_login", 0) > 0, f"events={events}"
    )
    mark("log_analyze found_sqli", events.get("sql_injection", 0) > 0)
    mark("log_analyze found_xss", events.get("xss_attempt", 0) > 0)


async def test_jwt_analyze_tool():
    from tools.web.jwt_analyze_tool import JwtAnalyzeTool

    t = JwtAnalyzeTool()
    # 标准 JWT (header.payload.signature)
    # header: {"alg":"HS256","typ":"JWT"}, payload: {"sub":"1234567890","name":"Test","iat":1516239022}
    token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlRlc3QiLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    r = await t.execute(token=token)
    mark("jwt_analyze decode", r.success and r.result["header"]["alg"] == "HS256")
    mark("jwt_analyze payload", r.result["payload"]["name"] == "Test")

    # none 算法
    none_token = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIn0."
    r2 = await t.execute(token=none_token)
    mark(
        "jwt_analyze none_alg",
        r2.success
        and any(
            v["severity"] == "CRITICAL" for v in r2.result.get("vulnerabilities", [])
        ),
    )


async def test_dns_tool():
    from tools.pentest.network.dns_lookup_tool import DnsLookupTool

    t = DnsLookupTool()
    r = await t.execute(domain="localhost")
    mark(
        "dns_lookup localhost",
        r.success,
        f"resolved={r.result.get('resolved_ip') if r.result else None}",
    )


async def test_ping_sweep():
    from tools.pentest.network.ping_sweep_tool import PingSweepTool

    t = PingSweepTool()
    r = await t.execute(target="127.0.0.1", timeout=2)
    mark("ping_sweep localhost", r.success and r.result["alive_count"] >= 1)


async def test_banner_grab():
    from tools.pentest.network.banner_grab_tool import BannerGrabTool

    t = BannerGrabTool()
    # 只扫一个不太可能开的端口（快速返回）
    r = await t.execute(host="127.0.0.1", ports=[65432])
    mark("banner_grab 127.0.0.1:65432", r.success)


async def test_system_info():
    from tools.defense.system_info_tool import SystemInfoTool

    t = SystemInfoTool()
    r = await t.execute(category="system")
    mark("system_info", r.success and "system" in r.result)
    if r.success:
        mark("system_info hostname", bool(r.result["system"].get("hostname")))


async def test_network_analyze():
    from tools.defense.network_analyze_tool import NetworkAnalyzeTool

    t = NetworkAnalyzeTool()
    r = await t.execute(include_traffic=False)
    mark("network_analyze", r.success and "total_connections" in r.result)


async def test_self_vuln_scan():
    from tools.defense.self_vuln_scan_tool import SelfVulnScanTool

    t = SelfVulnScanTool()
    r = await t.execute(scan_type="system")
    mark("self_vuln_scan", r.success)


async def test_intrusion_detect():
    from tools.defense.intrusion_detect_tool import IntrusionDetectTool

    t = IntrusionDetectTool()
    r = await t.execute(hours=1)
    mark("intrusion_detect", r.success)


def test_agents_have_tools():
    print("\n=== 4. Agent 工具数量 ===")
    from core.agents.hackbot_agent import HackbotAgent
    from core.agents.superhackbot_agent import SuperHackbotAgent
    from database.manager import DatabaseManager
    from utils.audit import AuditTrail

    db = DatabaseManager()
    audit = AuditTrail(db, "test")

    h = HackbotAgent(audit_trail=audit)
    s = SuperHackbotAgent(audit_trail=audit)

    mark(
        f"Hackbot tools count",
        len(h.security_tools) >= 25,
        f"count={len(h.security_tools)}",
    )
    mark(
        f"SuperHackbot tools count",
        len(s.security_tools) >= 25,
        f"count={len(s.security_tools)}",
    )
    mark("SuperHackbot > Hackbot", len(s.security_tools) > len(h.security_tools))

    # 验证工具名称唯一
    h_names = [t.name for t in h.security_tools]
    s_names = [t.name for t in s.security_tools]
    h_dups = [n for n in h_names if h_names.count(n) > 1]
    s_dups = [n for n in s_names if s_names.count(n) > 1]
    mark("Hackbot names unique", not h_dups, f"重复: {set(h_dups)}" if h_dups else "")
    mark(
        "SuperHackbot names unique",
        not s_dups,
        f"重复: {set(s_dups)}" if s_dups else "",
    )


# ===================================================================
# 运行
# ===================================================================
if __name__ == "__main__":
    test_import_and_schema()
    test_unique_names()

    print("\n=== 3. 基础执行测试 ===")
    asyncio.run(test_hash_tool())
    asyncio.run(test_encode_decode_tool())
    asyncio.run(test_file_analyze_tool())
    asyncio.run(test_log_analyze_tool())
    asyncio.run(test_jwt_analyze_tool())
    asyncio.run(test_dns_tool())
    asyncio.run(test_ping_sweep())
    asyncio.run(test_banner_grab())
    asyncio.run(test_system_info())
    asyncio.run(test_network_analyze())
    asyncio.run(test_self_vuln_scan())
    asyncio.run(test_intrusion_detect())

    test_agents_have_tools()

    print(f"\n{'=' * 60}")
    print(f"  PASS: {PASS}  FAIL: {FAIL}  SKIP: {SKIP}")
    print(f"{'=' * 60}")

    if FAIL > 0:
        sys.exit(1)
