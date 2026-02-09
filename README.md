# hackbot: Automated Penetration Testing Robot

<div align="center">

![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-beta-orange.svg)

**An intelligent automated penetration testing robot with AI-powered security testing capabilities**

[English](#m-bot-automated-penetration-testing-robot) | [中文](README_CN.md)

</div>

---

## ⚠️ Security Warning

**This tool is intended for authorized security testing only. Unauthorized use of this tool for network attacks is illegal.**

- ✅ Only use on systems you own or have explicit written authorization to test
- ✅ Ensure you comply with all applicable laws and regulations
- ✅ Use responsibly and ethically

## 🚀 Features

### Core Capabilities

- 🤖 **Multiple Agent Patterns**: ReAct, Plan-Execute, Multi-Agent, Tool-Using, Memory-Augmented
- 💻 **CLI Interface**: Built with Typer for intuitive command-line interaction
- 🎤 **Voice Interaction**: Complete speech-to-text and text-to-speech functionality
- 🕷️ **AI Web Crawler**: Real-time web information capture and monitoring
- 💻 **OS Control**: File operations, process management, system information

### Penetration Testing

- 🔍 **Reconnaissance**: Automated information gathering (hostname, IP, ports, services)
- 🔍 **Vulnerability Scanning**: Port scanning, service detection, vulnerability identification
- ⚔️ **Exploit Engine**: Automated exploitation of SQL injection, XSS, command injection, file upload, path traversal, SSRF
- 🔗 **Automated Attack Chain**: Complete penetration testing workflow automation
  - Information Gathering → Vulnerability Scanning → Exploitation → Post-Exploitation
- 📦 **Payload Generator**: Automatic generation of attack payloads
- 🎯 **Post-Exploitation**: Privilege escalation, persistence, lateral movement, data exfiltration
- ⚔️ **Network Attacks**: Brute force, DoS testing, buffer overflow (authorized testing only)

### Security & Defense

- 🛡️ **Active Defense**: Information collection, vulnerability scanning, network analysis, intrusion detection
- 📊 **Security Reports**: Automated detailed security analysis reports
- 🔍 **Network Discovery**: Automatic discovery of all hosts in the network
- 🎯 **Authorization Management**: Manage legal authorization for target hosts
- 🖥️ **Remote Control**: Remote command execution and file transfer on authorized hosts

### Additional Features

- 📝 **Prompt Chain Management**: Flexible agent prompt configuration
- 💾 **SQLite Database**: Persistent storage for conversation history, prompt chains, configurations
- 🐳 **Docker Compose**: Quick start for ChromaDB and Redis development environment
- ⏰ **Task Scheduling**: Support for scheduled penetration testing tasks
- 🎨 **Beautiful Terminal Output**: Rich formatting with Rich library

## 📋 Requirements

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) (recommended package manager) or pip
- Ollama (for LLM inference)
- Dependencies are managed in `pyproject.toml`

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/iammm0/m-bot.git
cd m-bot
```

### 2. Install Dependencies

#### Using uv (Recommended)
[uv](https://github.com/astral-sh/uv) is a fast Python package installer and resolver.

```bash
# Install uv if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies using uv
uv sync
```

#### Using pip (Alternative)
```bash
pip install -r requirements.txt
```

### 3. Install and Start Ollama

```bash
# Install Ollama from https://ollama.ai

# Pull required models
ollama pull gpt-oss:20b
ollama pull nomic-embed-text

# Ollama service runs on http://localhost:11434 by default
```

### 4. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` file:
- `OLLAMA_MODEL`: Inference model (default: `gpt-oss:20b`)
- `OLLAMA_EMBEDDING_MODEL`: Embedding model (default: `nomic-embed-text`)

### 5. Build and Install (Optional)

```bash
# Build package
python -m build

# Install package (using uv - recommended)
uv pip install dist/m_bot-1.0.0-py3-none-any.whl

# Alternative using pip
# pip install dist/m_bot-1.0.0-py3-none-any.whl

# Now you can use 'hackbot' command directly
hackbot --help
```

## 🎯 Quick Start

### Basic Usage

```bash
# View help
hackbot --help

# Interactive chat
hackbot interactive

# Text chat
hackbot chat "Hello, introduce yourself"

# List available agents
hackbot list-agents
```

### Penetration Testing Commands

```bash
# Network discovery
hackbot discover

# Port scanning (via chat)
hackbot chat "Scan ports on 192.168.1.1"

# List authorized targets
hackbot list-targets

# Revoke authorization
hackbot revoke 192.168.1.100

# Note: Advanced exploitation commands (exploit, attack-chain, generate-payload) 
# are available in experimental versions. Run 'hackbot --help' for full command list.
```

### Remote Control Commands

