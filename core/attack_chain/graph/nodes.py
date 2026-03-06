"""
攻击链图的节点定义（LangGraph 的各个处理节点）
每个函数接收 AttackChainState 并返回更新后的状态。
"""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict

from loguru import logger

from .state import (
    AttackChainResult,
    AttackChainState,
    AttackStep,
    StepStatus,
)


class GraphNodeType(str, Enum):
    """图节点类型枚举"""
    INIT = "init_graph"
    SELECT_NEXT = "select_next_node"
    EXECUTE_EXPLOIT = "execute_exploit"
    VERIFY_STEP = "verify_step"
    ROLLBACK = "rollback_or_alternative"
    FINISH = "finish"


# =====================================================================
# 节点函数
# =====================================================================


def init_graph(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    初始化节点：从扫描结果和 enriched vulns 构建资产/漏洞/exploit 节点。
    """
    from .state import AssetNode, VulnNode, ExploitNodeData

    scan = state.get("scan_results", {})
    enriched = state.get("enriched_vulns", [])

    assets = state.get("assets", [])
    vulns = state.get("vulnerabilities", [])
    exploits = state.get("exploits", [])

    # 从扫描结果构建资产节点
    target = scan.get("target", "unknown")
    ports = scan.get("ports", [])

    if not assets:
        for port_info in ports:
            if port_info.get("status") == "open" or port_info.get("open"):
                a = AssetNode(
                    asset_id=f"{target}:{port_info['port']}",
                    host=target,
                    ip=target,
                    port=port_info["port"],
                    service=port_info.get("service", "unknown"),
                )
                assets.append(a)
        if not assets:
            assets.append(AssetNode(asset_id=target, host=target, ip=target))

    # 从扫描漏洞构建漏洞节点
    scan_vulns = scan.get("vulnerabilities", [])
    for sv in scan_vulns:
        vn = VulnNode(
            vuln_id=sv.get("type", f"scan-{len(vulns)}"),
            description=sv.get("description", ""),
            vuln_type=sv.get("type", ""),
            exploitability="medium",
            asset_id=assets[0].asset_id if assets else "",
        )
        vulns.append(vn)

    # 从 enriched_vulns（漏洞库检索结果）补充漏洞和 exploit 信息
    for ev in enriched:
        vuln_id = ev.get("vuln_id", "")
        if vuln_id and vuln_id not in [v.vuln_id for v in vulns]:
            vn = VulnNode(
                vuln_id=vuln_id,
                description=ev.get("description", "")[:300],
                cvss_score=ev.get("cvss_score"),
                exploitability="high" if ev.get("exploits") else "low",
                asset_id=assets[0].asset_id if assets else "",
            )
            vulns.append(vn)

        for exp in ev.get("exploits", []):
            exploits.append(
                ExploitNodeData(
                    exploit_id=f"exp-{len(exploits)}",
                    vuln_id=vuln_id,
                    payload_type=exp.get("exploit_type", ""),
                    tool=exp.get("tool", "builtin"),
                )
            )

    # 为没有 exploit 的扫描漏洞添加 builtin exploit
    exploited_vulns = {e.vuln_id for e in exploits}
    for vn in vulns:
        if vn.vuln_id not in exploited_vulns:
            exploits.append(
                ExploitNodeData(
                    exploit_id=f"builtin-{vn.vuln_id}",
                    vuln_id=vn.vuln_id,
                    payload_type=vn.vuln_type,
                    tool="builtin",
                )
            )

    return {
        "assets": assets,
        "vulnerabilities": vulns,
        "exploits": exploits,
        "next_action": "select",
    }


def select_next_node(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    选择下一步攻击目标：按 CVSS 分数 / 可利用性排序，
    跳过已尝试的漏洞。生产环境中此节点应由 LLM 决策。
    """
    vulns = state.get("vulnerabilities", [])
    exploits = state.get("exploits", [])
    visited = set(state.get("visited_vulns", []))
    current_step = state.get("current_step", 0)
    max_steps = state.get("max_steps", 15)

    if current_step >= max_steps:
        return {"next_action": "finish", "llm_reasoning": "已达最大步数限制"}

    # 按 CVSS 降序 + 可利用性排序
    exploitability_order = {"high": 0, "medium": 1, "low": 2, "": 3}
    candidates = [
        v for v in vulns if v.vuln_id not in visited
    ]
    candidates.sort(
        key=lambda v: (
            exploitability_order.get(v.exploitability, 3),
            -(v.cvss_score or 0),
        )
    )

    if not candidates:
        return {"next_action": "finish", "llm_reasoning": "所有漏洞已尝试完毕"}

    target_vuln = candidates[0]

    available_exploits = [e for e in exploits if e.vuln_id == target_vuln.vuln_id]
    if not available_exploits:
        return {
            "next_action": "finish",
            "llm_reasoning": f"漏洞 {target_vuln.vuln_id} 无可用 exploit",
        }

    chosen_exploit = available_exploits[0]

    step = AttackStep(
        step_id=current_step,
        target=target_vuln.asset_id,
        vuln_id=target_vuln.vuln_id,
        exploit_tool=chosen_exploit.tool,
        payload={
            "type": chosen_exploit.payload_type or target_vuln.vuln_type,
            "exploit_id": chosen_exploit.exploit_id,
            "command": chosen_exploit.command,
        },
        status=StepStatus.PENDING,
    )

    current_path = list(state.get("current_path", []))
    current_path.append(step)
    visited_list = list(visited)
    visited_list.append(target_vuln.vuln_id)

    return {
        "current_path": current_path,
        "visited_vulns": visited_list,
        "next_action": "exploit",
        "llm_reasoning": (
            f"选择漏洞 {target_vuln.vuln_id} "
            f"(CVSS={target_vuln.cvss_score}, exploitability={target_vuln.exploitability}) "
            f"使用工具 {chosen_exploit.tool}"
        ),
    }


async def execute_exploit(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    执行 exploit：调用 ExploitEngine 执行当前步骤的利用。
    """
    current_path = list(state.get("current_path", []))
    if not current_path:
        return {"next_action": "finish"}

    step = current_path[-1]
    step.status = StepStatus.RUNNING

    logger.info(
        f"[攻击链] 步骤 {step.step_id}: "
        f"exploit {step.vuln_id} @ {step.target} via {step.exploit_tool}"
    )

    try:
        from tools.offense.exploit.exploit_engine import ExploitEngine

        engine = ExploitEngine()
        exploit_type = _map_to_engine_type(step.payload.get("type", ""))
        result = await engine.execute_exploit(
            exploit_type=exploit_type,
            target=step.target,
            payload=step.payload,
        )
        step.result = result
        step.status = StepStatus.SUCCESS if result.get("success") or result.get("vulnerable") else StepStatus.FAILED

        if step.status == StepStatus.SUCCESS:
            step.permission_gained = "user"

    except Exception as exc:
        logger.error(f"[攻击链] exploit 执行异常: {exc}")
        step.status = StepStatus.FAILED
        step.error = str(exc)

    current_path[-1] = step
    return {
        "current_path": current_path,
        "next_action": "verify",
        "current_step": state.get("current_step", 0) + 1,
    }


def verify_step(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    验证上一步 exploit 是否成功。
    成功 → 继续下一个漏洞（select）；失败 → 尝试替代（rollback）。
    """
    current_path = state.get("current_path", [])
    if not current_path:
        return {"next_action": "finish"}

    last_step = current_path[-1]

    if last_step.status == StepStatus.SUCCESS:
        logger.info(f"[攻击链] 步骤 {last_step.step_id} 验证成功")
        return {
            "next_action": "select",
            "llm_reasoning": f"步骤 {last_step.step_id} 成功，继续推进",
        }
    else:
        logger.warning(
            f"[攻击链] 步骤 {last_step.step_id} 验证失败: {last_step.error}"
        )
        return {
            "next_action": "rollback",
            "llm_reasoning": f"步骤 {last_step.step_id} 失败，尝试替代路径",
        }


def rollback_or_alternative(state: Dict[str, Any]) -> Dict[str, Any]:
    """
    回退或选择替代 exploit。
    - 如果当前漏洞有其他 exploit，尝试替代
    - 否则标记为 rolled_back，跳过该漏洞，继续下一个
    """
    current_path = list(state.get("current_path", []))
    rollback_history = list(state.get("rollback_history", []))
    exploits = state.get("exploits", [])

    if not current_path:
        return {"next_action": "finish"}

    failed_step = current_path[-1]
    failed_step.status = StepStatus.ROLLED_BACK
    rollback_history.append(failed_step)

    # 查找同漏洞的替代 exploit
    used_exploit_ids = {
        s.payload.get("exploit_id")
        for s in current_path
        if s.vuln_id == failed_step.vuln_id
    }
    alternatives = [
        e for e in exploits
        if e.vuln_id == failed_step.vuln_id and e.exploit_id not in used_exploit_ids
    ]

    if alternatives and failed_step.alternatives_tried < 3:
        alt = alternatives[0]
        new_step = AttackStep(
            step_id=failed_step.step_id,
            target=failed_step.target,
            vuln_id=failed_step.vuln_id,
            exploit_tool=alt.tool,
            payload={
                "type": alt.payload_type,
                "exploit_id": alt.exploit_id,
                "command": alt.command,
            },
            alternatives_tried=failed_step.alternatives_tried + 1,
        )
        current_path[-1] = new_step
        return {
            "current_path": current_path,
            "rollback_history": rollback_history,
            "next_action": "exploit",
            "llm_reasoning": f"替代 exploit: {alt.exploit_id}",
        }

    # 无替代方案，移除失败步骤，继续选择下一个漏洞
    current_path.pop()
    return {
        "current_path": current_path,
        "rollback_history": rollback_history,
        "next_action": "select",
        "llm_reasoning": f"漏洞 {failed_step.vuln_id} 无更多替代，跳过",
    }


def finish(state: Dict[str, Any]) -> Dict[str, Any]:
    """生成最终攻击链结果"""
    current_path = state.get("current_path", [])
    rollback_history = state.get("rollback_history", [])

    successful_steps = [s for s in current_path if s.status == StepStatus.SUCCESS]
    final_perm = "none"
    if successful_steps:
        perms = [s.permission_gained for s in successful_steps if s.permission_gained]
        perm_order = {"system": 4, "root": 4, "admin": 3, "user": 2, "none": 0}
        if perms:
            final_perm = max(perms, key=lambda p: perm_order.get(p, 0))

    result = AttackChainResult(
        success=len(successful_steps) > 0,
        goal=state.get("goal", ""),
        steps=current_path,
        rollbacks=rollback_history,
        final_permission=final_perm,
        summary=(
            f"攻击链完成: {len(successful_steps)}/{len(current_path)} 步成功, "
            f"最终权限={final_perm}, 回退={len(rollback_history)} 次"
        ),
    )

    return {
        "finished": True,
        "chain_result": result,
        "next_action": "done",
    }


# =====================================================================
# 辅助
# =====================================================================


def _map_to_engine_type(vuln_type: str) -> str:
    """将漏洞类型映射到 ExploitEngine 的 exploit_type"""
    web_types = {
        "sql_injection", "xss", "command_injection",
        "file_upload", "path_traversal", "ssrf",
        "敏感路径暴露", "安全响应头缺失", "目录列表启用",
    }
    network_types = {"buffer_overflow", "dos", "smb", "SSH 版本过旧", "FTP 匿名登录"}

    vt_lower = vuln_type.lower()
    if any(t in vt_lower for t in web_types):
        return "web"
    if any(t in vt_lower for t in network_types):
        return "network"
    return "web"
