import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

import secbot_cli.launch_tui as launch_tui


class TestRunTui(unittest.TestCase):
    @patch("secbot_cli.launch_tui.subprocess.run")
    def test_run_tui_inherits_stdio_when_interactive(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            runtime_log = root / "logs" / "tui-runtime.log"
            with patch.object(launch_tui.sys.stdin, "isatty", return_value=True), \
                 patch.object(launch_tui.sys.stdout, "isatty", return_value=True), \
                 patch.object(launch_tui.sys.stderr, "isatty", return_value=True):
                code = launch_tui._run_tui(root, runtime_log=runtime_log)
            runtime_log_exists = runtime_log.exists()
            runtime_log_text = runtime_log.read_text(encoding="utf-8") if runtime_log_exists else ""

        self.assertEqual(code, 0)
        self.assertTrue(runtime_log_exists)
        self.assertIn("interactive TUI attached to current terminal", runtime_log_text)
        kwargs = mock_run.call_args.kwargs
        self.assertIsNone(kwargs["stdout"])
        self.assertIsNone(kwargs["stderr"])
        self.assertEqual(kwargs["cwd"], root / "terminal-ui")
        self.assertEqual(kwargs["env"]["SECBOT_TUI_RUNTIME_LOG"], str(runtime_log))

    @patch("secbot_cli.launch_tui.subprocess.run")
    def test_run_tui_redirects_output_without_interactive_tty(self, mock_run):
        mock_run.return_value = MagicMock(returncode=0)
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            runtime_log = root / "logs" / "tui-runtime.log"
            with patch.object(launch_tui.sys.stdin, "isatty", return_value=False), \
                 patch.object(launch_tui.sys.stdout, "isatty", return_value=False), \
                 patch.object(launch_tui.sys.stderr, "isatty", return_value=False):
                code = launch_tui._run_tui(root, runtime_log=runtime_log)

        self.assertEqual(code, 0)
        kwargs = mock_run.call_args.kwargs
        self.assertEqual(kwargs["cwd"], root / "terminal-ui")
        self.assertEqual(kwargs["env"]["SECBOT_TUI_RUNTIME_LOG"], str(runtime_log))
        self.assertIsNotNone(kwargs["stdout"])
        self.assertIs(kwargs["stdout"], kwargs["stderr"])
        self.assertEqual(Path(kwargs["stdout"].name), runtime_log)


if __name__ == "__main__":
    unittest.main()
