"""哈希工具：计算、识别和验证哈希值"""
import hashlib
import re
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


# 哈希格式特征
HASH_PATTERNS = {
    "MD5": re.compile(r"^[a-fA-F0-9]{32}$"),
    "SHA-1": re.compile(r"^[a-fA-F0-9]{40}$"),
    "SHA-256": re.compile(r"^[a-fA-F0-9]{64}$"),
    "SHA-512": re.compile(r"^[a-fA-F0-9]{128}$"),
    "NTLM": re.compile(r"^[a-fA-F0-9]{32}$"),
    "SHA-384": re.compile(r"^[a-fA-F0-9]{96}$"),
    "SHA-224": re.compile(r"^[a-fA-F0-9]{56}$"),
    "CRC32": re.compile(r"^[a-fA-F0-9]{8}$"),
}


class HashTool(BaseTool):
    """哈希工具：计算文本/文件的哈希值、识别哈希类型、验证哈希"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="hash_tool",
            description="哈希计算、识别和验证。参数: action(hash/identify/verify), text(待哈希文本), file_path(待哈希文件路径), algorithm(md5/sha1/sha256/sha512/all, 默认all), hash_value(待识别或验证的哈希值)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        action = kwargs.get("action", "hash")
        text = kwargs.get("text")
        file_path = kwargs.get("file_path")
        algorithm = kwargs.get("algorithm", "all").lower()
        hash_value = kwargs.get("hash_value")

        try:
            if action == "hash":
                return await self._compute_hash(text, file_path, algorithm)
            elif action == "identify":
                return self._identify_hash(hash_value)
            elif action == "verify":
                return await self._verify_hash(text, file_path, hash_value, algorithm)
            else:
                return ToolResult(success=False, result=None, error=f"未知 action: {action}")
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    async def _compute_hash(self, text, file_path, algorithm) -> ToolResult:
        """计算哈希值"""
        if not text and not file_path:
            return ToolResult(success=False, result=None, error="需要 text 或 file_path 参数")

        data = text.encode() if text else b""
        if file_path:
            with open(file_path, "rb") as f:
                data = f.read()

        algos = ["md5", "sha1", "sha256", "sha512"] if algorithm == "all" else [algorithm]
        hashes = {}
        for algo in algos:
            h = hashlib.new(algo)
            h.update(data)
            hashes[algo.upper()] = h.hexdigest()

        return ToolResult(success=True, result={
            "source": "text" if text else file_path,
            "size_bytes": len(data),
            "hashes": hashes,
        })

    def _identify_hash(self, hash_value) -> ToolResult:
        """识别哈希类型"""
        if not hash_value:
            return ToolResult(success=False, result=None, error="需要 hash_value 参数")

        matches = []
        for name, pattern in HASH_PATTERNS.items():
            if pattern.match(hash_value.strip()):
                matches.append(name)

        return ToolResult(success=True, result={
            "hash_value": hash_value,
            "length": len(hash_value.strip()),
            "possible_types": matches,
        })

    async def _verify_hash(self, text, file_path, hash_value, algorithm) -> ToolResult:
        """验证哈希值"""
        if not hash_value:
            return ToolResult(success=False, result=None, error="需要 hash_value 参数")

        compute_result = await self._compute_hash(text, file_path, algorithm)
        if not compute_result.success:
            return compute_result

        computed = compute_result.result["hashes"]
        match_found = False
        matched_algo = None
        for algo, h in computed.items():
            if h.lower() == hash_value.lower().strip():
                match_found = True
                matched_algo = algo
                break

        return ToolResult(success=True, result={
            "match": match_found,
            "matched_algorithm": matched_algo,
            "expected": hash_value.strip(),
            "computed": computed,
        })

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "action": {"type": "string", "description": "操作: hash/identify/verify", "default": "hash"},
                "text": {"type": "string", "description": "待哈希文本"},
                "file_path": {"type": "string", "description": "待哈希文件路径"},
                "algorithm": {"type": "string", "description": "算法: md5/sha1/sha256/sha512/all", "default": "all"},
                "hash_value": {"type": "string", "description": "待识别或验证的哈希值"},
            },
        }
