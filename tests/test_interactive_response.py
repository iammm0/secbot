"""
交互响应流程测试：验证 core.session.SessionManager 与 core 模型。
不依赖已删除的 tui 组件；仅测 core 与 event_bus。
"""
import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def test_imports():
    """确保关键模块可导入"""
    from rich.console import Console
    from utils.event_bus import EventBus, EventType, Event
    from core.models import RequestType, PlanResult, TodoItem, TodoStatus
    from core.agents.planner_agent import PlannerAgent
    from core.session import SessionManager
    from core.agents.hackbot_agent import HackbotAgent
    from core.agents.superhackbot_agent import SuperHackbotAgent
    from utils.audit import AuditTrail
    from database.manager import DatabaseManager
    console = Console(width=80)
    assert console is not None
    bus = EventBus()
    assert EventType.PLAN_START in EventType
    print("OK  imports")


async def test_simple_reply():
    """简单请求（如「你好」）应直接得到回复，不经过 agent 执行"""
    from rich.console import Console
    from utils.event_bus import EventBus
    from core.session import SessionManager
    from core.agents.planner_agent import PlannerAgent
    from database.manager import DatabaseManager
    from utils.audit import AuditTrail
    from core.agents.hackbot_agent import HackbotAgent
    from core.agents.superhackbot_agent import SuperHackbotAgent

    console = Console(width=80)
    event_bus = EventBus()
    db = DatabaseManager()
    audit = AuditTrail(db, "test-session")
    agents = {
        "hackbot": HackbotAgent(name="Hackbot", audit_trail=audit),
        "superhackbot": SuperHackbotAgent(name="SuperHackbot", audit_trail=audit),
    }
    planner = PlannerAgent()
    session_mgr = SessionManager(
        event_bus=event_bus,
        console=console,
        agents=agents,
        planner=planner,
    )

    response = await session_mgr.handle_message("你好", agent_type="hackbot")
    assert response is not None
    assert len(response.strip()) > 0
    assert "你好" in response or "哈" in response or "!" in response
    print("OK  simple reply:", response[:80])
    return response


async def test_technical_flow_no_llm():
    """技术请求：仅跑规划 + 一次 process（不依赖 LLM 可用时再测）"""
    from rich.console import Console
    from utils.event_bus import EventBus, EventType
    from core.session import SessionManager
    from core.agents.planner_agent import PlannerAgent
    from database.manager import DatabaseManager
    from utils.audit import AuditTrail
    from core.agents.hackbot_agent import HackbotAgent
    from core.agents.superhackbot_agent import SuperHackbotAgent
    from core.models import PlanResult, RequestType

    console = Console(width=80)
    event_bus = EventBus()
    db = DatabaseManager()
    audit = AuditTrail(db, "test-session-2")
    agents = {
        "hackbot": HackbotAgent(name="Hackbot", audit_trail=audit),
        "superhackbot": SuperHackbotAgent(name="SuperHackbot", audit_trail=audit),
    }
    planner = PlannerAgent()

    plan_result = await planner.plan("scan localhost ports")
    assert plan_result is not None
    assert plan_result.request_type == RequestType.TECHNICAL
    assert len(plan_result.todos) >= 1
    print("OK  plan_result:", len(plan_result.todos), "todos")

    session_mgr = SessionManager(
        event_bus=event_bus,
        console=console,
        agents=agents,
        planner=planner,
    )
    try:
        response = await asyncio.wait_for(
            session_mgr.handle_message("scan localhost for open ports", agent_type="hackbot"),
            timeout=60.0,
        )
        assert response is not None
        print("OK  technical response length:", len(response))
    except asyncio.TimeoutError:
        print("SKIP technical flow (timeout, LLM may be slow or unavailable)")
    except Exception as e:
        print("FAIL technical flow:", type(e).__name__, str(e))
        raise


