"""代码敏感信息扫描工具：扫描文件或目录中的 API Key、密码、Token 等敏感信息"""
import os
import re
from pathlib import Path
from typing import Any, Dict, List
from tools.base import BaseTool, ToolResult


# 内置敏感信息正则规则
DEFAULT_PATTERNS = {
    "AWS Access Key": r"AKIA[0-9A-Z]{16}",
    "AWS Secret Key": r"(?i)aws[_\-]?secret[_\-]?access[_\-]?key[\s=:\"']+([A-Za-z0-9/+=]{40})",
    "GitHub Token": r"gh[pousr]_[A-Za-z0-9_]{36,255}",
    "GitHub OAuth": r"gho_[A-Za-z0-9]{36,255}",
    "Generic API Key": r"(?i)(api[_\-]?key|apikey|api_secret)[\s=:\"']+[A-Za-z0-9\-_]{16,64}",
    "Generic Secret": r"(?i)(secret|password|passwd|pwd|token)[\s]*[=:]+[\s]*['\"][^\s'\"]{8,}['\"]",
    "Private Key": r"-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----",
    "JWT Token": r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    "Slack Token": r"xox[bpors]-[0-9]{10,}-[0-9]{10,}-[A-Za-z0-9]{24,}",
    "Slack Webhook": r"https://hooks\.slack\.com/services/T[A-Z0-9]{8,}/B[A-Z0-9]{8,}/[A-Za-z0-9]{24,}",
    "Google API Key": r"AIza[0-9A-Za-z\\-_]{35}",
    "Heroku API Key": r"(?i)heroku[_\-]?api[_\-]?key[\s=:\"']+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    "Database URL": r"(?i)(mysql|postgres|mongodb|redis)://[^\s'\"<>]{10,}",
    "IP Address (Private)": r"\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b",
    "Email Credentials": r"(?i)(smtp|email)[_\-]?(password|pass|pwd|secret)[\s=:\"']+[^\s'\"]{6,}",
    "Bearer Token": r"(?i)bearer[\s]+[A-Za-z0-9\-_\.]{20,}",
}

# 忽略的文件扩展名
IGNORE_EXTENSIONS = {
    ".pyc", ".pyo", ".exe", ".dll", ".so", ".dylib", ".bin",
    ".jpg", ".jpeg", ".png", ".gif", ".ico", ".svg",
    ".mp3", ".mp4", ".avi", ".mov",
    ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
    ".woff", ".woff2", ".ttf", ".eot",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
}

IGNORE_DIRS = {
    ".git", "__pycache__", "node_modules", ".venv", "venv",
    ".env", ".tox", ".eggs", "dist", "build", ".idea", ".vscode",
}


class SecretScannerTool(BaseTool):
    """代码敏感信息扫描工具"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="secret_scanner",
            description=(
                "扫描文件或目录中的敏感信息（API Key、密码、Token、私钥等）。"
                "参数: path(文件或目录路径), patterns(自定义正则规则,可选), max_files(最大扫描文件数,默认500)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        path_str = kwargs.get("path", "").strip()
        custom_patterns = kwargs.get("patterns", [])
        max_files = int(kwargs.get("max_files", 500))

        if not path_str:
            return ToolResult(success=False, result=None, error="缺少参数: path")

        target = Path(path_str)
        if not target.exists():
            return ToolResult(success=False, result=None, error=f"路径不存在: {path_str}")

        # 构建正则规则
        patterns = dict(DEFAULT_PATTERNS)
        for p in custom_patterns:
            if isinstance(p, dict) and "name" in p and "pattern" in p:
                patterns[p["name"]] = p["pattern"]
            elif isinstance(p, str):
                patterns[f"Custom_{len(patterns)}"] = p

        # 编译正则
        compiled = {}
        for name, pattern in patterns.items():
            try:
                compiled[name] = re.compile(pattern)
            except re.error:
                pass

        # 扫描
        findings = []
        files_scanned = 0
        errors = []

        if target.is_file():
            findings.extend(self._scan_file(target, compiled))
            files_scanned = 1
        else:
            for file_path in self._walk_files(target, max_files):
                files_scanned += 1
                try:
                    findings.extend(self._scan_file(file_path, compiled))
                except Exception as e:
                    errors.append(f"{file_path}: {e}")

        # 去重和排序
        unique_findings = []
        seen = set()
        for f in findings:
            key = (f["file"], f["line"], f["rule"])
            if key not in seen:
                seen.add(key)
                unique_findings.append(f)

        return ToolResult(
            success=True,
            result={
                "path": path_str,
                "files_scanned": files_scanned,
                "findings_count": len(unique_findings),
                "findings": unique_findings[:100],
                "errors": errors[:10] if errors else [],
                "rules_used": len(compiled),
            },
        )

    def _walk_files(self, directory: Path, max_files: int):
        """遍历目录中的文件"""
        count = 0
        for root, dirs, files in os.walk(directory):
            # 过滤忽略的目录
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]

            for fname in files:
                if count >= max_files:
                    return
                fpath = Path(root) / fname
                if fpath.suffix.lower() in IGNORE_EXTENSIONS:
                    continue
                # 跳过大文件（>1MB）
                try:
                    if fpath.stat().st_size > 1_000_000:
                        continue
                except OSError:
                    continue
                count += 1
                yield fpath

    def _scan_file(self, file_path: Path, patterns: Dict[str, re.Pattern]) -> List[Dict]:
        """扫描单个文件"""
        findings = []
        try:
            content = file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return findings

        lines = content.split("\n")
        for line_num, line in enumerate(lines, 1):
            for rule_name, pattern in patterns.items():
                match = pattern.search(line)
                if match:
                    # 脱敏处理
                    matched_text = match.group()
                    if len(matched_text) > 8:
                        masked = matched_text[:4] + "*" * (len(matched_text) - 8) + matched_text[-4:]
                    else:
                        masked = matched_text[:2] + "***"

                    findings.append({
                        "file": str(file_path),
                        "line": line_num,
                        "rule": rule_name,
                        "matched": masked,
                        "context": line.strip()[:120],
                    })

        return findings

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "path": {"type": "string", "description": "扫描路径（文件或目录）", "required": True},
                "patterns": {"type": "array", "description": "自定义正则规则列表（可选）", "required": False},
                "max_files": {"type": "integer", "description": "最大扫描文件数（默认 500）", "required": False},
            },
        }
