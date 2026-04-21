#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
测试数据库连接脚本
用于验证 SQLite 和其他数据库连接是否正常工作
"""

import sys
from pathlib import Path

# 设置 Windows 控制台编码
if sys.platform == "win32":
    try:
        import io

        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8")
    except Exception:
        pass


def test_sqlite(db_path: str = "./data/agents.db") -> bool:
    """测试 SQLite 连接"""
    try:
        import sqlite3

        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # 测试查询
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()

        conn.close()

        print(f"[OK] SQLite 连接成功: {db_path}")
        print(f"     现有表: {[t[0] for t in tables]}")
        return True
    except Exception as e:
        print(f"[ERROR] SQLite 连接错误: {e}")
        return False


def main():
    """主函数"""
    print("=" * 50)
    print("数据库连接测试")
    print("=" * 50)
    print()

    # 确保 data 目录存在
    data_dir = Path("./data")
    data_dir.mkdir(parents=True, exist_ok=True)

    # 测试 SQLite
    print("1. 测试 SQLite...")
    sqlite_ok = test_sqlite()
    print()

    # 总结
    print("=" * 50)
    if sqlite_ok:
        print("[SUCCESS] 数据库连接正常！")
        sys.exit(0)
    else:
        print("[FAIL] 数据库连接失败，请检查配置")
        sys.exit(1)


if __name__ == "__main__":
    main()