```bash
# Execute remote command on authorized host
hackbot remote-execute 192.168.1.100 "ls -la"

# Upload file to remote host
hackbot upload-file 192.168.1.100 local.txt /remote/path/

# Download file from remote host
hackbot download-file 192.168.1.100 /remote/file.txt local_copy.txt

# List all authorizations
hackbot list-authorizations
```

### Defense System Commands

```bash
# Perform comprehensive security scan
hackbot defense-scan

# Start defense monitoring
hackbot defense-monitor --start --interval 60

# View defense status
hackbot defense-monitor --status

# List blocked IPs
hackbot defense-blocked --list

# Generate defense report
hackbot defense-report --type vulnerability
```

### System Operations

```bash
# System information
hackbot system-info

# System status
hackbot system-status

# List processes
hackbot list-processes --filter python

# Execute command
hackbot execute "ls -la"

# List files in directory
hackbot file-list /path/to/dir --recursive
```

### Database Management

```bash
# View statistics
hackbot db-stats

# View conversation history
hackbot db-history --limit 20

# Clear history (requires confirmation)
hackbot db-clear --yes
```

### Voice Interaction Commands

```bash
# Speech-to-text transcription
hackbot transcribe audio.wav --output transcript.txt

# Text-to-speech synthesis
hackbot synthesize "Hello world" --output speech.wav --language en

# Voice chat with agent
hackbot voice audio.wav --agent hackbot
```

### Prompt Management Commands

```bash
# List available prompt templates and chains
hackbot prompt-list

# Create a new prompt chain
hackbot prompt-create my_chain --role "Security Expert" --instruction "Perform penetration testing"

# Load prompt chain from file
hackbot prompt-load my_prompt.yaml
```

## 📁 Project Structure

```
m-bot/
├── main.py                 # CLI application entry
├── config.py               # Configuration management
├── m_bot/                  # Package CLI module
├── agents/                 # Agent implementations
│   ├── base.py            # Base agent class
│   └── tool_calling_agent.py # 工具调用智能体（LLM + 工具）
├── patterns/               # Design patterns
│   └── react.py           # ReAct pattern
├── exploit/                # Exploitation module
│   ├── exploit_engine.py  # Exploit engine
│   ├── web_exploits.py    # Web exploits
│   ├── network_exploits.py # Network exploits
│   └── post_exploitation.py # Post-exploitation
├── attack_chain/           # Automated attack chain
│   ├── attack_chain.py     # Main attack chain
│   ├── reconnaissance.py   # Information gathering
│   └── exploitation.py    # Exploitation coordination
├── payloads/               # Payload generators
│   ├── web_payloads.py     # Web payloads
│   └── network_payloads.py # Network payloads
├── scanner/                # Scanning tools
│   ├── port_scanner.py     # Port scanning
│   ├── service_detector.py # Service detection
│   └── vulnerability_scanner.py # Vulnerability scanning
├── defense/                # Defense system
├── controller/             # Remote control
├── crawler/                # Web crawler
├── database/               # Database management
├── memory/                 # Memory management
├── prompts/                # Prompt management
├── system/                 # OS control
├── tools/                  # Tools and plugins
└── utils/                  # Utility functions
```

## 🔧 Development

### Running Tests

```bash
pytest tests/
```

### Building Package

```bash
# Windows
build.bat

# Linux/Mac
./build.sh
```

## 📚 Documentation

- [Quick Start Guide](docs/QUICKSTART.md)
- [Database Guide](docs/DATABASE_GUIDE.md)
- [Docker Setup](docs/DOCKER_SETUP.md)
- [Ollama Setup](docs/OLLAMA_SETUP.md)
- [Security Warning](docs/SECURITY_WARNING.md)
- [Prompt Guide](docs/PROMPT_GUIDE.md)
- [Speech Guide](docs/SPEECH_GUIDE.md)
- [SQLite Setup](docs/SQLITE_SETUP.md)
- [Deployment Guide](DEPLOYMENT.md)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👤 Author

**赵明俊 (Zhao Mingjun)**

- GitHub: [@iammm0](https://github.com/iammm0)
- Email: wisewater5419@gmail.com

## 🙏 Acknowledgments

- Built with [LangChain](https://github.com/langchain-ai/langchain)
- Powered by [Ollama](https://ollama.ai)
- CLI built with [Typer](https://typer.tiangolo.com)
- Beautiful output with [Rich](https://github.com/Textualize/rich)

## ⚠️ Disclaimer

This tool is provided for educational and authorized security testing purposes only. The authors and contributors are not responsible for any misuse or damage caused by this tool. Users must ensure they have proper authorization before using this tool on any system.

---

<div align="center">

**⭐ If you find this project useful, please consider giving it a star! ⭐**

</div>


