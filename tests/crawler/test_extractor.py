
import unittest
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch
from secbot_agent.crawler.extractor import AIExtractor

class TestAIExtractor(unittest.TestCase):
    def setUp(self):
        self.extractor = AIExtractor()

    @patch("secbot_agent.crawler.extractor.httpx.AsyncClient")
    def test_extract_success(self, mock_client_cls):
        async def run_test():
            # Setup mock
            mock_client = AsyncMock()
            mock_response = MagicMock()
            expected_data = {"name": "Test Entity", "type": "Test"}
            # The extractor expects the LLM to return a JSON string inside the content
            llm_response_content = json.dumps(expected_data)
            mock_response.json.return_value = {
                "message": {
                    "content": llm_response_content
                }
            }
            mock_response.raise_for_status = MagicMock()

            mock_client.post.return_value = mock_response
            mock_client_cls.return_value.__aenter__.return_value = mock_client

            # Run extract
            schema = {"name": "string", "type": "string"}
            result = await self.extractor.extract("Some content", schema)

            self.assertEqual(result, expected_data)

        asyncio.run(run_test())

    @patch("secbot_agent.crawler.extractor.httpx.AsyncClient")
    def test_extract_summary(self, mock_client_cls):
        async def run_test():
            # Setup mock
            mock_client = AsyncMock()
            mock_response = MagicMock()
            summary_text = "This is a summary."
            mock_response.json.return_value = {
                "message": {
                    "content": summary_text
                }
            }
            mock_response.raise_for_status = MagicMock()

            mock_client.post.return_value = mock_response
            mock_client_cls.return_value.__aenter__.return_value = mock_client

            # Run extract_summary
            result = await self.extractor.extract_summary("Long content")

            self.assertEqual(result, summary_text)

        asyncio.run(run_test())

    @patch("secbot_agent.crawler.extractor.httpx.AsyncClient")
    def test_extract_keywords(self, mock_client_cls):
        async def run_test():
            # Setup mock
            mock_client = AsyncMock()
            mock_response = MagicMock()
            keywords_text = "key1, key2, key3"
            mock_response.json.return_value = {
                "message": {
                    "content": keywords_text
                }
            }
            mock_response.raise_for_status = MagicMock()

            mock_client.post.return_value = mock_response
            mock_client_cls.return_value.__aenter__.return_value = mock_client

            # Run extract_keywords
            result = await self.extractor.extract_keywords("Content")

            self.assertEqual(len(result), 3)
            self.assertEqual(result[0], "key1")
            self.assertEqual(result[1], "key2")
            self.assertEqual(result[2], "key3")

        asyncio.run(run_test())

    def test_extract_json_helper(self):
        # Test the helper method directly
        text = "Some text before { \"key\": \"value\" } some text after"
        json_str = self.extractor._extract_json(text)
        self.assertEqual(json_str, '{ "key": "value" }')

        text_no_json = "No json here"
        json_str = self.extractor._extract_json(text_no_json)
        self.assertEqual(json_str, '{}')

if __name__ == "__main__":
    unittest.main()