def test_agent_process_skip_flags():
    """process(skip_planning=True, skip_report=True) 不报错且不产生 planning/report 事件。"""
    from rich.console import Console
    from utils.event_bus import EventBus, EventType
    from database.manager import DatabaseManager
    from utils.audit import AuditTrail
    from core.agents.hackbot_agent import HackbotAgent

    console = Console(width=80)
    db = DatabaseManager()
    audit = AuditTrail(db, "test-skip")
    agent = HackbotAgent(name="Hackbot", audit_trail=audit)
    bus = EventBus()
    planning_emitted = []
    report_emitted = []

    def on_plan(evt):
        planning_emitted.append(evt)

    def on_report(evt):
        report_emitted.append(evt)

    bus.subscribe(EventType.PLAN_START, on_plan)
    bus.subscribe(EventType.REPORT_END, on_report)

    async def run():
        out = await agent.process(
            "你好",
            on_event=lambda t, d: None,
            skip_planning=True,
            skip_report=True,
        )
        return out

    try:
        resp = asyncio.run(asyncio.wait_for(run(), timeout=30.0))
        assert resp is not None
        print("OK  agent process with skip_planning/skip_report, len:", len(resp))
    except asyncio.TimeoutError:
        print("SKIP agent process (timeout, LLM 未响应或较慢)")
    except (ConnectionError, OSError) as e:
        print("SKIP agent process (Ollama 不可用):", e)
    except Exception as e:
        print("FAIL agent process:", type(e).__name__, str(e))
        raise


def test_run_summary_returns_report():
    """SessionManager._run_summary 返回 InteractionSummary，含 raw_report"""
    from rich.console import Console
    from utils.event_bus import EventBus
    from core.session import SessionManager
    from core.agents.planner_agent import PlannerAgent
    from core.models import (
        PlanResult,
        RequestType,
        TodoItem,
        TodoStatus,
        InteractionSummary,
    )

    class MockSummaryAgent:
        async def summarize_interaction(self, **kwargs):
            return InteractionSummary(
                task_summary="测试任务完成",
                todo_completion={"total": 1, "completed": 1, "failed": 0, "cancelled": 0},
                key_findings=["发现开放端口 22"],
                recommendations=["建议关闭未使用端口"],
                overall_conclusion="扫描完成",
                raw_report="## 报告\n\n任务已完成。\n\n- 发现: 开放端口 22\n",
            )

    console = Console(width=80)
    event_bus = EventBus()
    planner = PlannerAgent()
    session_mgr = SessionManager(
        event_bus=event_bus,
        console=console,
        agents={},
        planner=planner,
        summary_agent=MockSummaryAgent(),
    )

    plan_result = PlanResult(
        request_type=RequestType.TECHNICAL,
        plan_summary="扫描本地端口",
        todos=[
            TodoItem(id="1", content="端口扫描", status=TodoStatus.COMPLETED, tool_hint="port_scan"),
        ],
    )

    class StubAgent:
        _react_history = [
            {"type": "thought", "content": "执行端口扫描"},
            {"type": "observation", "content": "22/tcp open"},
        ]

    async def run():
        summary = await session_mgr._run_summary(
            "scan localhost ports",
            plan_result,
            StubAgent(),
            "扫描完成，发现 22 开放。",
        )
        return summary

    summary = asyncio.run(run())
    assert summary is not None
    assert summary.raw_report
    assert "报告" in summary.raw_report
    print("OK  _run_summary returns report:", summary.raw_report[:60])


if __name__ == "__main__":
    verbose = "-v" in sys.argv or "--verbose" in sys.argv
    run_async = "async" in sys.argv or "full" in sys.argv

    print("=== 1. Imports ===")
    test_imports()

    print("\n=== 2. Agent process skip flags ===")
    test_agent_process_skip_flags()

    print("\n=== 3. _run_summary returns report ===")
    test_run_summary_returns_report()

    print("\n=== 4. Simple reply (async) ===")
    try:
        reply = asyncio.run(test_simple_reply())
        if verbose:
            print("Reply:", reply)
    except Exception as e:
        print("FAIL simple reply:", type(e).__name__, str(e))
        sys.exit(1)

    if run_async:
        print("\n=== 5. Technical flow (async, may timeout) ===")
        try:
            asyncio.run(test_technical_flow_no_llm())
        except Exception as e:
            print("FAIL technical:", type(e).__name__, str(e))
            sys.exit(1)

    print("\n=== All checks done ===")
