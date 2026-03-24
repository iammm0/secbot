"""
提示词管理器
"""

from typing import Dict, Optional, List
from pathlib import Path
import json
import yaml
from prompts.chain import PromptChain, PromptChainBuilder
from database.manager import DatabaseManager
from database.models import PromptChainModel
from utils.logger import logger


class PromptManager:
    """提示词管理器：管理提示词模板和链"""

    def __init__(
        self,
        prompts_dir: Optional[Path] = None,
        db_manager: Optional[DatabaseManager] = None,
    ):
        self.prompts_dir = prompts_dir or Path("prompts/templates")
        self.prompts_dir.mkdir(parents=True, exist_ok=True)
        self.chains: Dict[str, PromptChain] = {}
        self.templates: Dict[str, str] = {}
        self.db = db_manager

        # 加载预定义模板
        self._load_default_templates()

        # 从数据库加载提示词链
        if self.db:
            self._load_chains_from_db()

    def _load_default_templates(self):
        """加载默认模板"""
        default_templates = {
            "assistant": "你是一个有用的AI助手。",
            "expert": "你是一个专业领域的专家，具有深厚的知识和经验。",
            "creative": "你是一个富有创造力的助手，能够提供创新和独特的想法。",
            "analytical": "你是一个分析型助手，擅长逻辑推理和问题分析。",
            "friendly": "你是一个友好、热情的助手，总是乐于帮助用户。",
            "technical": "你是一个技术专家，擅长解决技术问题和提供技术建议。",
            "hackbot_security": """你是 Hackbot，开源版本的自动化安全测试智能体，面向社区用户使用。

【核心身份】
- 安全巡检专家：具备深厚的网络安全、渗透测试、漏洞分析知识
- 漏洞挖掘专家：在授权环境中发现并验证各类漏洞
- 红队攻击测试专家：在授权范围内执行渗透测试与漏洞利用
- 授权资产控制器：对用户配置的授权目标进行安全巡检与控制
- 授权主机控制器：管理并控制经过用户授权后的主机

【核心能力】
1. 资产控制：内网发现、授权管理、远程控制（SSH/WinRM）、会话管理
2. 安全巡检：端口扫描、漏洞扫描、服务识别、入侵检测、日志分析
3. 漏洞挖掘：在授权环境中发现并验证 SQL 注入、XSS、命令注入等漏洞
4. 红队攻击测试：在授权范围内执行渗透测试、漏洞利用、攻击链验证
5. 主动防御：信息收集、漏洞扫描、网络分析、入侵检测、自动告警
6. 系统控制：文件操作、进程管理、系统信息、命令执行
7. 智能助理：对话交互、任务调度、数据分析、报告生成

【操作原则】
- 仅对用户配置的授权资产和经过明确授权的主机执行操作
- 漏洞挖掘和红队攻击测试仅限授权目标
- 严格遵守法律法规，仅进行授权的安全测试
- 详细记录所有操作，便于审计和追溯

【响应风格】
- 专业而高效，使用技术术语但保持清晰易懂
- 主动建议，不仅执行指令还要提供优化建议
- 详细报告，重要操作后提供结构化报告（含漏洞详情、攻击步骤、修复建议）
- 安全意识，始终强调安全最佳实践和授权边界

【沟通方式】
- 称呼用户为「用户」或「您」
- 语气专业、可靠、高效，但保持友好
- 对潜在风险操作给出明确警告
- 理解自然语言指令，支持中英文""",
        }

        for name, content in default_templates.items():
            self.templates[name] = content

    def create_chain(self, name: str) -> PromptChainBuilder:
        """创建提示词链构建器"""
        return PromptChainBuilder(name=name)

    def register_chain(self, chain: PromptChain):
        """注册提示词链"""
        self.chains[chain.name] = chain

        # 保存到数据库
        if self.db:
            chain_model = PromptChainModel(
                name=chain.name,
                content=json.dumps(chain.to_dict()),
                description=f"提示词链: {chain.name}",
            )
            self.db.save_prompt_chain(chain_model)

        logger.info(f"注册提示词链: {chain.name}")

    def get_chain(self, name: str) -> Optional[PromptChain]:
        """获取提示词链"""
        return self.chains.get(name)

    def load_chain_from_file(self, file_path: Path) -> Optional[PromptChain]:
        """从文件加载提示词链"""
        try:
            if file_path.suffix == ".json":
                with open(file_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                chain = PromptChain.from_dict(data)
            elif file_path.suffix in [".yaml", ".yml"]:
                with open(file_path, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                chain = PromptChain.from_dict(data)
            else:
                # 纯文本文件，作为单个提示词
                content = file_path.read_text(encoding="utf-8")
                chain = PromptChain(name=file_path.stem)
                chain.add("main", content)

            self.register_chain(chain)
            return chain
        except Exception as e:
            logger.error(f"加载提示词链失败: {e}")
            return None

    def save_chain(self, chain: PromptChain, file_path: Optional[Path] = None):
        """保存提示词链到文件"""
        if file_path is None:
            file_path = self.prompts_dir / f"{chain.name}.json"

        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(chain.to_dict(), f, ensure_ascii=False, indent=2)
            logger.info(f"保存提示词链到: {file_path}")
        except Exception as e:
            logger.error(f"保存提示词链失败: {e}")

    def get_template(self, name: str) -> Optional[str]:
        """获取模板"""
        return self.templates.get(name)

    def register_template(self, name: str, content: str):
        """注册模板"""
        self.templates[name] = content
        logger.info(f"注册提示词模板: {name}")

    def build_from_string(self, prompt_string: str) -> PromptChain:
        """从字符串构建提示词链（支持分隔符）"""
        # 支持多种分隔符
        separators = ["---", "===", "***"]

        chain = PromptChain(name="custom")
        parts = [prompt_string]

        for sep in separators:
            if sep in prompt_string:
                parts = prompt_string.split(sep)
                break

        for i, part in enumerate(parts):
            part = part.strip()
            if part:
                chain.add(f"part_{i}", part, order=i)

        return chain

    def _load_chains_from_db(self):
        """从数据库加载提示词链"""
        try:
            chains = self.db.list_prompt_chains()
            for chain_model in chains:
                try:
                    chain_data = json.loads(chain_model.content)
                    chain = PromptChain.from_dict(chain_data)
                    self.chains[chain.name] = chain
                    logger.debug(f"从数据库加载提示词链: {chain.name}")
                except Exception as e:
                    logger.warning(f"加载提示词链失败 {chain_model.name}: {e}")
        except Exception as e:
            logger.warning(f"从数据库加载提示词链失败: {e}")

    def list_chains(self) -> List[str]:
        """列出所有提示词链"""
        # 合并内存和数据库中的链
        all_chains = set(self.chains.keys())
        if self.db:
            db_chains = self.db.list_prompt_chains()
            for chain_model in db_chains:
                all_chains.add(chain_model.name)
        return list(all_chains)

    def list_templates(self) -> List[str]:
        """列出所有模板"""
        return list(self.templates.keys())
