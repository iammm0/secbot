"""服务识别工具"""
from typing import Any, Dict
from tools.base import BaseTool, ToolResult


class ServiceDetectTool(BaseTool):
    """服务识别工具：识别目标主机上运行的服务"""

    sensitivity = "low"

    def __init__(self):
        super().__init__(
            name="service_detect",
            description="识别目标主机上运行的服务。参数: host(目标IP/域名), ports(需要检测的端口列表, 可选)",
        )

    async def execute(self, **kwargs) -> ToolResult:
        from scanner.service_detector import ServiceDetector

        host = kwargs.get("host", "")
        if not host:
            return ToolResult(success=False, result=None, error="缺少参数: host")

        ports = kwargs.get("ports")

        try:
            detector = ServiceDetector()
            if ports:
                results = []
                for port in ports:
                    svc = await detector.detect_service(host, port)
                    results.append(svc)
                return ToolResult(success=True, result={"host": host, "services": results})
            else:
                result = await detector.detect_all_services(host)
                return ToolResult(success=True, result=result)
        except Exception as e:
            return ToolResult(success=False, result=None, error=str(e))

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "host": {"type": "string", "description": "目标主机 IP 或域名", "required": True},
                "ports": {"type": "array", "description": "端口列表（可选，不传则自动检测）"},
            },
        }
