
import unittest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
from defense.defense_manager import DefenseManager

class TestDefenseManager(unittest.TestCase):
    @patch("defense.defense_manager.InfoCollector")
    @patch("defense.defense_manager.SelfVulnerabilityScanner")
    @patch("defense.defense_manager.NetworkAnalyzer")
    @patch("defense.defense_manager.IntrusionDetector")
    @patch("defense.defense_manager.ReportGenerator")
    @patch("defense.defense_manager.Countermeasure")
    def setUp(self, mock_countermeasure, mock_report_gen, mock_ids, mock_net, mock_vuln, mock_info):
        self.manager = DefenseManager()
        self.mock_components = {
            "info": mock_info.return_value,
            "vuln": mock_vuln.return_value,
            "net": mock_net.return_value,
            "ids": mock_ids.return_value,
            "report": mock_report_gen.return_value,
            "counter": mock_countermeasure.return_value
        }

    def test_full_scan(self):
        async def run_test():
            # Setup return values
            self.mock_components["info"].collect_all.return_value = {"sys": "info"}
            self.mock_components["vuln"].scan_all.return_value = []
            self.mock_components["net"].analyze_connections.return_value = {}
            self.mock_components["net"].analyze_traffic.return_value = {}
            self.mock_components["ids"].get_recent_attacks.return_value = []
            self.mock_components["report"].generate_security_report.return_value = {"report_id": "123"}

            result = await self.manager.full_scan()
            
            self.assertEqual(result["report_id"], "123")
            self.mock_components["info"].collect_all.assert_called_once()
            self.mock_components["report"].generate_security_report.assert_called_once()

        asyncio.run(run_test())

    def test_detect_and_respond(self):
        # Test detection with response
        self.mock_components["ids"].detect_attack.return_value = {
            "type": "sql_injection",
            "severity": "high"
        }
        self.mock_components["counter"].auto_respond.return_value = {"action": "block"}
        
        result = self.manager.detect_and_respond("1.2.3.4", "payload")
        
        self.assertEqual(result["action"], "block")
        self.mock_components["ids"].detect_attack.assert_called_with("1.2.3.4", "payload")
        self.mock_components["ids"].update_ip_reputation.assert_called()
        self.mock_components["counter"].auto_respond.assert_called()

    def test_detect_and_respond_no_attack(self):
        self.mock_components["ids"].detect_attack.return_value = None
        result = self.manager.detect_and_respond("1.2.3.4", "payload")
        self.assertIsNone(result)
        self.mock_components["counter"].auto_respond.assert_not_called()

if __name__ == "__main__":
    unittest.main()
