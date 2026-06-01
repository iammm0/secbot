import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BaseTool, ToolResult } from '../core/base-tool';

type Severity = 'critical' | 'high' | 'medium' | 'low';
type Category =
  | 'sql_injection'
  | 'xss'
  | 'command_injection'
  | 'path_traversal'
  | 'insecure_deserialization'
  | 'ssrf'
  | 'eval_exec'
  | 'hardcoded_secret'
  | 'weak_crypto'
  | 'info_leak';

interface Rule {
  id: string;
  category: Category;
  severity: Severity;
  pattern: RegExp;
  languages: string[];
  description: string;
  remediation: string;
}

const RULES: Rule[] = [
  // SQL Injection
  {
    id: 'SQLI-001',
    category: 'sql_injection',
    severity: 'critical',
    pattern: /(?:query|execute|exec|raw)\s*\(\s*[`"'].*?\$\{/,
    languages: ['js', 'ts'],
    description: 'String interpolation in SQL query',
    remediation: 'Use parameterized queries or prepared statements',
  },
  {
    id: 'SQLI-002',
    category: 'sql_injection',
    severity: 'critical',
    pattern: /(?:execute|cursor\.execute|\.query)\s*\(\s*f["']/,
    languages: ['python'],
    description: 'f-string in SQL query',
    remediation: 'Use parameterized queries with %s or ? placeholders',
  },
  {
    id: 'SQLI-003',
    category: 'sql_injection',
    severity: 'critical',
    pattern: /(?:execute|query|prepare)\s*\(\s*["'].*?\+\s*(?:req\.|params\.|request\.|input)/,
    languages: ['js', 'ts', 'java', 'php'],
    description: 'String concatenation with user input in SQL',
    remediation: 'Use parameterized queries',
  },
  {
    id: 'SQLI-004',
    category: 'sql_injection',
    severity: 'critical',
    pattern: /\$(?:_GET|_POST|_REQUEST)\s*\[.*?\].*?(?:mysql_query|mysqli_query|pg_query)/,
    languages: ['php'],
    description: 'Direct superglobal in SQL query',
    remediation: 'Use PDO prepared statements',
  },

  // XSS
  {
    id: 'XSS-001',
    category: 'xss',
    severity: 'high',
    pattern: /innerHTML\s*=\s*(?!['"`]\s*['"`])/,
    languages: ['js', 'ts'],
    description: 'Direct innerHTML assignment',
    remediation: 'Use textContent or sanitize with DOMPurify',
  },
  {
    id: 'XSS-002',
    category: 'xss',
    severity: 'high',
    pattern: /document\.write\s*\(/,
    languages: ['js', 'ts'],
    description: 'document.write usage',
    remediation: 'Use DOM manipulation methods instead',
  },
  {
    id: 'XSS-003',
    category: 'xss',
    severity: 'high',
    pattern: /dangerouslySetInnerHTML/,
    languages: ['js', 'ts'],
    description: 'React dangerouslySetInnerHTML',
    remediation: 'Sanitize HTML with DOMPurify before rendering',
  },
  {
    id: 'XSS-004',
    category: 'xss',
    severity: 'high',
    pattern: /\|\s*safe\b|\{\{\s*.*?\s*\|\s*raw\s*\}\}|<%[-=].*?%>/,
    languages: ['python', 'ruby', 'js'],
    description: 'Unescaped template output',
    remediation: 'Remove safe/raw filter or sanitize input',
  },

  // Command Injection
  {
    id: 'CMDI-001',
    category: 'command_injection',
    severity: 'critical',
    pattern: /(?:exec|execSync|spawn|spawnSync|execFile)\s*\(\s*[`"'].*?\$\{/,
    languages: ['js', 'ts'],
    description: 'Template literal in shell command',
    remediation: 'Use array-based spawn with no shell interpolation',
  },
  {
    id: 'CMDI-002',
    category: 'command_injection',
    severity: 'critical',
    pattern: /os\.(?:system|popen)\s*\(\s*f["']|subprocess\.(?:call|run|Popen)\s*\(\s*f["']/,
    languages: ['python'],
    description: 'f-string in shell command',
    remediation: 'Use subprocess with list args, never shell=True with user input',
  },
  {
    id: 'CMDI-003',
    category: 'command_injection',
    severity: 'critical',
    pattern: /(?:shell_exec|system|passthru|exec|popen)\s*\(\s*\$(?:_GET|_POST|_REQUEST)/,
    languages: ['php'],
    description: 'User input in shell function',
    remediation: 'Use escapeshellarg() and escapeshellcmd()',
  },
  {
    id: 'CMDI-004',
    category: 'command_injection',
    severity: 'critical',
    pattern: /Runtime\.getRuntime\(\)\.exec\s*\(.*?\+/,
    languages: ['java'],
    description: 'String concatenation in Runtime.exec',
    remediation: 'Use ProcessBuilder with argument array',
  },

  // Path Traversal
  {
    id: 'PATH-001',
    category: 'path_traversal',
    severity: 'high',
    pattern:
      /(?:readFile|readFileSync|createReadStream|open)\s*\(.*?(?:req\.|params\.|query\.|input)/,
    languages: ['js', 'ts'],
    description: 'User input in file path',
    remediation: 'Validate and resolve path against a base directory',
  },
  {
    id: 'PATH-002',
    category: 'path_traversal',
    severity: 'high',
    pattern: /open\s*\(\s*(?:request\.|params\[|os\.path\.join\(.*?,\s*request\.)/,
    languages: ['python'],
    description: 'User input in file open',
    remediation: 'Use os.path.realpath and verify prefix',
  },

  // SSRF
  {
    id: 'SSRF-001',
    category: 'ssrf',
    severity: 'high',
    pattern:
      /(?:fetch|axios|got|request|http\.get|urllib)\s*\(\s*(?:req\.|params\.|query\.|request\.)/,
    languages: ['js', 'ts', 'python'],
    description: 'User-controlled URL in HTTP request',
    remediation: 'Validate URL against allowlist, block internal IPs',
  },

  // Eval / Exec
  {
    id: 'EVAL-001',
    category: 'eval_exec',
    severity: 'critical',
    pattern: /\beval\s*\(\s*(?!['"`]\s*['"`])/,
    languages: ['js', 'ts', 'python', 'php', 'ruby'],
    description: 'eval() usage with dynamic input',
    remediation: 'Avoid eval; use safe alternatives (JSON.parse, AST, etc.)',
  },
  {
    id: 'EVAL-002',
    category: 'eval_exec',
    severity: 'high',
    pattern: /new\s+Function\s*\(/,
    languages: ['js', 'ts'],
    description: 'new Function() constructor (equivalent to eval)',
    remediation: 'Avoid dynamic code generation',
  },
  {
    id: 'EVAL-003',
    category: 'eval_exec',
    severity: 'critical',
    pattern: /(?:pickle\.loads?|yaml\.(?:load|unsafe_load))\s*\(/,
    languages: ['python'],
    description: 'Insecure deserialization (pickle/yaml)',
    remediation: 'Use yaml.safe_load; avoid pickle with untrusted data',
  },

  // Insecure Deserialization
  {
    id: 'DESER-001',
    category: 'insecure_deserialization',
    severity: 'critical',
    pattern: /(?:ObjectInputStream|readObject|XMLDecoder|Unmarshaller)\s*\(/,
    languages: ['java'],
    description: 'Java deserialization sink',
    remediation: 'Use allowlist-based ObjectInputFilter or avoid native serialization',
  },
  {
    id: 'DESER-002',
    category: 'insecure_deserialization',
    severity: 'critical',
    pattern: /unserialize\s*\(\s*\$/,
    languages: ['php'],
    description: 'PHP unserialize with user input',
    remediation: 'Use json_decode instead; validate input type',
  },

  // Hardcoded Secrets
  {
    id: 'SECRET-001',
    category: 'hardcoded_secret',
    severity: 'high',
    pattern:
      /(?:password|passwd|secret|api_key|apikey|token|private_key)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    languages: ['js', 'ts', 'python', 'java', 'go', 'ruby', 'php'],
    description: 'Hardcoded credential or secret',
    remediation: 'Use environment variables or a secrets manager',
  },

  // Weak Crypto
  {
    id: 'CRYPTO-001',
    category: 'weak_crypto',
    severity: 'medium',
    pattern: /(?:createHash|hashlib\.)\s*\(\s*['"](?:md5|sha1)['"]/,
    languages: ['js', 'ts', 'python'],
    description: 'Weak hash algorithm (MD5/SHA1)',
    remediation: 'Use SHA-256 or stronger; for passwords use bcrypt/argon2',
  },
  {
    id: 'CRYPTO-002',
    category: 'weak_crypto',
    severity: 'medium',
    pattern: /(?:DES|RC4|Blowfish|ECB)/i,
    languages: ['js', 'ts', 'python', 'java', 'go'],
    description: 'Weak or deprecated cipher',
    remediation: 'Use AES-GCM or ChaCha20-Poly1305',
  },

  // Info Leak
  {
    id: 'INFO-001',
    category: 'info_leak',
    severity: 'low',
    pattern:
      /(?:console\.log|print|System\.out\.println|fmt\.Print)\s*\(.*(?:password|secret|token|key)/i,
    languages: ['js', 'ts', 'python', 'java', 'go'],
    description: 'Sensitive data in log output',
    remediation: 'Remove or mask sensitive values before logging',
  },
  {
    id: 'INFO-002',
    category: 'info_leak',
    severity: 'medium',
    pattern: /(?:stack_trace|stackTrace|traceback|DEBUG\s*=\s*True)/,
    languages: ['js', 'ts', 'python', 'java', 'php'],
    description: 'Debug/stack trace exposure in production',
    remediation: 'Disable debug mode and generic error pages in production',
  },
];

const LANG_EXTENSIONS: Record<string, string[]> = {
  js: ['.js', '.jsx', '.mjs', '.cjs'],
  ts: ['.ts', '.tsx', '.mts', '.cts'],
  python: ['.py'],
  java: ['.java'],
  php: ['.php'],
  go: ['.go'],
  ruby: ['.rb'],
};

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'vendor',
  'target',
  'bin',
  'obj',
  '.idea',
  '.vscode',
]);

export class CodeAuditTool extends BaseTool {
  constructor() {
    super(
      'code_audit',
      '静态代码安全审计 — 扫描源码中的安全漏洞模式（SQLi、XSS、命令注入、路径遍历、SSRF、反序列化等）',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.path ?? '').trim();
    if (!target) {
      return { success: false, result: null, error: '缺少必要参数: path' };
    }

    const maxFiles = Math.min(Number(params.max_files) || 500, 2000);
    const language = params.language ? String(params.language).trim().toLowerCase() : undefined;
    const categories = params.categories as Category[] | undefined;

    try {
      const stat = await fs.stat(target);
      const files = stat.isFile() ? [target] : await this.walk(target, maxFiles, language);

      const findings: Array<Record<string, unknown>> = [];
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        const lang = this.detectLang(ext);
        if (!lang) continue;

        const content = await fs.readFile(file, 'utf8').catch(() => null);
        if (!content) continue;

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (const rule of RULES) {
            if (!rule.languages.includes(lang)) continue;
            if (categories && !categories.includes(rule.category)) continue;
            if (rule.pattern.test(line)) {
              findings.push({
                file,
                line: i + 1,
                rule_id: rule.id,
                category: rule.category,
                severity: rule.severity,
                description: rule.description,
                remediation: rule.remediation,
                snippet: line.trim().slice(0, 120),
              });
            }
          }
        }
      }

      const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
      for (const f of findings) bySeverity[f.severity as Severity]++;

      return {
        success: true,
        result: {
          path: target,
          files_scanned: files.length,
          total_findings: findings.length,
          by_severity: bySeverity,
          findings: findings.slice(0, 200),
        },
      };
    } catch (error) {
      return { success: false, result: null, error: `代码审计失败: ${(error as Error).message}` };
    }
  }

  private detectLang(ext: string): string | null {
    for (const [lang, exts] of Object.entries(LANG_EXTENSIONS)) {
      if (exts.includes(ext)) return lang;
    }
    return null;
  }

  private async walk(root: string, maxFiles: number, langFilter?: string): Promise<string[]> {
    const allowedExts = langFilter
      ? new Set(LANG_EXTENSIONS[langFilter] ?? [])
      : new Set(Object.values(LANG_EXTENSIONS).flat());

    const queue: string[] = [root];
    const files: string[] = [];

    while (queue.length > 0 && files.length < maxFiles) {
      const dir = queue.shift()!;
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (files.length >= maxFiles) break;
        if (entry.isDirectory()) {
          if (!IGNORE_DIRS.has(entry.name)) queue.push(path.join(dir, entry.name));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (allowedExts.has(ext)) files.push(path.join(dir, entry.name));
        }
      }
    }
    return files;
  }
}
