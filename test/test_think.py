#!/usr/bin/env python3
"""测试_think方法"""

import asyncio
import sys
import os

os.environ["LOG_LEVEL"] = "DEBUG"

from agents.hackbot_agent import HackbotAgent


async def test_think():
    """测试_think方法"""
    print("=== 创建HackbotAgent ===", file=sys.stderr)
    agent = HackbotAgent()

    # 直接调用_think方法
    print("=== 调用_think ===", file=sys.stderr)
    try:
        thought = await asyncio.wait_for(
            agent._think("扫描127.0.0.1的端口"), timeout=5.0
        )
        print(f"=== _think 返回 ===", file=sys.stderr)
        print(f"Thought: {thought}", file=sys.stderr)
    except asyncio.TimeoutError:
        print("=== _think 超时 ===", file=sys.stderr)
    except Exception as e:
        print(f"=== 错误: {e} ===", file=sys.stderr)
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_think())
