# PyInstaller spec: 打包 Hackbot 为各平台可执行程序
# 使用方式: pyinstaller hackbot.spec
# 产物: dist/hackbot/ 目录，内含 hackbot（或 hackbot.exe）及依赖
# 使用 onedir 模式避免单文件体积超过 4GB 导致 Linux CI 报 struct.error
# Linux 下启用 noarchive 避免 PYZ 过大导致 CArchiveWriter struct.error

import sys

IS_LINUX = sys.platform == 'linux'

# 顶层包与模块（与 pyproject.toml [tool.setuptools] packages 对齐）
TOP_LEVEL = [
    'hackbot',
    'secbot_agent',
    'secbot_agent.core',
    'secbot_agent.core.agents',
    'secbot_agent.core.patterns',
    'secbot_agent.core.attack_chain',
    'secbot_agent.core.memory',
    'secbot_agent.core.vuln_db',
    'secbot_agent.core.vuln_db.adapters',
    'secbot_agent.skills',
    'secbot_agent.database',
    'secbot_agent.prompts',
    'secbot_agent.controller',
    'secbot_agent.crawler',
    'secbot_agent.defense',
    'secbot_agent.payloads',
    'secbot_agent.scanner',
    'hackbot_config',
    'system',
    'tools',
    'tui',
    'utils',
    'router',
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
    'router.main',
    'hackbot.launch_tui',
] + TOP_LEVEL

# 数据文件：提示词模板等
DATAS = [
    ('secbot_agent/prompts/templates', 'secbot_agent/prompts/templates'),
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
        # 项目不依赖 PyTorch/TensorFlow，排除以减小体积、加快构建
        'torch',
        'torchvision',
        'torchaudio',
        'tensorflow',
        'keras',
        'tensorboard',
        'onnxruntime',
    ],
    noarchive=IS_LINUX,
    optimize=0,
)

pyz = PYZ(a.pure)

# onedir 模式：可执行文件 + 依赖目录，避免单文件超过 4GB 限制（Linux CI struct.error）
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
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

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    name='hackbot',
)
