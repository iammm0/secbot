"""
操作审计留痕模块
每一步 ReAct 操作（Thought / Action / Observation / Confirm / Result）都写入数据库。
"""
from datetime import datetime
from typing import List, Optional, Dict, Any

from secbot_agent.database.models import AuditRecord
from utils.logger import logger


class AuditTrail:
    """审计留痕管理器"""

    def __init__(self, db_manager, session_id: str):
        self.db = db_manager
        self.session_id = session_id
        # 内存缓存，用于快速展示
        self._records: List[AuditRecord] = []

    def record(
        self,
        agent: str,
        step_type: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AuditRecord:
        """
        记录一步操作。

        Args:
            agent: 智能体名称（secbot-cli / superhackbot）
            step_type: 步骤类型 (thought / action / observation / confirm / reject / result)
            content: 步骤内容描述
            metadata: 额外元数据（工具名、参数、结果等）
        """
        rec = AuditRecord(
            session_id=self.session_id,
            agent=agent,
            step_type=step_type,
            content=content,
            metadata=metadata or {},
            timestamp=datetime.now(),
        )
        self._records.append(rec)
        try:
            self.db.save_audit_record(rec)
        except Exception as e:
            logger.warning(f"审计记录写入数据库失败: {e}")
        return rec

    def get_trail(self, limit: Optional[int] = None) -> List[AuditRecord]:
        """获取当前会话的留痕记录（优先内存缓存）"""
        if self._records:
            return self._records[-limit:] if limit else list(self._records)
        return self.db.get_audit_trail(self.session_id, limit=limit)

    def export_report(self) -> str:
        """导出当前会话审计报告（Markdown 格式）"""
        records = self.get_trail()
        if not records:
            return "暂无操作记录。"

        lines = [
            f"# 操作审计报告",
            f"",
            f"**会话 ID**: `{self.session_id}`",
            f"**记录数**: {len(records)}",
            f"",
            "---",
            "",
        ]

        step_icons = {
            "thought": "💭",
            "action": "⚡",
            "observation": "👁️",
            "confirm": "✅",
            "reject": "❌",
            "result": "📋",
        }

        for i, rec in enumerate(records, 1):
            icon = step_icons.get(rec.step_type, "📌")
            ts = rec.timestamp.strftime("%H:%M:%S") if rec.timestamp else "?"
            lines.append(f"### {i}. {icon} {rec.step_type.upper()} [{ts}]")
            lines.append(f"")
            lines.append(f"**智能体**: {rec.agent}")
            lines.append(f"")
            lines.append(rec.content)
            if rec.metadata:
                lines.append(f"")
                lines.append(f"<details><summary>元数据</summary>")
                lines.append(f"")
                lines.append(f"```json")
                import json
                lines.append(json.dumps(rec.metadata, ensure_ascii=False, indent=2))
                lines.append(f"```")
                lines.append(f"</details>")
            lines.append(f"")
            lines.append("---")
            lines.append("")

        return "\n".join(lines)
