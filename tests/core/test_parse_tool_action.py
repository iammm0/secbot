"""parse_tool_action 与 npm parse-tool-action 行为对齐的回归用例。"""

from secbot_agent.core.parse_tool_action import (
    extract_first_json_object,
    parse_tool_action,
)


def test_parse_inline_json_after_action_label():
    thought = """Think: ping host
**Action:** {"tool": "execute_command", "params": {"command": "ping -c 1 127.0.0.1"}}"""
    p = parse_tool_action(thought)
    assert p is not None
    assert p.tool == "execute_command"
    assert p.params.get("command") == "ping -c 1 127.0.0.1"


def test_parse_json_code_block_after_action_label():
    thought = """Think: use tool
Action:
```json
{"tool": "nmap_scan", "params": {"target": "10.0.0.1"}}
```"""
    p = parse_tool_action(thought)
    assert p is not None
    assert p.tool == "nmap_scan"
    assert p.params.get("target") == "10.0.0.1"


def test_final_answer_returns_none():
    thought = "Final Answer: done"
    assert parse_tool_action(thought) is None


def test_no_action_label_returns_none():
    assert parse_tool_action('{"tool": "x"}') is None


def test_extract_first_json_object_nested():
    s = 'prefix {"tool": "t", "params": {"a": {"b": 1}}} suffix'
    raw = extract_first_json_object(s)
    assert raw is not None
    assert '"b": 1' in raw


def test_chinese_action_label():
    thought = "行动： {\"tool\": \"foo\", \"params\": {}}"
    p = parse_tool_action(thought)
    assert p is not None
    assert p.tool == "foo"
