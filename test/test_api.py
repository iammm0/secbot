#!/usr/bin/env python3
"""直接测试DeepSeek API"""

import os
from openai import OpenAI

# 从.env读取API密钥
with open(".env", "r") as f:
    for line in f:
        if line.startswith("DEEPSEEK_API_KEY="):
            api_key = line.strip().split("=", 1)[1].strip()
            break

print(f"API密钥前10位: {api_key[:10]}...")
print(f"API密钥长度: {len(api_key)}")

client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")

try:
    # 简单的聊天完成请求
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=[{"role": "user", "content": "Hello"}],
        max_tokens=10,
        timeout=5.0,
    )
    print("成功！")
    print(f"响应: {response.choices[0].message.content}")
except Exception as e:
    print(f"错误: {e}")
    import traceback

    traceback.print_exc()
