"""网络连接分析工具：分析本机当前的网络连接状态"""
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class NetworkAnalyzeTool(BaseTool):
    """网络连接分析工具：分析当前网络连接、流量统计、可疑连接检测"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="network_analyze",
            description="分析本机当前网络连接状态（已建立连接、监听端口、可疑连接、流量统计）。参数: include_traffic(是否含流量统计, 默认true)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        include_traffic = kwargs.get("include_traffic", True)

        try:
            from defense.network_analyzer import NetworkAnalyzer

            analyzer = NetworkAnalyzer()
            try:
                connections = analyzer.analyze_connections()
            except Exception:
                # macOS/Linux 可能需要 root 权限（psutil.net_connections 受限）
                # Fallback: 使用 lsof 或 netstat 命令
                import subprocess
                connections = {
                    "total_connections": 0,
                    "by_status": {},
                    "established": [],
                    "listening": [],
                    "suspicious": [],
                }
                try:
                    # 尝试 netstat
                    res = subprocess.run(
                        ["netstat", "-an"], capture_output=True, text=True, timeout=10,
                    )
                    lines = res.stdout.strip().split("\n")
                    for line in lines:
                        parts = line.split()
                        if len(parts) >= 4:
                            if "ESTABLISHED" in line:
                                connections["established"].append({"raw": line.strip()})
                            elif "LISTEN" in line:
                                connections["listening"].append({"raw": line.strip()})
                    connections["total_connections"] = len(connections["established"]) + len(connections["listening"])
                except Exception:
                    pass

            result = {
                "total_connections": connections.get("total_connections", 0),
                "by_status": dict(connections.get("by_status", {})),
                "established_count": len(connections.get("established", [])),
                "listening_count": len(connections.get("listening", [])),
                "suspicious_count": len(connections.get("suspicious", [])),
                "established": connections.get("established", [])[:20],
                "listening": connections.get("listening", []),
                "suspicious": connections.get("suspicious", []),
            }

            if include_traffic:
                try:
                    traffic = analyzer.analyze_traffic()
                    result["traffic"] = traffic
                except Exception:
                    result["traffic"] = {"error": "无法获取流量统计"}

            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "include_traffic": {"type": "boolean", "description": "是否包含流量统计", "default": True},
            },
        }
