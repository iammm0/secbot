# PyInstaller spec: 打包 Hackbot 为各平台可执行程序
# 使用方式: pyinstaller hackbot.spec
# 产物: dist/hackbot (或 dist/hackbot.exe)

import sys

# 顶层包与模块（确保被打包）
TOP_LEVEL = [
    'config',
    'agents',
    'attack_chain',
    'controller',
    'crawler',
    'database',
    'defense',
    'exploit',
    'memory',
    'patterns',
    'payloads',
    'prompts',
    'scanner',
    'system',
    'tools',
    'tui',
    'utils',
    'm_bot',
]

# 运行时可能动态加载的库
HIDDEN_IMPORTS = [
    'langchain',
    'langchain_core',
    'langchain_community',
    'langchain_openai',
    'langchain_ollama',
    'pydantic',
    'pydantic_settings',
    'dotenv',
    'typer',
    'rich',
    'sqlalchemy',
    'yaml',
    'tiktoken',
    'httpx',
    'aiohttp',
    'openai',
] + TOP_LEVEL

# 数据文件：提示词模板等
DATAS = [
    ('prompts/templates', 'prompts/templates'),
]

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=DATAS,
    hiddenimports=HIDDEN_IMPORTS,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter',
        'matplotlib',
        'PIL',
        'pytest',
        'IPython',
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='hackbot',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
