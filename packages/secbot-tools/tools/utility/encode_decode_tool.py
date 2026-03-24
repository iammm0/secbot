"""编码解码工具：Base64、URL、Hex、HTML、Unicode 等编码转换"""
import base64
import urllib.parse
import html
import binascii
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class EncodeDecodeTool(BaseTool):
    """编码解码工具：多种格式之间互转"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="encode_decode",
            description="编码/解码工具（Base64、URL、Hex、HTML实体、Unicode、ROT13、二进制）。参数: action(encode/decode), format(base64/url/hex/html/unicode/rot13/binary), text(待处理文本)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        action = kwargs.get("action", "encode")
        fmt = kwargs.get("format", "base64").lower()
        text = kwargs.get("text", "")
        if not text:
            return ToolResult(success=False, result=None, error="缺少参数: text")

        try:
            if action == "encode":
                result = self._encode(text, fmt)
            elif action == "decode":
                result = self._decode(text, fmt)
            elif action == "auto_detect":
                result = self._auto_detect(text)
            else:
                return ToolResult(success=False, result=None, error=f"未知 action: {action}")

            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def _encode(self, text: str, fmt: str) -> Dict:
        """编码"""
        results = {}
        if fmt == "all":
            for f in ["base64", "url", "hex", "html", "unicode", "rot13", "binary"]:
                results[f] = self._encode_one(text, f)
            return {"input": text, "action": "encode", "results": results}
        return {"input": text, "action": "encode", "format": fmt, "output": self._encode_one(text, fmt)}

    def _decode(self, text: str, fmt: str) -> Dict:
        """解码"""
        return {"input": text, "action": "decode", "format": fmt, "output": self._decode_one(text, fmt)}

    def _auto_detect(self, text: str) -> Dict:
        """自动检测并尝试解码"""
        attempts = {}
        for fmt in ["base64", "url", "hex", "html", "unicode"]:
            try:
                decoded = self._decode_one(text, fmt)
                if decoded and decoded != text:
                    attempts[fmt] = decoded
            except Exception:
                pass
        return {"input": text, "detected_decodings": attempts}

    def _encode_one(self, text: str, fmt: str) -> str:
        if fmt == "base64":
            return base64.b64encode(text.encode()).decode()
        elif fmt == "url":
            return urllib.parse.quote(text)
        elif fmt == "hex":
            return binascii.hexlify(text.encode()).decode()
        elif fmt == "html":
            return html.escape(text)
        elif fmt == "unicode":
            return text.encode("unicode_escape").decode()
        elif fmt == "rot13":
            import codecs
            return codecs.encode(text, "rot_13")
        elif fmt == "binary":
            return " ".join(format(b, "08b") for b in text.encode())
        else:
            raise ValueError(f"不支持的格式: {fmt}")

    def _decode_one(self, text: str, fmt: str) -> str:
        if fmt == "base64":
            return base64.b64decode(text).decode(errors="ignore")
        elif fmt == "url":
            return urllib.parse.unquote(text)
        elif fmt == "hex":
            return binascii.unhexlify(text.strip()).decode(errors="ignore")
        elif fmt == "html":
            return html.unescape(text)
        elif fmt == "unicode":
            return text.encode().decode("unicode_escape")
        elif fmt == "rot13":
            import codecs
            return codecs.decode(text, "rot_13")
        elif fmt == "binary":
            bits = text.replace(" ", "")
            return bytes(int(bits[i:i+8], 2) for i in range(0, len(bits), 8)).decode(errors="ignore")
        else:
            raise ValueError(f"不支持的格式: {fmt}")

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "action": {"type": "string", "description": "操作: encode/decode/auto_detect", "default": "encode"},
                "format": {"type": "string", "description": "格式: base64/url/hex/html/unicode/rot13/binary/all", "default": "base64"},
                "text": {"type": "string", "description": "待处理文本", "required": True},
            },
        }
