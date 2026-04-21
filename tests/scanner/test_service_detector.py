
import unittest
import asyncio
from unittest.mock import AsyncMock, patch
from secbot_agent.scanner.service_detector import ServiceDetector

class TestServiceDetector(unittest.TestCase):
    def setUp(self):
        self.detector = ServiceDetector()

    def test_detect_service_known_port(self):
        async def run_test():
            result = await self.detector.detect_service("localhost", 80)
            self.assertEqual(result["service"], "http")
            self.assertEqual(result["name"], "HTTP")
        asyncio.run(run_test())

    def test_detect_service_unknown_port(self):
        async def run_test():
            result = await self.detector.detect_service("localhost", 9999)
            self.assertEqual(result["service"], "unknown")
        asyncio.run(run_test())

    @patch("secbot_agent.scanner.port_scanner.PortScanner")
    def test_detect_all_services(self, mock_scanner_cls):
        async def run_test():
            # Mock PortScanner instance
            mock_scanner = AsyncMock()
            mock_scanner.quick_scan.return_value = {
                "host": "localhost",
                "ports": [
                    {"port": 80, "open": True},
                    {"port": 22, "open": True},
                    {"port": 9999, "open": False}
                ]
            }
            mock_scanner_cls.return_value = mock_scanner

            result = await self.detector.detect_all_services("localhost")

            self.assertEqual(result["host"], "localhost")
            self.assertEqual(len(result["services"]), 2)

            services = {s["port"]: s["service"] for s in result["services"]}
            self.assertEqual(services[80], "http")
            self.assertEqual(services[22], "ssh")

        asyncio.run(run_test())

if __name__ == "__main__":
    unittest.main()
