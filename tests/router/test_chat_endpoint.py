
import unittest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient
from router.main import app

class TestChatEndpoint(unittest.TestCase):
    @patch("router.sessions.get_agents")
    @patch("router.sessions.get_session_manager")
    @patch("router.main.get_db_manager")
    def test_chat_process(self, mock_get_db, mock_get_sessions, mock_get_agents):
        # Mock dependencies
        mock_get_db.return_value = MagicMock()

        mock_session_manager = MagicMock()
        # Mock session creation/retrieval
        mock_session_manager.get_session.return_value = {
            "session_id": "test_session",
            "messages": []
        }
        mock_session_manager.create_session.return_value = "test_session"
        mock_get_sessions.return_value = mock_session_manager

        mock_agent = AsyncMock()
        mock_agent.process.return_value = "Agent response"
        mock_get_agents.return_value = {"secbot-cli": mock_agent}

        with TestClient(app) as client:
            response = client.post("/api/chat", json={
                "message": "Hello",
                "agent_type": "secbot-cli"
            })

            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["response"], "Agent response")

            # Verify interactions
            mock_agent.process.assert_called_once()
            # Verify session was updated (if logic does so)
            # In router/sessions.py, it calls session_manager.add_message etc?
            # Or agent handles history?
            # SessionManager usually handles history persistence.

    @patch("router.sessions.get_agents")
    @patch("router.sessions.get_session_manager")
    @patch("router.main.get_db_manager")
    def test_chat_invalid_agent(self, mock_get_db, mock_get_sessions, mock_get_agents):
        mock_get_db.return_value = MagicMock()
        mock_get_sessions.return_value = MagicMock()
        mock_get_agents.return_value = {} # No agents

        with TestClient(app) as client:
            response = client.post("/api/chat", json={
                "message": "Hello",
                "agent_type": "invalid"
            })

            self.assertEqual(response.status_code, 400)

if __name__ == "__main__":
    unittest.main()
