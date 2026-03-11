#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试 SQLite 数据库连接和功能
"""

import sys
import os
from pathlib import Path

# 设置 Windows 控制台编码
if sys.platform == 'win32':
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    except:
        pass

from database.manager import DatabaseManager
from database.models import Conversation, PromptChainModel, UserConfig
from datetime import datetime

def test_database():
    """测试数据库功能"""
    print("=" * 50)
    print("SQLite 数据库测试")
    print("=" * 50)
    print()
    
    try:
        # 1. 初始化数据库管理器
        print("1. 初始化数据库管理器...")
        db = DatabaseManager()
        print(f"   [OK] 数据库路径: {db.db_path}")
        print(f"   [OK] 数据库文件存在: {db.db_path.exists()}")
        print()
        
        # 2. 测试保存对话
        print("2. 测试保存对话记录...")
        conversation = Conversation(
            agent_type="test",
            user_message="测试消息",
            assistant_message="测试回复",
            session_id="test-session-001",
            timestamp=datetime.now()
        )
        conv_id = db.save_conversation(conversation)
        print(f"   [OK] 对话记录已保存，ID: {conv_id}")
        print()
        
        # 3. 测试获取对话
        print("3. 测试获取对话记录...")
        conversations = db.get_conversations(agent_type="test", limit=5)
        print(f"   [OK] 获取到 {len(conversations)} 条对话记录")
        if conversations:
            print(f"   [OK] 最新对话: {conversations[0].user_message} -> {conversations[0].assistant_message}")
        print()
        
        # 4. 测试保存提示词链
        print("4. 测试保存提示词链...")
        chain = PromptChainModel(
            name="test_chain",
            content='{"steps": ["step1", "step2"]}',
            description="测试提示词链"
        )
        chain_id = db.save_prompt_chain(chain)
        print(f"   [OK] 提示词链已保存，ID: {chain_id}")
        print()
        
        # 5. 测试获取提示词链
        print("5. 测试获取提示词链...")
        retrieved_chain = db.get_prompt_chain("test_chain")
        if retrieved_chain:
            print(f"   [OK] 提示词链已获取: {retrieved_chain.name}")
            print(f"   [OK] 内容: {retrieved_chain.content[:50]}...")
        print()
        
        # 6. 测试保存用户配置
        print("6. 测试保存用户配置...")
        config = UserConfig(
            key="test.config.key",
            value="test_value",
            category="test",
            description="测试配置"
        )
        config_id = db.save_config(config)
        print(f"   [OK] 用户配置已保存，ID: {config_id}")
        print()
        
        # 7. 测试获取用户配置
        print("7. 测试获取用户配置...")
        retrieved_config = db.get_config("test.config.key")
        if retrieved_config:
            print(f"   [OK] 用户配置已获取: {retrieved_config.key} = {retrieved_config.value}")
        print()
        
        # 8. 测试统计信息
        print("8. 测试获取统计信息...")
        stats = db.get_stats()
        print(f"   [OK] 统计信息:")
        print(f"       - 对话记录数: {stats.get('conversations', 0)}")
        print(f"       - 提示词链数: {stats.get('prompt_chains', 0)}")
        print(f"       - 用户配置数: {stats.get('user_configs', 0)}")
        print(f"       - 爬虫任务数: {stats.get('crawler_tasks', 0)}")
        print()
        
        # 9. 清理测试数据（可选）
        print("9. 清理测试数据...")
        db.delete_conversations(agent_type="test")
        db.delete_prompt_chain("test_chain")
        db.delete_config("test.config.key")
        print("   [OK] 测试数据已清理")
        print()
        
        print("=" * 50)
        print("[SUCCESS] 所有数据库测试通过！")
        print("=" * 50)
        return True
        
    except Exception as e:
        print(f"[ERROR] 数据库测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_database()
    sys.exit(0 if success else 1)

