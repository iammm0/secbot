
import unittest
from unittest.mock import patch
from secbot_agent.system.controller import OSController
from secbot_agent.system.detector import SystemInfo

class TestOSController(unittest.TestCase):
    @patch("secbot_agent.system.controller.OSDetector")
    @patch("secbot_agent.system.controller.SystemCommands")
    def setUp(self, mock_commands_cls, mock_detector_cls):
        # Mock OSDetector
        self.mock_detector = mock_detector_cls.return_value
        self.mock_detector.detect.return_value = SystemInfo(
            os_type="linux", os_name="Linux", os_version="5.0", os_release="5.0.0",
            architecture="x86_64", processor="x86_64", python_version="3.8",
            hostname="test", username="testuser"
        )

        # Mock SystemCommands
        self.mock_commands = mock_commands_cls.return_value

        self.controller = OSController()

    def test_get_system_info(self):
        info = self.controller.get_system_info()
        self.assertEqual(info["os_type"], "linux")
        self.assertEqual(info["hostname"], "test")

    def test_execute_list_files(self):
        self.mock_commands.list_files.return_value = [{"name": "file1.txt"}]
        result = self.controller.execute("list_files", path=".")
        self.assertTrue(result["success"])
        self.assertEqual(result["result"][0]["name"], "file1.txt")
        self.mock_commands.list_files.assert_called_with(path=".")

    def test_execute_command(self):
        self.mock_commands.execute_command.return_value = {"success": True, "stdout": "ok"}
        result = self.controller.execute("execute_command", command="ls")
        self.assertTrue(result["success"])
        self.assertEqual(result["result"]["stdout"], "ok")
        self.mock_commands.execute_command.assert_called_with(command="ls")

    def test_execute_unknown_action(self):
        result = self.controller.execute("unknown_action")
        self.assertFalse(result["success"])
        self.assertIn("未知操作", result["error"])

if __name__ == "__main__":
    unittest.main()
