
import unittest
import asyncio
from typing import Dict
from secbot_agent.core.agents.base import BaseAgent, AgentMessage

class ConcreteAgent(BaseAgent):
    """用于测试的具体 Agent 实现"""
    async def process(self, user_input: str, **kwargs) -> str:
        return f"Processed: {user_input}"

class TestBaseAgent(unittest.TestCase):
    def setUp(self):
        self.agent = ConcreteAgent(name="TestAgent", system_prompt="You are a test agent.")

    def test_initialization(self):
        self.assertEqual(self.agent.name, "TestAgent")
        self.assertEqual(self.agent.system_prompt, "You are a test agent.")
        self.assertEqual(len(self.agent.messages), 1)
        self.assertEqual(self.agent.messages[0].role, "system")
        self.assertEqual(self.agent.messages[0].content, "You are a test agent.")

    def test_add_message(self):
        self.agent.add_message("user", "Hello")
        self.assertEqual(len(self.agent.messages), 2)
        self.assertEqual(self.agent.messages[1].role, "user")
        self.assertEqual(self.agent.messages[1].content, "Hello")
        
        # 验证 conversation history
        history = self.agent.get_conversation_history()
        self.assertEqual(len(history), 1) # system prompt 也在 messages 中，但 add_message 同时添加到 _conversation
        # 修正：BaseAgent.__init__ 中 self.messages 添加了 system prompt，但 self._conversation 没有
        # add_message 同时向两者添加。
        # 检查代码：
        # if self.system_prompt:
        #     self.messages.append(...)
        # add_message:
        #     self.messages.append(...)
        #     self._conversation.append(...)
        
        self.assertEqual(history[0].content, "Hello")

    def test_get_conversation_history_limit(self):
        self.agent.add_message("user", "1")
        self.agent.add_message("assistant", "2")
        self.agent.add_message("user", "3")
        
        history = self.agent.get_conversation_history(limit=2)
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0].content, "2")
        self.assertEqual(history[1].content, "3")

    def test_clear_memory(self):
        self.agent.add_message("user", "Hello")
        self.agent.clear_memory()
        self.assertEqual(len(self.agent._conversation), 0)
        # 注意：BaseAgent.clear_memory 只清空 _conversation，不清空 messages 列表中的 system prompt?
        # 查看代码：
        # def clear_memory(self):
        #     self._conversation.clear()
        # 它没有清空 self.messages。这可能是一个设计特性或bug，但在测试中我们按代码行为测试。
        self.assertEqual(len(self.agent.get_conversation_history()), 0)

    def test_update_system_prompt(self):
        new_prompt = "You are an updated agent."
        self.agent.update_system_prompt(new_prompt)
        self.assertEqual(self.agent.system_prompt, new_prompt)
        self.assertEqual(self.agent.messages[0].content, new_prompt)

    def test_process_async(self):
        async def run_test():
            response = await self.agent.process("input")
            self.assertEqual(response, "Processed: input")
        
        asyncio.run(run_test())

if __name__ == "__main__":
    unittest.main()
