#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试数据库连接脚本
用于验证 ChromaDB 和 Redis 是否正常工作
"""

import sys
import os
import requests
import redis
from typing import Optional

# 设置 Windows 控制台编码
if sys.platform == 'win32':
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    except:
        pass

def test_chromadb(host: str = "localhost", port: int = 8000) -> bool:
    """测试 ChromaDB 连接"""
    try:
        url = f"http://{host}:{port}/api/v2"
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            print(f"[OK] ChromaDB 连接成功: {url}")
            print(f"     响应: {response.json()}")
            return True
        else:
            print(f"[FAIL] ChromaDB 连接失败: HTTP {response.status_code}")
            return False
    except Exception as e:
        print(f"[ERROR] ChromaDB 连接错误: {e}")
        return False

def test_redis(host: str = "localhost", port: int = 6379, password: Optional[str] = None) -> bool:
    """测试 Redis 连接"""
    try:
        r = redis.Redis(
            host=host,
            port=port,
            password=password,
            decode_responses=True,
            socket_connect_timeout=5
        )
        # 测试连接
        result = r.ping()
        if result:
            print(f"[OK] Redis 连接成功: {host}:{port}")
            # 获取服务器信息
            info = r.info("server")
            print(f"      Redis 版本: {info.get('redis_version', 'unknown')}")
            return True
        else:
            print(f"[FAIL] Redis 连接失败: ping 返回 False")
            return False
    except redis.AuthenticationError:
        print(f"[ERROR] Redis 认证失败: 密码错误")
        return False
    except Exception as e:
        print(f"[ERROR] Redis 连接错误: {e}")
        return False

def main():
    """主函数"""
    print("=" * 50)
    print("数据库连接测试")
    print("=" * 50)
    print()
    
    # 测试 ChromaDB
    print("1. 测试 ChromaDB...")
    chromadb_ok = test_chromadb()
    print()
    
    # 测试 Redis
    print("2. 测试 Redis...")
    # 尝试从环境变量获取密码
    redis_password = os.getenv("REDIS_PASSWORD", "m-bot-redis-password")
    redis_ok = test_redis(password=redis_password)
    print()
    
    # 总结
    print("=" * 50)
    if chromadb_ok and redis_ok:
        print("[SUCCESS] 所有数据库连接正常！")
        sys.exit(0)
    else:
        print("[FAIL] 部分数据库连接失败，请检查配置")
        sys.exit(1)

if __name__ == "__main__":
    main()

