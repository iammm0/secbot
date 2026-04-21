"""
LangGraph 攻击链推理工作流
构建 StateGraph，支持循环推理和动态调整。
当 langgraph 不可用时提供纯 Python 回退。
"""
from __future__ import annotations

from typing import Any, Dict, List

import time
from utils.logger import logger

from .state import AttackChainResult
from . import nodes as N


# =====================================================================
# 尝试导入 langgraph；不可用时使用回退执行器
# =====================================================================

_HAS_LANGGRAPH = False
try:
    from langgraph.graph import StateGraph, END  # type: ignore
    _HAS_LANGGRAPH = True
except ImportError:
    logger.bind(event="attack_chain_fallback", attempt=1).info("langgraph 未安装，攻击链推理将使用内置回退执行器")


class AttackChainGraphAgent:
    """
    攻击链图工作流 Agent
    - 有 LangGraph 时构建 StateGraph 编译执行
    - 无 LangGraph 时使用内置的有限状态机循环执行
    """

    def __init__(self, max_steps: int = 15):
        self._max_steps = max_steps
        self._graph = None

        if _HAS_LANGGRAPH:
            self._graph = self._build_langgraph()

    # ------------------------------------------------------------------
    # 公开接口
    # ------------------------------------------------------------------

    async def generate_attack_chain(
        self,
        scan_results: Dict[str, Any],
        enriched_vulns: List[Dict[str, Any]],
        goal: str = "获取最高权限",
    ) -> AttackChainResult:
        """
        生成最优攻击路径。

        Args:
            scan_results: 漏洞扫描输出 {target, ports, vulnerabilities}
            enriched_vulns: 漏洞库检索后的 enriched 漏洞列表
            goal: 期望目标

        Returns:
            AttackChainResult
        """
        initial_state = {
            "scan_results": scan_results,
            "enriched_vulns": enriched_vulns,
            "goal": goal,
            "max_steps": self._max_steps,
            "current_step": 0,
            "current_path": [],
            "rollback_history": [],
            "visited_vulns": [],
            "assets": [],
            "vulnerabilities": [],
            "permissions": [],
            "exploits": [],
            "finished": False,
            "chain_result": None,
            "next_action": "",
            "llm_reasoning": "",
        }

        started = time.perf_counter()
        chain_logger = logger.bind(event="stage_start", attempt=1, tool="attack_chain_graph")
        chain_logger.info("attack chain graph started")
        if self._graph is not None:
            final = await self._run_langgraph(initial_state)
        else:
            final = await self._run_fallback(initial_state)

        result = final.get("chain_result")
        if result is None:
            result = AttackChainResult(
                success=False,
                goal=goal,
                summary="攻击链推理未能生成有效结果",
            )

        logger.bind(
            event="stage_end",
            duration_ms=int((time.perf_counter() - started) * 1000),
            attempt=1,
            tool="attack_chain_graph",
        ).info(f"[攻击链] {result.summary}")
        return result

    # ------------------------------------------------------------------
    # LangGraph 实现
    # ------------------------------------------------------------------

    def _build_langgraph(self):
        """构建 LangGraph StateGraph"""
        graph = StateGraph(dict)

        graph.add_node(N.GraphNodeType.INIT, N.init_graph)
        graph.add_node(N.GraphNodeType.SELECT_NEXT, N.select_next_node)
        graph.add_node(N.GraphNodeType.EXECUTE_EXPLOIT, N.execute_exploit)
        graph.add_node(N.GraphNodeType.VERIFY_STEP, N.verify_step)
        graph.add_node(N.GraphNodeType.ROLLBACK, N.rollback_or_alternative)
        graph.add_node(N.GraphNodeType.FINISH, N.finish)

        graph.set_entry_point(N.GraphNodeType.INIT)

        graph.add_edge(N.GraphNodeType.INIT, N.GraphNodeType.SELECT_NEXT)

        graph.add_conditional_edges(
            N.GraphNodeType.SELECT_NEXT,
            _route_after_select,
            {
                "exploit": N.GraphNodeType.EXECUTE_EXPLOIT,
                "finish": N.GraphNodeType.FINISH,
            },
        )

        graph.add_edge(N.GraphNodeType.EXECUTE_EXPLOIT, N.GraphNodeType.VERIFY_STEP)

        graph.add_conditional_edges(
            N.GraphNodeType.VERIFY_STEP,
            _route_after_verify,
            {
                "select": N.GraphNodeType.SELECT_NEXT,
                "rollback": N.GraphNodeType.ROLLBACK,
            },
        )

        graph.add_conditional_edges(
            N.GraphNodeType.ROLLBACK,
            _route_after_rollback,
            {
                "exploit": N.GraphNodeType.EXECUTE_EXPLOIT,
                "select": N.GraphNodeType.SELECT_NEXT,
                "finish": N.GraphNodeType.FINISH,
            },
        )

        graph.add_edge(N.GraphNodeType.FINISH, END)

        return graph.compile()

    async def _run_langgraph(self, state: dict) -> dict:
        try:
            result = await self._graph.ainvoke(state)
            return result
        except Exception as exc:
            logger.bind(event="attack_chain_error", attempt=1).error(f"LangGraph 执行失败，回退: {exc}")
            return await self._run_fallback(state)

    # ------------------------------------------------------------------
    # 回退执行器（无 LangGraph 依赖）
    # ------------------------------------------------------------------

    async def _run_fallback(self, state: dict) -> dict:
        """纯 Python 有限状态机回退"""
        state = {**state, **N.init_graph(state)}

        for _ in range(self._max_steps * 3):
            action = state.get("next_action", "select")
            logger.bind(event="attack_chain_stage_transition", attempt=1).debug(f"fallback action={action}")

            if action == "select":
                state = {**state, **N.select_next_node(state)}
            elif action == "exploit":
                state = {**state, **(await N.execute_exploit(state))}
            elif action == "verify":
                state = {**state, **N.verify_step(state)}
            elif action == "rollback":
                state = {**state, **N.rollback_or_alternative(state)}
            elif action in ("finish", "done"):
                if not state.get("finished"):
                    state = {**state, **N.finish(state)}
                break
            else:
                logger.bind(event="attack_chain_error", attempt=1).warning(f"未知 fallback action: {action}")
                break

        if not state.get("finished"):
            state = {**state, **N.finish(state)}

        return state


# =====================================================================
# LangGraph 路由函数
# =====================================================================


def _route_after_select(state: dict) -> str:
    return state.get("next_action", "finish")


def _route_after_verify(state: dict) -> str:
    return state.get("next_action", "select")


def _route_after_rollback(state: dict) -> str:
    return state.get("next_action", "select")
