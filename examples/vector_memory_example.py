"""
向量记忆使用示例
"""
import asyncio
from memory.vector_memory import VectorMemory
from agents.base import AgentMessage


async def main():
    """示例：使用向量记忆进行相似度搜索"""
    
    # 创建向量记忆实例
    memory = VectorMemory()
    
    # 添加一些消息
    messages = [
        AgentMessage(role="user", content="我喜欢Python编程"),
        AgentMessage(role="assistant", content="Python是一门很好的编程语言"),
        AgentMessage(role="user", content="今天天气很好"),
        AgentMessage(role="assistant", content="是的，适合出去走走"),
        AgentMessage(role="user", content="如何学习机器学习？"),
        AgentMessage(role="assistant", content="可以从基础数学和Python开始"),
    ]
    
    print("添加消息到向量记忆...")
    for msg in messages:
        await memory.add(msg)
    
    print(f"已添加 {len(messages)} 条消息\n")
    
    # 搜索相关记忆
    queries = [
        "编程语言",
        "天气",
        "学习"
    ]
    
    for query in queries:
        print(f"搜索查询: '{query}'")
        results = await memory.search(query, limit=2)
        
        for i, result in enumerate(results, 1):
            print(f"  {i}. [{result.role}] {result.content}")
        print()


if __name__ == "__main__":
    asyncio.run(main())

