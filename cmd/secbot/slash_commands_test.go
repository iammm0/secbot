package main

import (
	"context"
	"strings"
	"testing"
)

func TestSlashStateCommandsWithoutLLM(t *testing.T) {
	state := newCLIState("agent", "secbot-cli", nil)

	lines := handleAgentCommand("/agent super", state)
	if state.agentType != "superhackbot" || state.mode != "agent" {
		t.Fatalf("state after /agent super = (%s, %s)", state.agentType, state.mode)
	}
	if len(lines) == 0 || !strings.Contains(lines[0], "已切换智能体") {
		t.Fatalf("unexpected /agent output: %#v", lines)
	}

	lines = handleAskCommand(context.Background(), "/ask", nil, state)
	if state.mode != "ask" {
		t.Fatalf("mode after /ask = %q, want ask", state.mode)
	}
	if len(lines) == 0 || !strings.Contains(lines[0], "Ask 模式") {
		t.Fatalf("unexpected /ask output: %#v", lines)
	}

	lines = handleAskCommand(context.Background(), "/ask off", nil, state)
	if state.mode != "agent" {
		t.Fatalf("mode after /ask off = %q, want agent", state.mode)
	}

	lines = handleStartCommand(context.Background(), "/start", nil, state)
	if len(lines) == 0 || !strings.Contains(lines[0], "当前没有缓存计划") {
		t.Fatalf("unexpected /start output: %#v", lines)
	}

	lines = handleStartCommand(context.Background(), "/start 新任务", nil, state)
	if len(lines) == 0 || !strings.Contains(lines[0], "/start 只执行") {
		t.Fatalf("unexpected /start with args output: %#v", lines)
	}
}
