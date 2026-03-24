"""入侵检测工具：检测网络攻击和入侵行为"""
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class IntrusionDetectTool(BaseTool):
    """入侵检测工具：分析日志和流量中的攻击模式"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="intrusion_detect",
            description="检测入侵行为（分析日志/流量中的端口扫描、暴力破解、SQL注入、XSS、DoS、恶意软件等攻击模式）。参数: source_ip(来源IP, 可选), data(待分析数据, 可选), hours(查看最近几小时, 默认24)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        source_ip = kwargs.get("source_ip")
        data = kwargs.get("data")
        hours = int(kwargs.get("hours", 24))

        try:
            from defense.intrusion_detector import IntrusionDetector

            detector = IntrusionDetector()

            result = {}

            # 如果提供了数据，进行实时检测
            if data and source_ip:
                detection = detector.detect_attack(source_ip, data)
                result["realtime_detection"] = detection

            # 获取近期检测到的攻击
            recent = detector.get_recent_attacks(hours=hours)
            result["recent_attacks"] = recent
            result["recent_attack_count"] = len(recent)

            # 获取统计（如果方法存在）
            if hasattr(detector, "get_attack_statistics"):
                stats = detector.get_attack_statistics()
                result["statistics"] = stats
            else:
                # 手动统计
                result["statistics"] = {
                    "total_detected": len(detector.detected_attacks),
                    "attack_counts": dict(detector.attack_counts),
                }

            return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "source_ip": {"type": "string", "description": "来源 IP（实时检测用）"},
                "data": {"type": "string", "description": "待分析数据（实时检测用）"},
                "hours": {"type": "integer", "description": "查看最近几小时的攻击记录", "default": 24},
            },
        }
