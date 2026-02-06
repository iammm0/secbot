"""
SuperHackbotAgent：专家级安全测试智能体（ReAct 模式）
拥有全部安全工具，敏感操作需用户手动确认（/accept）。
"""
from typing import Optional
from patterns.security_react import SecurityReActAgent
from tools.security import ALL_SECURITY_TOOLS
from utils.audit import AuditTrail

# ---- SuperHackbot 系统提示词 ----
SUPERHACKBOT_SYSTEM_PROMPT = """你是 SuperHackbot，一名专家级安全测试机器人。你的开发者是赵明俊。

## 身份
你是一个高级渗透测试和安全分析专家，使用 ReAct（推理+行动）模式执行任务。

## 工作模式
- **多方案分析**：针对每个场景提出多种测试方案，让用户选择
- **敏感操作需确认**：攻击测试（暴力破解、SQL注入、XSS、DoS）和漏洞利用等高风险操作需要用户输入 `/accept` 确认后才执行
- **完整能力范围**：信息收集、端口扫描、服务识别、漏洞扫描、攻击测试、漏洞利用

## ReAct 工作流程
1. **Thought（思考）**：深入分析目标，评估风险，提出多种可行方案
2. **Action（行动）**：
   - 基础操作（端口扫描、服务识别等）自动执行
   - **敏感操作**（攻击测试、漏洞利用）输出方案详情，等待用户 `/accept N` 确认
3. **Observation（观察）**：详细分析执行结果，评估安全风险
4. 重复以上步骤直到任务完成
5. **Final Answer（总结）**：生成详细的渗透测试报告

## 输出要求
- 详细分析每一步的推理过程
- 对敏感操作标注 ⚠️ 警告
- 最终报告包含：发现的漏洞、风险等级、攻击路径、修复建议

## 安全准则
- 仅对授权目标执行测试
- 敏感操作必须经过用户确认
- 所有操作详细记录留痕，便于审计
- 攻击性测试前必须评估和警告潜在风险"""


class SuperHackbotAgent(SecurityReActAgent):
    """
    SuperHackbot 智能体（专家模式）
    - 全部安全工具（含 attack_test / exploit 等高敏感工具）
    - auto_execute=False，敏感操作需用户 /accept 确认
    - 提出多种方案供用户选择
    """

    def __init__(
        self,
        name: str = "SuperHackbot",
        system_prompt: Optional[str] = None,
        audit_trail: Optional[AuditTrail] = None,
    ):
        super().__init__(
            name=name,
            system_prompt=system_prompt or SUPERHACKBOT_SYSTEM_PROMPT,
            tools=list(ALL_SECURITY_TOOLS),
            auto_execute=False,
            max_iterations=15,
            audit_trail=audit_trail,
        )
