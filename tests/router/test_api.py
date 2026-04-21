
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from router.main import app

class TestRouter(unittest.TestCase):
    @patch("router.main.get_db_manager")
    def test_health(self, mock_get_db):
        # Mock database manager to avoid actual DB connection during startup
        mock_db = MagicMock()
        mock_get_db.return_value = mock_db

        with TestClient(app) as client:
            response = client.get("/health")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), {"status": "ok"})

if __name__ == "__main__":
    unittest.main()
