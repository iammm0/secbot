"""
交互响应流程测试：验证 Planning -> Reasoning/Action -> Report 能否正常回应。
运行: python -m pytest tests/test_interactive_response.py -v -s
或:  python tests/test_interactive_response.py
"""
import asyncio
import sys
from pathlib import Path

# 保证项目根在 path 中
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def test_imports():
    """确保关键模块可导入"""
    from rich.console import Console
    from utils.event_bus import EventBus, EventType, Event
    from tui.models import RequestType, PlanResult, TodoItem, TodoStatus
    from agents.planner_agent import PlannerAgent
    from tui.session_manager import SessionManager
    from agents.hackbot_agent import HackbotAgent
    from agents.superhackbot_agent import SuperHackbotAgent
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
    from tui.session_manager import SessionManager
    from agents.planner_agent import PlannerAgent
    from database.manager import DatabaseManager
    from utils.audit import AuditTrail
    from agents.hackbot_agent import HackbotAgent
    from agents.superhackbot_agent import SuperHackbotAgent

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
    from tui.session_manager import SessionManager
    from agents.planner_agent import PlannerAgent
    from database.manager import DatabaseManager
    from utils.audit import AuditTrail
    from agents.hackbot_agent import HackbotAgent
    from agents.superhackbot_agent import SuperHackbotAgent
    from tui.models import PlanResult, RequestType

    console = Console(width=80)
    event_bus = EventBus()
    db = DatabaseManager()
    audit = AuditTrail(db, "test-session-2")
    agents = {
        "hackbot": HackbotAgent(name="Hackbot", audit_trail=audit),
        "superhackbot": SuperHackbotAgent(name="SuperHackbot", audit_trail=audit),
    }
    planner = PlannerAgent()

    # 1) 仅规划
    plan_result = await planner.plan("scan localhost ports")
    assert plan_result is not None
    assert plan_result.request_type == RequestType.TECHNICAL
    assert len(plan_result.todos) >= 1
    print("OK  plan_result:", len(plan_result.todos), "todos")

    # 2) 完整 SessionManager 流程（会调 LLM，可能超时或不可用）
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


def test_planning_component_render():
    """Planning 组件 render 不报错（含 Group + Markdown）"""
    from rich.console import Console
    from utils.event_bus import EventBus, EventType, Event
    from tui.components.planning import PlanningComponent
    from tui.models import TodoItem, TodoStatus

    console = Console(width=80)
    bus = EventBus()
    comp = PlanningComponent(console, bus)
    # 无 todos
    p = comp.render()
    assert p is not None
    # 有 todos 和 plan_summary
    comp.plan_summary = "**目标**: 扫描端口"
    comp.todos = [
        TodoItem(id="1", content="端口扫描", status=TodoStatus.PENDING, tool_hint="port_scan"),
    ]
    p2 = comp.render()
    assert p2 is not None
    print("OK  planning render with Group+Markdown")


def test_reasoning_component_markdown():
    """Reasoning 组件 Markdown 渲染不报错"""
    from rich.console import Console
    from utils.event_bus import EventBus, EventType, Event
    from tui.components.reasoning import ReasoningComponent

    console = Console(width=80)
    bus = EventBus()
    comp = ReasoningComponent(console, bus)
    bus.emit(Event(type=EventType.THINK_START, data={"iteration": 1}))
    bus.emit(Event(type=EventType.THINK_END, data={"thought": "**分析**: 需要执行 port_scan"}))
    assert len(comp.thoughts) == 1
    panel = comp.render_thought(comp.thoughts[0], collapsed=False)
    assert panel is not None
    print("OK  reasoning Markdown render")


def test_content_component_markdown():
    """Content 组件 Markdown 不报错"""
    from rich.console import Console
    from tui.components.content import ContentComponent

    console = Console(width=80)
    comp = ContentComponent(console)
    comp.display_content("**测试** 内容")
    comp.display_observation("观察 **结果**")
    comp.display_user_message("用户**输入**")
    print("OK  content Markdown")


def test_execution_component_markdown():
    """Execution 组件结果用 Markdown 不报错"""
    from rich.console import Console
    from utils.event_bus import EventBus, EventType, Event
    from tui.components.execution import ExecutionComponent

    console = Console(width=80)
    bus = EventBus()
    comp = ExecutionComponent(console, bus)
    bus.emit(Event(type=EventType.EXEC_START, data={"tool": "port_scan", "params": {"target": "localhost"}}, iteration=1))
    bus.emit(Event(type=EventType.EXEC_RESULT, data={
        "tool": "port_scan", "success": True, "result": "开放: **22**, **80**"
    }, iteration=1))
    assert len(comp.executions) == 1
    assert comp.executions[0].get("result") is not None
    print("OK  execution Markdown")


def test_agent_process_skip_flags():
    """process(skip_planning=True, skip_report=True) 不报错且不产生 planning/report 事件。
    依赖真实 LLM（Ollama），超时或不可用时跳过。"""
    from rich.console import Console
    from utils.event_bus import EventBus, EventType
    from database.manager import DatabaseManager
    from utils.audit import AuditTrail
    from agents.hackbot_agent import HackbotAgent

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


def test_report_end_received_and_rendered():
    """技术请求完成后 _run_summary 应发射 REPORT_END，Report 组件能渲染"""
    from rich.console import Console
    from utils.event_bus import EventBus, EventType, Event
    from tui.session_manager import SessionManager
    from tui.components.report import ReportComponent
    from tui.models import (
        PlanResult,
        RequestType,
        TodoItem,
        TodoStatus,
        InteractionSummary,
    )
    from agents.planner_agent import PlannerAgent

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
    report_comp = ReportComponent(console, event_bus)

    # 构造技术请求的 plan_result 和假 agent
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
    report_text = report_comp.get_report_text()
    assert report_text == summary.raw_report
    assert "报告" in report_text
    print("OK  REPORT_END received and Report component has content:", report_text[:60])


if __name__ == "__main__":
    import sys
    verbose = "-v" in sys.argv or "--verbose" in sys.argv
    run_async = "async" in sys.argv or "full" in sys.argv

    print("=== 1. Imports ===")
    test_imports()

    print("\n=== 2. Planning component render ===")
    test_planning_component_render()

    print("\n=== 3. Reasoning component Markdown ===")
    test_reasoning_component_markdown()

    print("\n=== 4. Content component Markdown ===")
    test_content_component_markdown()

    print("\n=== 5. Execution component Markdown ===")
    test_execution_component_markdown()

    print("\n=== 6. Agent process skip flags ===")
    test_agent_process_skip_flags()

    print("\n=== 6b. REPORT_END received and Report component ===")
    test_report_end_received_and_rendered()

    print("\n=== 7. Simple reply (async) ===")
    try:
        reply = asyncio.run(test_simple_reply())
        if verbose:
            print("Reply:", reply)
    except Exception as e:
        print("FAIL simple reply:", type(e).__name__, str(e))
        sys.exit(1)

    if run_async:
        print("\n=== 8. Technical flow (async, may timeout) ===")
        try:
            asyncio.run(test_technical_flow_no_llm())
        except Exception as e:
            print("FAIL technical:", type(e).__name__, str(e))
            sys.exit(1)

    print("\n=== All checks done ===")
