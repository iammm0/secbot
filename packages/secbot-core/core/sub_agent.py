"""
Sub-agent scheduler for secbot.

Implements the delegation pattern from opencode's Task tool:
  - Primary agents (build/plan) can delegate to sub-agents (explore/general)
  - Explore agents run in parallel (up to MAX_PARALLEL)
  - Sub-agent results are collected and returned to the parent

Design reference: opencode Task tool (packages/opencode/src/tool/task.ts)
"""
from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

from utils.event_bus import EventBus, EventType
from utils.logger import logger

MAX_PARALLEL_EXPLORE = 3


@dataclass
class SubAgentTask:
    """A single sub-agent work unit."""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    agent_type: str = "explore"
    prompt: str = ""
    description: str = ""
    result: Optional[str] = None
    error: Optional[str] = None
    completed: bool = False


@dataclass
class DelegationResult:
    """Aggregated result from one or more sub-agent tasks."""
    tasks: List[SubAgentTask] = field(default_factory=list)
    combined_result: str = ""
    success: bool = True


class SubAgentScheduler:
    """
    Schedules and runs sub-agent tasks on behalf of a primary agent.

    Usage:
        scheduler = SubAgentScheduler(event_bus, get_agent_fn)
        result = await scheduler.delegate("explore", "Find all API endpoints")
        results = await scheduler.delegate_parallel([
            ("explore", "Search for auth handlers"),
            ("explore", "Search for database models"),
            ("explore", "Search for test patterns"),
        ])
    """

    def __init__(
        self,
        event_bus: EventBus,
        get_agent: Callable[[str], Any],
    ):
        self._event_bus = event_bus
        self._get_agent = get_agent

    async def delegate(
        self,
        agent_type: str,
        prompt: str,
        description: str = "",
        allowed_tools: Optional[List[str]] = None,
    ) -> SubAgentTask:
        """Delegate a single task to a sub-agent and wait for completion."""
        task = SubAgentTask(
            agent_type=agent_type,
            prompt=prompt,
            description=description or prompt[:60],
        )

        await self._event_bus.emit_simple_async(
            EventType.SUBAGENT_START,
            task_id=task.id,
            agent_type=agent_type,
            description=task.description,
        )

        try:
            agent = self._get_agent(agent_type)
            if agent is None:
                task.error = f"Sub-agent not found: {agent_type}"
                task.completed = True
                return task

            _tools_backup = None
            if allowed_tools is not None and hasattr(agent, "tools"):
                _tools_backup = list(agent.tools)
                agent.tools = [
                    t for t in agent.tools
                    if getattr(t, "name", "") in allowed_tools
                ]

            try:
                result = await agent.process(
                    prompt,
                    skip_planning=True,
                    skip_report=True,
                )
                task.result = result
            finally:
                if _tools_backup is not None:
                    agent.tools = _tools_backup

        except Exception as exc:
            logger.exception(f"Sub-agent {agent_type} failed: {exc}")
            task.error = str(exc)
        finally:
            task.completed = True
            await self._event_bus.emit_simple_async(
                EventType.SUBAGENT_RESULT,
                task_id=task.id,
                agent_type=agent_type,
                success=task.error is None,
                result=task.result or "",
                error=task.error or "",
            )

        return task

    async def delegate_parallel(
        self,
        tasks: List[tuple],
        max_parallel: int = MAX_PARALLEL_EXPLORE,
        allowed_tools: Optional[List[str]] = None,
    ) -> DelegationResult:
        """
        Run multiple sub-agent tasks concurrently.

        Args:
            tasks: List of (agent_type, prompt, description?) tuples
            max_parallel: Maximum concurrent tasks
            allowed_tools: Tool whitelist for all sub-agents

        Returns:
            DelegationResult with all task outcomes
        """
        sem = asyncio.Semaphore(max_parallel)

        async def _run_one(spec: tuple) -> SubAgentTask:
            async with sem:
                agent_type = spec[0]
                prompt = spec[1]
                desc = spec[2] if len(spec) > 2 else ""
                return await self.delegate(
                    agent_type, prompt, desc,
                    allowed_tools=allowed_tools,
                )

        completed = await asyncio.gather(
            *[_run_one(t) for t in tasks],
            return_exceptions=True,
        )

        result_tasks: List[SubAgentTask] = []
        for item in completed:
            if isinstance(item, SubAgentTask):
                result_tasks.append(item)
            elif isinstance(item, Exception):
                err_task = SubAgentTask(
                    error=str(item), completed=True,
                )
                result_tasks.append(err_task)

        parts = []
        all_ok = True
        for t in result_tasks:
            if t.result:
                parts.append(f"[{t.agent_type}] {t.result}")
            elif t.error:
                parts.append(f"[{t.agent_type}] Error: {t.error}")
                all_ok = False

        return DelegationResult(
            tasks=result_tasks,
            combined_result="\n\n---\n\n".join(parts),
            success=all_ok,
        )
