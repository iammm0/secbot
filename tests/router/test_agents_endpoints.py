
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from router.main import app

class TestAgentsEndpoints(unittest.TestCase):
    @patch("router.agents.get_agents")
    @patch("router.main.get_db_manager")
    def test_list_agents(self, mock_get_db, mock_get_agents):
        # Mock database
        mock_get_db.return_value = MagicMock()
        
        # Mock agents
        mock_agent = MagicMock()
        mock_agent.name = "Hackbot"
        mock_get_agents.return_value = {"hackbot": mock_agent}
        
        with TestClient(app) as client:
            response = client.get("/api/agents")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(len(data["agents"]), 1)
            self.assertEqual(data["agents"][0]["type"], "hackbot")

    @patch("router.agents.get_agents")
    @patch("router.main.get_db_manager")
    def test_clear_memory(self, mock_get_db, mock_get_agents):
        mock_get_db.return_value = MagicMock()
        
        mock_agent = MagicMock()
        mock_get_agents.return_value = {"hackbot": mock_agent}
        
        with TestClient(app) as client:
            # Clear specific agent
            response = client.post("/api/agents/clear", json={"agent": "hackbot"})
            self.assertEqual(response.status_code, 200)
            mock_agent.clear_memory.assert_called_once()
            
            # Clear all
            mock_agent.clear_memory.reset_mock()
            response = client.post("/api/agents/clear", json={})
            self.assertEqual(response.status_code, 200)
            mock_agent.clear_memory.assert_called_once()

if __name__ == "__main__":
    unittest.main()
