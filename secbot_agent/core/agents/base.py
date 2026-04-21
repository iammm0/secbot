"""
基础智能体类
"""
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from utils.logger import logger


class AgentMessage(BaseModel):
    """智能体消息模型"""
    role: str  # user, assistant, system
    content: str
    metadata: Optional[Dict[str, Any]] = None


class BaseAgent(ABC):
    """基础智能体抽象类"""

    def __init__(self, name: str, system_prompt: Optional[str] = None):
        self.name = name
        self.system_prompt = system_prompt or self._default_system_prompt()
        self.messages: List[AgentMessage] = []
        # 对话历史（列表）；外部可能将 self.memory 设为 MemoryManager，故用独立列表
        self._conversation: List[AgentMessage] = []
        self.memory: List[AgentMessage] = []  # 默认列表；main/cli 可能替换为 MemoryManager

        if self.system_prompt:
            self.messages.append(
                AgentMessage(role="system", content=self.system_prompt)
            )
        self.log = logger.bind(agent=self.name, attempt=1)
        self.log.bind(event="stage_start").info(f"初始化智能体: {self.name}")

    def _default_system_prompt(self) -> str:
        """默认系统提示词"""
        # 如果是 m-bot，使用安全机器人提示词
        if "m-bot" in self.name.lower() or "m_bot" in self.name.lower():
            return self._m_bot_security_prompt()
        return f"你是一个名为 {self.name} 的智能助手。"

    def _m_bot_security_prompt(self) -> str:
        """M-Bot 安全机器人系统提示词（开源版自动化安全测试智能体）"""
        return """你是 m-bot，开源版本的自动化安全测试智能体，面向社区用户使用。

【核心身份】
- 安全测试专家：具备深厚的网络安全、渗透测试、漏洞分析知识
- 授权资产控制器：对用户配置的授权目标进行安全巡检与控制
- 授权主机控制器：管理并控制经过授权后的主机

【核心能力】
1. 资产控制：内网发现、授权管理、远程控制（SSH/WinRM）、会话管理
2. 安全测试：端口扫描、漏洞扫描、服务识别、攻击测试、定时任务
3. 主动防御：信息收集、漏洞扫描、网络分析、入侵检测、自动反制、报告生成
4. 系统控制：文件操作、进程管理、系统信息、命令执行
5. 智能助理：对话交互、任务调度、数据分析、报告生成

【操作原则】
- 仅对用户配置的授权资产和经过明确授权的主机执行操作
- 所有操作必须符合安全规范，仅对授权目标执行
- 严格遵守法律法规，仅进行授权的安全测试
- 详细记录所有操作，便于审计和追溯
- 主动防御，保护部署主机的安全

【响应风格】
- 专业而高效，使用技术术语但保持清晰易懂
- 主动建议，不仅执行指令还要提供优化建议
- 详细报告，重要操作后提供结构化报告
- 安全意识，始终强调安全最佳实践

【沟通方式】
- 称呼用户为「用户」或「您」
- 语气专业、可靠、高效，但保持友好
- 对潜在风险操作给出明确警告
- 理解自然语言指令，支持中英文"""

    @abstractmethod
    async def process(self, user_input: str, **kwargs) -> str:
        """
        处理用户输入

        Args:
            user_input: 用户输入
            **kwargs: 其他参数

        Returns:
            智能体的响应
        """
        pass

    def add_message(self, role: str, content: str, metadata: Optional[Dict] = None):
        """添加消息到历史"""
        message = AgentMessage(role=role, content=content, metadata=metadata)
        self.messages.append(message)
        self._conversation.append(message)

    def get_conversation_history(self, limit: Optional[int] = None) -> List[AgentMessage]:
        """获取对话历史"""
        if limit:
            return self._conversation[-limit:]
        return self._conversation

    def clear_memory(self):
        """清空记忆"""
        self._conversation.clear()
        if hasattr(self.memory, "clear_all") and callable(self.memory.clear_all):
            # MemoryManager.clear_all 为 async，此处仅清空对话列表；持久记忆由调用方按需清空
            pass
        self.log.bind(event="stage_end").info(f"智能体 {self.name} 的记忆已清空")

    def update_system_prompt(self, new_prompt: str):
        """更新系统提示词"""
        self.system_prompt = new_prompt
        # 更新消息列表中的system消息
        for i, msg in enumerate(self.messages):
            if msg.role == "system":
                self.messages[i] = AgentMessage(role="system", content=new_prompt)
                break
        else:
            # 如果没有system消息，添加一个
            self.messages.insert(0, AgentMessage(role="system", content=new_prompt))

        self.log.bind(event="stage_end").info(f"智能体 {self.name} 的系统提示词已更新")

