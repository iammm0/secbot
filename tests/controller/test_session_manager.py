
import unittest
from secbot_agent.controller.session_manager import SessionManager

class TestSessionManager(unittest.TestCase):
    def setUp(self):
        self.manager = SessionManager()

    def test_create_session(self):
        session_id = self.manager.create_session("192.168.1.1", "ssh", {"user": "root"})
        self.assertIn(session_id, self.manager.sessions)
        session = self.manager.get_session(session_id)
        self.assertEqual(session["target_ip"], "192.168.1.1")
        self.assertEqual(session["connection_type"], "ssh")
        self.assertEqual(session["status"], "active")

    def test_update_activity(self):
        session_id = self.manager.create_session("192.168.1.1", "ssh", {})
        old_time = self.manager.get_session(session_id)["last_activity"]

        # Ensure time passes
        import time
        time.sleep(0.1)

        self.manager.update_session_activity(session_id)
        new_time = self.manager.get_session(session_id)["last_activity"]
        self.assertNotEqual(old_time, new_time)

    def test_add_command(self):
        session_id = self.manager.create_session("192.168.1.1", "ssh", {})
        self.manager.add_command(session_id, "ls -la", {"stdout": "ok"})

        session = self.manager.get_session(session_id)
        self.assertEqual(len(session["commands_executed"]), 1)
        self.assertEqual(session["commands_executed"][0]["command"], "ls -la")

    def test_close_session(self):
        session_id = self.manager.create_session("192.168.1.1", "ssh", {})
        self.manager.close_session(session_id)

        session = self.manager.get_session(session_id)
        self.assertEqual(session["status"], "closed")
        self.assertIn("closed_at", session)

    def test_list_sessions(self):
        sid1 = self.manager.create_session("1.1.1.1", "ssh", {})
        sid2 = self.manager.create_session("2.2.2.2", "ssh", {})
        self.manager.close_session(sid1)

        all_sessions = self.manager.list_sessions()
        self.assertEqual(len(all_sessions), 2)

        active_sessions = self.manager.list_sessions(status="active")
        self.assertEqual(len(active_sessions), 1)
        self.assertEqual(active_sessions[0]["session_id"], sid2)

    def test_get_session_by_target(self):
        self.manager.create_session("1.1.1.1", "ssh", {})
        self.manager.create_session("1.1.1.1", "winrm", {})
        self.manager.create_session("2.2.2.2", "ssh", {})

        sessions = self.manager.get_session_by_target("1.1.1.1")
        self.assertEqual(len(sessions), 2)

if __name__ == "__main__":
    unittest.main()
