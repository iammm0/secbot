
import unittest
from unittest.mock import patch, MagicMock
from utils.config_storage import get_api_key, set_api_key, delete_api_key, show_config_status

class TestConfigStorage(unittest.TestCase):
    @patch("utils.config_storage.keyring")
    def test_get_api_key(self, mock_keyring):
        mock_keyring.get_password.return_value = "secret_key"
        key = get_api_key("provider")
        self.assertEqual(key, "secret_key")
        mock_keyring.get_password.assert_called_with("secbot", "provider")

    @patch("utils.config_storage.keyring")
    def test_set_api_key(self, mock_keyring):
        set_api_key("provider", "new_key")
        mock_keyring.set_password.assert_called_with("secbot", "provider", "new_key")

    @patch("utils.config_storage.keyring")
    def test_delete_api_key(self, mock_keyring):
        result = delete_api_key("provider")
        self.assertTrue(result)
        mock_keyring.delete_password.assert_called_with("secbot", "provider")

    @patch("utils.config_storage.keyring")
    def test_show_config_status(self, mock_keyring):
        def side_effect(service, username):
            if username == "deepseek":
                return "key1"
            return None
        
        mock_keyring.get_password.side_effect = side_effect
        
        status = show_config_status()
        self.assertTrue(status["deepseek"])
        self.assertFalse(status["ollama"])

if __name__ == "__main__":
    unittest.main()
