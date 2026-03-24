"""文件分析工具：分析文件类型、哈希、元数据、内容特征"""
import hashlib
import os
import mimetypes
from pathlib import Path
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class FileAnalyzeTool(BaseTool):
    """文件分析工具：获取文件类型、大小、哈希值、权限、元数据、可疑特征"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="file_analyze",
            description="分析文件属性（类型、大小、哈希、权限、可疑特征等）。参数: path(文件路径), deep(是否深度分析内容, 默认false)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        file_path = kwargs.get("path", "")
        if not file_path:
            return ToolResult(success=False, result=None, error="缺少参数: path")

        deep = kwargs.get("deep", False)

        try:
            p = Path(file_path)
            if not p.exists():
                return ToolResult(success=False, result=None, error=f"文件不存在: {file_path}")

            stat = p.stat()
            mime_type, _ = mimetypes.guess_type(str(p))

            # 基本信息
            result = {
                "path": str(p.resolve()),
                "name": p.name,
                "extension": p.suffix,
                "mime_type": mime_type,
                "size_bytes": stat.st_size,
                "size_human": self._human_size(stat.st_size),
                "permissions": oct(stat.st_mode)[-3:],
                "owner_uid": stat.st_uid,
                "group_gid": stat.st_gid,
                "created": stat.st_ctime,
                "modified": stat.st_mtime,
                "accessed": stat.st_atime,
                "is_symlink": p.is_symlink(),
                "is_executable": os.access(str(p), os.X_OK),
            }

            # 计算哈希（限制 100MB）
            if stat.st_size < 100 * 1024 * 1024:
                with open(p, "rb") as f:
                    data = f.read()
                result["hashes"] = {
                    "md5": hashlib.md5(data).hexdigest(),
                    "sha1": hashlib.sha1(data).hexdigest(),
                    "sha256": hashlib.sha256(data).hexdigest(),
                }

                # Magic bytes
                result["magic_bytes"] = data[:16].hex() if len(data) >= 16 else data.hex()
                result["detected_type"] = self._detect_magic(data[:16])
            else:
                result["hashes"] = "文件过大，跳过哈希计算"

            # 深度分析
            if deep and stat.st_size < 10 * 1024 * 1024:
                result["deep_analysis"] = self._deep_analyze(p, data if stat.st_size < 100 * 1024 * 1024 else None)

            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def _human_size(self, size: int) -> str:
        for unit in ["B", "KB", "MB", "GB"]:
            if size < 1024:
                return f"{size:.1f} {unit}"
            size /= 1024
        return f"{size:.1f} TB"

    def _detect_magic(self, header: bytes) -> str:
        """基于 magic bytes 识别文件类型"""
        signatures = {
            b"\x89PNG": "PNG 图片",
            b"\xff\xd8\xff": "JPEG 图片",
            b"GIF87a": "GIF 图片",
            b"GIF89a": "GIF 图片",
            b"PK\x03\x04": "ZIP 压缩包 / Office 文档",
            b"\x1f\x8b": "GZIP 压缩",
            b"BZ": "BZIP2 压缩",
            b"\x7fELF": "ELF 可执行文件",
            b"MZ": "PE 可执行文件 (Windows)",
            b"%PDF": "PDF 文档",
            b"\xfe\xed\xfa": "Mach-O 可执行文件 (macOS)",
            b"\xcf\xfa\xed\xfe": "Mach-O 可执行文件 (macOS, 64-bit)",
            b"SQLite": "SQLite 数据库",
            b"\xfd7zXZ": "XZ 压缩",
        }
        for sig, desc in signatures.items():
            if header.startswith(sig):
                return desc
        return "未知类型"

    def _deep_analyze(self, path: Path, data: bytes) -> Dict:
        """深度分析文件内容"""
        analysis = {"suspicious_patterns": []}

        if data is None:
            return analysis

        text = data.decode(errors="ignore")

        # 检测可疑模式
        suspicious = {
            "shell_command": ["#!/bin/sh", "#!/bin/bash", "/bin/sh", "exec(", "eval(", "system("],
            "ip_address": [],
            "url": [],
            "email": [],
            "base64_blob": [],
            "encoded_payload": ["\\x", "\\u00", "fromCharCode"],
            "sql_injection": ["UNION SELECT", "DROP TABLE", "' OR '1'='1"],
        }

        for category, patterns in suspicious.items():
            for pattern in patterns:
                if pattern.lower() in text.lower():
                    analysis["suspicious_patterns"].append({
                        "category": category,
                        "pattern": pattern,
                    })

        # 统计信息
        analysis["line_count"] = text.count("\n") + 1
        analysis["null_bytes"] = data.count(b"\x00")
        analysis["is_text"] = analysis["null_bytes"] < len(data) * 0.1
        analysis["entropy"] = self._calc_entropy(data)

        return analysis

    def _calc_entropy(self, data: bytes) -> float:
        """计算文件熵值（越接近 8 越可能是加密/压缩的）"""
        import math
        from collections import Counter

        if not data:
            return 0.0
        counts = Counter(data)
        length = len(data)
        entropy = -sum(
            (count / length) * math.log2(count / length)
            for count in counts.values()
        )
        return round(entropy, 4)

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "path": {"type": "string", "description": "文件路径", "required": True},
                "deep": {"type": "boolean", "description": "是否深度分析文件内容", "default": False},
            },
        }
