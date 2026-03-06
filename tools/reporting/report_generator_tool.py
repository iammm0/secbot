"""安全报告生成工具：将扫描发现整理为 Markdown / HTML / JSON 格式的安全报告，
支持标准渗透测试报告（含攻击链步骤、漏洞利用结果和修复建议）。"""
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from tools.base import BaseTool, ToolResult


class ReportGeneratorTool(BaseTool):
    """安全报告生成工具"""

    sensitivity = "low"

    RISK_EMOJI = {
        "critical": "[严重]",
        "high": "[高危]",
        "medium": "[中危]",
        "low": "[低危]",
        "info": "[信息]",
    }

    def __init__(self):
        super().__init__(
            name="report_generator",
            description=(
                "将安全扫描发现整理为结构化安全报告（Markdown / HTML / JSON）。"
                "参数: title(报告标题), findings(发现列表,每项含 title/risk/description/recommendation), "
                "format(输出格式: markdown/html/json/pentest, 默认 markdown), target(测试目标, 可选), "
                "attack_chain(攻击链结果, 可选), exploit_results(漏洞利用结果, 可选)"
            ),
        )

    async def execute(self, **kwargs) -> ToolResult:
        title = kwargs.get("title", "安全测试报告").strip()
        findings = kwargs.get("findings", [])
        fmt = kwargs.get("format", "markdown").strip().lower()
        target = kwargs.get("target", "").strip()
        attack_chain = kwargs.get("attack_chain")
        exploit_results = kwargs.get("exploit_results")

        if findings is None:
            findings = []
        if not isinstance(findings, (list, tuple)):
            findings = [findings] if findings else []

        if fmt not in ("markdown", "html", "json", "pentest"):
            return ToolResult(success=False, result=None, error="format 可选值: markdown / html / json / pentest")

        # 标准化 findings
        normalized = self._normalize_findings(findings)

        # 统计
        stats = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        for f in normalized:
            risk = f.get("risk", "info").lower()
            if risk in stats:
                stats[risk] += 1

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        if fmt == "pentest":
            content = self._gen_pentest_markdown(
                title, target, timestamp, normalized, stats, attack_chain, exploit_results
            )
            ext = "md"
        elif fmt == "markdown":
            content = self._gen_markdown(title, target, timestamp, normalized, stats)
            ext = "md"
        elif fmt == "html":
            content = self._gen_html(title, target, timestamp, normalized, stats)
            ext = "html"
        else:
            payload = {
                "title": title,
                "target": target,
                "timestamp": timestamp,
                "statistics": stats,
                "findings": normalized,
            }
            if attack_chain:
                payload["attack_chain"] = attack_chain
            if exploit_results:
                payload["exploit_results"] = exploit_results
            content = json.dumps(payload, ensure_ascii=False, indent=2, default=str)
            ext = "json"

        # 保存文件
        reports_dir = Path("reports")
        reports_dir.mkdir(parents=True, exist_ok=True)
        safe_title = "".join(c if c.isalnum() or c in "-_ " else "" for c in title)[:50].strip()
        filename = f"{safe_title}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{ext}"
        filepath = reports_dir / filename

        filepath.write_text(content, encoding="utf-8")

        return ToolResult(
            success=True,
            result={
                "file": str(filepath),
                "format": fmt,
                "statistics": stats,
                "total_findings": len(normalized),
                "content_preview": content[:500],
            },
        )

    def _normalize_findings(self, findings) -> List[Dict]:
        """标准化发现条目"""
        normalized = []
        for f in findings:
            if isinstance(f, str):
                normalized.append({
                    "title": f,
                    "risk": "info",
                    "description": f,
                    "recommendation": "",
                })
            elif isinstance(f, dict):
                normalized.append({
                    "title": f.get("title", "未命名发现"),
                    "risk": f.get("risk", "info").lower(),
                    "description": f.get("description", ""),
                    "recommendation": f.get("recommendation", ""),
                })
        return normalized

    def _gen_markdown(self, title, target, timestamp, findings, stats) -> str:
        lines = [
            f"# {title}",
            "",
            f"**生成时间**: {timestamp}  ",
        ]
        if target:
            lines.append(f"**测试目标**: {target}  ")
        lines += [
            "",
            "## 概要",
            "",
            f"| 等级 | 数量 |",
            f"|------|------|",
            f"| 严重 | {stats['critical']} |",
            f"| 高危 | {stats['high']} |",
            f"| 中危 | {stats['medium']} |",
            f"| 低危 | {stats['low']} |",
            f"| 信息 | {stats['info']} |",
            "",
            "## 详细发现",
            "",
        ]
        if not findings:
            lines.append("*本次扫描未发现明显安全问题。*")
            lines.append("")
            return "\n".join(lines)

        # 按风险排序
        risk_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        sorted_findings = sorted(findings, key=lambda x: risk_order.get(x["risk"], 5))

        for i, f in enumerate(sorted_findings, 1):
            risk_tag = self.RISK_EMOJI.get(f["risk"], "[未知]")
            lines.append(f"### {i}. {risk_tag} {f['title']}")
            lines.append("")
            if f["description"]:
                lines.append(f"**描述**: {f['description']}")
                lines.append("")
            if f["recommendation"]:
                lines.append(f"**建议**: {f['recommendation']}")
                lines.append("")
            lines.append("---")
            lines.append("")

        return "\n".join(lines)

    def _gen_html(self, title, target, timestamp, findings, stats) -> str:
        risk_colors = {
            "critical": "#dc3545",
            "high": "#fd7e14",
            "medium": "#ffc107",
            "low": "#28a745",
            "info": "#17a2b8",
        }

        risk_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
        sorted_findings = sorted(findings, key=lambda x: risk_order.get(x["risk"], 5))

        findings_html = ""
        if not findings:
            findings_html = "<p><em>本次扫描未发现明显安全问题。</em></p>"
        for i, f in enumerate(sorted_findings, 1):
            color = risk_colors.get(f["risk"], "#6c757d")
            tag = self.RISK_EMOJI.get(f["risk"], "[未知]")
            findings_html += f"""
            <div style="border-left:4px solid {color};padding:12px;margin:12px 0;background:#f8f9fa;">
              <h3>{i}. <span style="color:{color}">{tag}</span> {f['title']}</h3>
              <p><strong>描述：</strong>{f['description']}</p>
              {"<p><strong>建议：</strong>" + f['recommendation'] + "</p>" if f['recommendation'] else ""}
            </div>"""

        target_line = f"<p><strong>测试目标：</strong>{target}</p>" if target else ""

        return f"""<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>{title}</title>
<style>body{{font-family:sans-serif;max-width:900px;margin:40px auto;padding:0 20px;}}
table{{border-collapse:collapse;width:100%;}}th,td{{border:1px solid #ddd;padding:8px;text-align:center;}}
th{{background:#f2f2f2;}}</style></head>
<body>
<h1>{title}</h1>
<p><strong>生成时间：</strong>{timestamp}</p>
{target_line}
<h2>概要</h2>
<table><tr><th>等级</th><th>数量</th></tr>
<tr><td style="color:#dc3545">严重</td><td>{stats['critical']}</td></tr>
<tr><td style="color:#fd7e14">高危</td><td>{stats['high']}</td></tr>
<tr><td style="color:#ffc107">中危</td><td>{stats['medium']}</td></tr>
<tr><td style="color:#28a745">低危</td><td>{stats['low']}</td></tr>
<tr><td style="color:#17a2b8">信息</td><td>{stats['info']}</td></tr>
</table>
<h2>详细发现</h2>
{findings_html}
</body></html>"""

    # ------------------------------------------------------------------
    # 渗透测试报告（含攻击链 + 漏洞利用结果）
    # ------------------------------------------------------------------

    def _gen_pentest_markdown(
        self,
        title: str,
        target: str,
        timestamp: str,
        findings: List[Dict],
        stats: Dict,
        attack_chain: Optional[Any] = None,
        exploit_results: Optional[Any] = None,
    ) -> str:
        lines = [
            f"# {title}",
            "",
            f"**生成时间**: {timestamp}  ",
        ]
        if target:
            lines.append(f"**测试目标**: {target}  ")
        lines.append(f"**报告类型**: 渗透测试报告  ")
        lines += [
            "",
            "---",
            "",
            "## 1. 概要统计",
            "",
            "| 等级 | 数量 |",
            "|------|------|",
            f"| 严重 | {stats['critical']} |",
            f"| 高危 | {stats['high']} |",
            f"| 中危 | {stats['medium']} |",
            f"| 低危 | {stats['low']} |",
            f"| 信息 | {stats['info']} |",
            "",
        ]

        # ---- 漏洞详情 ----
        lines += ["## 2. 漏洞详情", ""]
        if not findings:
            lines.append("*本次扫描未发现明显安全问题。*")
            lines.append("")
        else:
            risk_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
            sorted_findings = sorted(findings, key=lambda x: risk_order.get(x["risk"], 5))
            for i, f in enumerate(sorted_findings, 1):
                risk_tag = self.RISK_EMOJI.get(f["risk"], "[未知]")
                lines.append(f"### 2.{i} {risk_tag} {f['title']}")
                lines.append("")
                if f.get("vuln_id"):
                    lines.append(f"- **漏洞ID**: {f['vuln_id']}")
                if f.get("cvss_score"):
                    lines.append(f"- **CVSS**: {f['cvss_score']}")
                if f["description"]:
                    lines.append(f"- **描述**: {f['description']}")
                if f.get("affected"):
                    lines.append(f"- **影响**: {f['affected']}")
                if f["recommendation"]:
                    lines.append(f"- **修复建议**: {f['recommendation']}")
                lines += ["", "---", ""]

        # ---- 攻击链 ----
        lines += ["## 3. 攻击链分析", ""]
        if attack_chain:
            chain = attack_chain if isinstance(attack_chain, dict) else (
                attack_chain.model_dump() if hasattr(attack_chain, "model_dump") else {}
            )
            lines.append(f"**结果**: {'成功' if chain.get('success') else '未成功'}  ")
            lines.append(f"**最终权限**: {chain.get('final_permission', 'N/A')}  ")
            if chain.get("summary"):
                lines.append(f"**摘要**: {chain['summary']}  ")
            lines.append("")

            steps = chain.get("steps", [])
            if steps:
                lines.append("### 攻击路径")
                lines.append("")
                lines.append("| 步骤 | 目标 | 漏洞 | 工具 | 状态 | 权限 |")
                lines.append("|------|------|------|------|------|------|")
                for s in steps:
                    if isinstance(s, dict):
                        sid = s.get("step_id", "")
                        tgt = s.get("target", "")
                        vid = s.get("vuln_id", "")
                        tool = s.get("exploit_tool", "")
                        status = s.get("status", "")
                        perm = s.get("permission_gained", "")
                    else:
                        sid = getattr(s, "step_id", "")
                        tgt = getattr(s, "target", "")
                        vid = getattr(s, "vuln_id", "")
                        tool = getattr(s, "exploit_tool", "")
                        status = getattr(s, "status", "")
                        perm = getattr(s, "permission_gained", "")
                    lines.append(f"| {sid} | {tgt} | {vid} | {tool} | {status} | {perm} |")
                lines.append("")

            rollbacks = chain.get("rollbacks", [])
            if rollbacks:
                lines.append(f"### 回退记录 ({len(rollbacks)} 次)")
                lines.append("")
                for rb in rollbacks:
                    vid = rb.get("vuln_id", "") if isinstance(rb, dict) else getattr(rb, "vuln_id", "")
                    err = rb.get("error", "") if isinstance(rb, dict) else getattr(rb, "error", "")
                    lines.append(f"- 漏洞 {vid}: {err}")
                lines.append("")
        else:
            lines.append("*未生成攻击链。*")
            lines.append("")

        # ---- 利用结果 ----
        lines += ["## 4. 漏洞利用结果", ""]
        if exploit_results:
            results_list = exploit_results if isinstance(exploit_results, list) else [exploit_results]
            for idx, er in enumerate(results_list, 1):
                if isinstance(er, dict):
                    lines.append(f"### 4.{idx} {er.get('exploit_type', 'N/A')}")
                    lines.append(f"- **目标**: {er.get('target', '')}")
                    lines.append(f"- **成功**: {'是' if er.get('success') else '否'}")
                    if er.get("vulnerable") is not None:
                        lines.append(f"- **存在漏洞**: {'是' if er['vulnerable'] else '否'}")
                    if er.get("duration"):
                        lines.append(f"- **耗时**: {er['duration']:.2f}s")
                    lines.append("")
        else:
            lines.append("*未执行漏洞利用。*")
            lines.append("")

        # ---- 风险评估 ----
        lines += ["## 5. 综合风险评估", ""]
        total = sum(stats.values())
        high_risk = stats["critical"] + stats["high"]
        if high_risk > 0:
            lines.append(f"**风险等级**: 高  ")
            lines.append(f"发现 {high_risk} 个高危及以上漏洞，建议立即修复。")
        elif stats["medium"] > 0:
            lines.append(f"**风险等级**: 中  ")
            lines.append(f"发现 {stats['medium']} 个中危漏洞，建议尽快修复。")
        elif total > 0:
            lines.append(f"**风险等级**: 低  ")
            lines.append("仅发现低危或信息级别问题。")
        else:
            lines.append("**风险等级**: 安全  ")
            lines.append("未发现安全问题。")
        lines += ["", ""]

        # ---- 修复建议汇总 ----
        lines += ["## 6. 修复建议汇总", ""]
        recs = [f for f in findings if f.get("recommendation")]
        if recs:
            for i, f in enumerate(recs, 1):
                lines.append(f"{i}. **{f['title']}**: {f['recommendation']}")
            lines.append("")
        else:
            lines.append("*暂无修复建议。*")
            lines.append("")

        return "\n".join(lines)

    def get_schema(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "sensitivity": self.sensitivity,
            "parameters": {
                "title": {"type": "string", "description": "报告标题", "required": True},
                "findings": {
                    "type": "array",
                    "description": "发现列表，每项含 title/risk/description/recommendation；可为空",
                    "required": False,
                },
                "format": {
                    "type": "string",
                    "description": "输出格式: markdown/html/json/pentest（默认 markdown）",
                    "required": False,
                },
                "target": {"type": "string", "description": "测试目标（可选）", "required": False},
                "attack_chain": {"type": "object", "description": "攻击链结果（可选，pentest 格式时使用）", "required": False},
                "exploit_results": {"type": "array", "description": "漏洞利用结果列表（可选）", "required": False},
            },
        }
