import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient

from router.main import app


def _sse_events(text: str) -> dict[str, list[dict]]:
    events: dict[str, list[dict]] = {}
    for chunk in text.replace("\r\n", "\n").split("\n\n"):
        if not chunk.strip():
            continue
        name = ""
        data = "{}"
        for line in chunk.split("\n"):
            if line.startswith("event:"):
                name = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data = line.split(":", 1)[1].strip()
        if name:
            events.setdefault(name, []).append(json.loads(data))
    return events


class FakeSessionManager:
    def __init__(self, *args, **kwargs):
        pass

    async def handle_message(self, *args, **kwargs):
        return "Agent response"


class FailingSessionManager:
    def __init__(self, *args, **kwargs):
        pass

    async def handle_message(self, *args, **kwargs):
        raise ValueError("未知的智能体类型 'invalid'")


class TestChatEndpoint(unittest.TestCase):
    @patch("router.chat.SessionManager", FakeSessionManager)
    def test_chat_stream_process(self):
        with TestClient(app) as client:
            response = client.post(
                "/api/chat",
                json={
                    "message": "Hello",
                    "mode": "agent",
                    "agent": "secbot-cli",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertIn("text/event-stream", response.headers["content-type"])
        events = _sse_events(response.text)
        self.assertEqual(events["response"][0]["content"], "Agent response")
        self.assertIn("done", events)

    @patch("router.chat.SessionManager", FailingSessionManager)
    def test_chat_stream_error_event(self):
        with TestClient(app) as client:
            response = client.post(
                "/api/chat",
                json={
                    "message": "Hello",
                    "mode": "agent",
                    "agent": "invalid",
                },
            )

        self.assertEqual(response.status_code, 200)
        events = _sse_events(response.text)
        self.assertIn("error", events)
        self.assertIn("未知的智能体类型", events["error"][0]["error"])
        self.assertIn("done", events)

    @patch("router.chat.get_agent")
    def test_chat_sync_invalid_agent(self, mock_get_agent):
        mock_get_agent.side_effect = ValueError("未知的智能体类型 'invalid'")

        with TestClient(app) as client:
            response = client.post(
                "/api/chat/sync",
                json={
                    "message": "Hello",
                    "mode": "agent",
                    "agent": "invalid",
                },
            )

        self.assertEqual(response.status_code, 400)

    @patch("router.chat.get_agent")
    def test_chat_sync_process(self, mock_get_agent):
        mock_agent = MagicMock()
        mock_agent.process = AsyncMock(return_value="Agent response")
        mock_get_agent.return_value = mock_agent

        with TestClient(app) as client:
            response = client.post(
                "/api/chat/sync",
                json={
                    "message": "Hello",
                    "mode": "agent",
                    "agent": "secbot-cli",
                },
            )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["response"], "Agent response")
        self.assertEqual(data["agent"], "secbot-cli")
        mock_agent.process.assert_awaited_once_with("Hello")


if __name__ == "__main__":
    unittest.main()
