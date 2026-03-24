"""
用户确认机制模块
SuperHackbot 中敏感操作需要用户手动 /accept 确认后才能执行。
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel


class ActionOption(BaseModel):
    """单个可选方案"""
    index: int
    tool_name: str
    description: str
    params: Dict[str, Any] = {}
    sensitivity: str = "low"  # low / high


class PendingAction(BaseModel):
    """等待用户确认的操作"""
    thought: str  # LLM 的思考过程
    options: List[ActionOption]
    selected: Optional[int] = None  # 用户选择的方案编号


class UserConfirmation:
    """用户确认管理器"""

    def __init__(self):
        self.pending: Optional[PendingAction] = None

    def propose(self, thought: str, options: List[ActionOption]) -> str:
        """
        提出方案列表，等待用户确认。
        返回格式化的方案展示文本。
        """
        self.pending = PendingAction(thought=thought, options=options)
        lines = [
            f"💭 **分析**: {thought}",
            "",
            "请选择要执行的方案：",
            "",
        ]
        for opt in options:
            sens_tag = " ⚠️ [敏感]" if opt.sensitivity == "high" else ""
            lines.append(
                f"  **[{opt.index}]** {opt.description}{sens_tag}"
            )
            lines.append(f"      工具: `{opt.tool_name}` | 参数: {opt.params}")
            lines.append("")

        lines.append("输入 `/accept N` 确认执行方案 N，或 `/reject` 放弃。")
        return "\n".join(lines)

    def accept(self, choice: int = 1) -> Optional[ActionOption]:
        """
        用户选择方案。
        返回选中的 ActionOption，或 None（编号无效）。
        """
        if not self.pending:
            return None
        for opt in self.pending.options:
            if opt.index == choice:
                self.pending.selected = choice
                selected = opt
                self.pending = None
                return selected
        return None

    def reject(self) -> None:
        """拒绝当前所有方案。"""
        self.pending = None

    def is_pending(self) -> bool:
        """是否有待确认的方案。"""
        return self.pending is not None

    def get_pending_text(self) -> str:
        """获取当前待确认方案的摘要文本。"""
        if not self.pending:
            return ""
        names = [f"[{o.index}] {o.tool_name}" for o in self.pending.options]
        return f"待确认方案: {', '.join(names)}"
