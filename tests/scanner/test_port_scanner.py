
import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from secbot_agent.scanner.port_scanner import PortScanner


class TestPortScanner(unittest.TestCase):
    def test_check_port_open(self):
        async def run_test():
            scanner = PortScanner()
            with patch("asyncio.open_connection") as mock_open_connection:
                # Mock the asyncio.open_connection to simulate a successful connection
                mock_open_connection.return_value = (
                    AsyncMock(),
                    AsyncMock(),
                )
                result = await scanner._check_port("localhost", 80)
                self.assertTrue(result)

        asyncio.run(run_test())

    def test_check_port_closed(self):
        async def run_test():
            scanner = PortScanner()
            with patch("asyncio.open_connection") as mock_open_connection:
                # Mock the asyncio.open_connection to simulate a failed connection
                mock_open_connection.side_effect = asyncio.TimeoutError
                result = await scanner._check_port("localhost", 8080)
                self.assertFalse(result)

        asyncio.run(run_test())

    def test_scan_host(self):
        async def run_test():
            scanner = PortScanner()
            with patch("asyncio.open_connection") as mock_open_connection:
                # Simulate port 80 being open and port 443 being closed
                async def side_effect(host, port):
                    if port == 80:
                        return (AsyncMock(), AsyncMock())
                    else:
                        raise ConnectionRefusedError

                mock_open_connection.side_effect = side_effect
                result = await scanner.scan_host("localhost", ports=[80, 443])
                self.assertEqual(result["host"], "localhost")
                self.assertEqual(result["open_count"], 1)
                self.assertEqual(len(result["ports"]), 2)
                self.assertEqual(result["ports"][0]["port"], 80)
                self.assertTrue(result["ports"][0]["open"])
                self.assertEqual(result["ports"][1]["port"], 443)
                self.assertFalse(result["ports"][1]["open"])

        asyncio.run(run_test())


if __name__ == "__main__":
    unittest.main()
