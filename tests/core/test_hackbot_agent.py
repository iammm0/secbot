
import unittest
from secbot_agent.core.agents.hackbot_agent import HackbotAgent, HACKBOT_SYSTEM_PROMPT

class TestHackbotAgent(unittest.TestCase):
    def test_initialization(self):
        # Mocking tools if they require heavy initialization or external dependencies
        # Assuming BASIC_SECURITY_TOOLS don't crash on import/init without config
        agent = HackbotAgent()
        self.assertEqual(agent.name, "Hackbot")
        self.assertEqual(agent.system_prompt, HACKBOT_SYSTEM_PROMPT)
        self.assertTrue(agent.auto_execute)
        self.assertGreater(len(agent.security_tools), 0)

        # Verify tools are loaded
        # tools list contains tool instances
        self.assertTrue(any(t for t in agent.security_tools))

if __name__ == "__main__":
    unittest.main()
