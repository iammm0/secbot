"""
智能体测试
"""
import pytest
from agents.tool_calling_agent import ToolCallingAgent
from patterns.react import ReActAgent


@pytest.mark.asyncio
async def test_tool_calling_agent():
    """测试工具调用智能体"""
    agent = ToolCallingAgent(name="TestToolCallingAgent")
    assert agent.name == "TestToolCallingAgent"
    assert len(agent.messages) > 0  # 应该有系统消息


@pytest.mark.asyncio
async def test_react_agent():
    """测试ReAct智能体"""
    agent = ReActAgent(name="TestReActAgent")
    assert agent.name == "TestReActAgent"
    assert agent.system_prompt is not None


def test_agent_memory():
    """测试智能体记忆"""
    agent = ToolCallingAgent(name="TestAgent")
    agent.add_message("user", "测试消息")
    assert len(agent.messages) > 0
    agent.clear_memory()
    assert len(agent.messages) == 1  # 只保留系统消息

