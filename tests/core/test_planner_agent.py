
import unittest
import asyncio
from unittest.mock import patch
from secbot_agent.core.agents.planner_agent import PlannerAgent
from secbot_agent.core.models import PlanResult, RequestType, TodoItem

class TestPlannerAgent(unittest.TestCase):
    def setUp(self):
        self.agent = PlannerAgent()

    def test_quick_classify(self):
        self.assertEqual(self.agent._quick_classify("hello"), "greeting")
        self.assertEqual(self.agent._quick_classify("who are you"), "simple")
        self.assertEqual(self.agent._quick_classify("scan localhost"), "technical")

    @patch("secbot_agent.core.agents.planner_agent.PlannerAgent._reply_via_llm")
    def test_plan_greeting(self, mock_reply):
        async def run_test():
            mock_reply.return_value = "Hello there!"
            result = await self.agent.plan("Hello")
            self.assertEqual(result.request_type, RequestType.GREETING)
            self.assertEqual(result.direct_response, "Hello there!")
        asyncio.run(run_test())

    @patch("secbot_agent.core.agents.planner_agent.PlannerAgent._reply_via_llm")
    def test_plan_simple(self, mock_reply):
        async def run_test():
            mock_reply.return_value = "I can help you."
            result = await self.agent.plan("Help me")
            self.assertEqual(result.request_type, RequestType.SIMPLE)
            self.assertEqual(result.direct_response, "I can help you.")
        asyncio.run(run_test())

    @patch("secbot_agent.core.agents.planner_agent.PlannerAgent._plan_technical_task_v2")
    def test_plan_technical(self, mock_plan_tech):
        async def run_test():
            expected_result = PlanResult(
                request_type=RequestType.TECHNICAL,
                todos=[TodoItem(id="step_1", content="Scan")],
                plan_summary="Scanning"
            )
            mock_plan_tech.return_value = expected_result

            result = await self.agent.plan("Scan localhost")
            self.assertEqual(result.request_type, RequestType.TECHNICAL)
            self.assertEqual(len(result.todos), 1)
        asyncio.run(run_test())

    def test_execution_order(self):
        # Setup todos with dependencies
        self.agent._current_plan = PlanResult(
            request_type=RequestType.TECHNICAL,
            todos=[
                TodoItem(id="step_1", content="A"),
                TodoItem(id="step_2", content="B", depends_on=["step_1"]),
                TodoItem(id="step_3", content="C", depends_on=["step_1"]),
                TodoItem(id="step_4", content="D", depends_on=["step_2", "step_3"])
            ],
            plan_summary="Test"
        )

        layers = self.agent.get_execution_order()
        # Expected layers:
        # 1. [step_1]
        # 2. [step_2, step_3] (or step_3, step_2)
        # 3. [step_4]

        self.assertEqual(len(layers), 3)
        self.assertEqual(layers[0], ["step_1"])
        self.assertIn("step_2", layers[1])
        self.assertIn("step_3", layers[1])
        self.assertEqual(len(layers[1]), 2)
        self.assertEqual(layers[2], ["step_4"])

    def test_fallback_plan(self):
        result = self.agent._fallback_plan("scan localhost")
        self.assertTrue(len(result.todos) > 0)
        self.assertIn("scan", result.todos[0].tool_hint)

if __name__ == "__main__":
    unittest.main()
