#!/usr/bin/env python3
"""直接测试HackbotAgent的ReAct循环"""

import asyncio
import sys
import os

# 设置环境变量
os.environ["LOG_LEVEL"] = "DEBUG"

from agents.hackbot_agent import HackbotAgent


async def test_react():
    """测试ReAct循环"""
    print("=== 创建HackbotAgent ===", file=sys.stderr)
    agent = HackbotAgent()

    print(f"=== 工具列表: {list(agent.tools_dict.keys())} ===", file=sys.stderr)

    user_input = "扫描127.0.0.1的端口"
    print(f"=== 用户输入: {user_input} ===", file=sys.stderr)

    try:
        # 设置超时
        response = await asyncio.wait_for(agent.process(user_input), timeout=10.0)
        print("=== 响应 ===", file=sys.stderr)
        print(response)
    except asyncio.TimeoutError:
        print("=== 超时 ===", file=sys.stderr)
    except Exception as e:
        print(f"=== 错误: {e} ===", file=sys.stderr)
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_react())
