package control

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// TerminalSessionTool 通过子进程 shell 管理终端会话（open/exec/read/close）。
type TerminalSessionTool struct{}

func (t *TerminalSessionTool) Name() string { return "terminal_session" }

func (t *TerminalSessionTool) Description() string {
	return "管理终端会话。输入 JSON：action(open|exec|read|close)、session_id（除 open 外必填）、command（exec 时）、clear_after_read（read 时可选）。"
}

type termReq struct {
	Action         string `json:"action"`
	SessionID      string `json:"session_id"`
	Command        string `json:"command"`
	ClearAfterRead bool   `json:"clear_after_read"`
}

type termSession struct {
	id     string
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	mu     sync.Mutex
	buf    bytes.Buffer
	done   chan struct{}
	err    error
	closed atomic.Bool
}

var (
	termMu       sync.Mutex
	termSessions = map[string]*termSession{}
	termSeq      atomic.Uint64
)

func (t *TerminalSessionTool) Call(ctx context.Context, input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("请提供 JSON 输入")
	}

	var req termReq
	if err := json.Unmarshal([]byte(input), &req); err != nil {
		return "", fmt.Errorf("JSON 解析失败: %w", err)
	}
	req.Action = strings.ToLower(strings.TrimSpace(req.Action))
	switch req.Action {
	case "open":
		return t.openSession(ctx)
	case "exec", "read", "close":
		if req.SessionID == "" {
			return "", fmt.Errorf("action=%s 需要 session_id", req.Action)
		}
		switch req.Action {
		case "exec":
			return t.execSession(req.SessionID, req.Command)
		case "read":
			return t.readSession(req.SessionID, req.ClearAfterRead)
		case "close":
			return t.closeSession(req.SessionID)
		}
	default:
		return "", fmt.Errorf("未知 action: %s", req.Action)
	}
	return "", fmt.Errorf("内部错误")
}

func shellCommand(ctx context.Context) *exec.Cmd {
	if runtime.GOOS == "windows" {
		return exec.CommandContext(ctx, "cmd.exe")
	}
	return exec.CommandContext(ctx, "/bin/sh")
}

func (t *TerminalSessionTool) openSession(ctx context.Context) (string, error) {
	id := fmt.Sprintf("ts-%d", termSeq.Add(1))
	cmd := shellCommand(ctx)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", fmt.Errorf("stdin: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("stdout: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("stderr: %w", err)
	}
	s := &termSession{id: id, cmd: cmd, stdin: stdin, done: make(chan struct{})}

	go func() {
		defer close(s.done)
		var wg sync.WaitGroup
		copyOut := func(r io.Reader) {
			defer wg.Done()
			_, _ = io.Copy(&s.buf, r)
		}
		wg.Add(2)
		go copyOut(stdout)
		go copyOut(stderr)
		wg.Wait()
	}()

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("启动 shell 失败: %w", err)
	}

	termMu.Lock()
	termSessions[id] = s
	termMu.Unlock()

	out, _ := json.MarshalIndent(map[string]any{
		"ok":         true,
		"session_id": id,
		"shell":      cmd.Path,
	}, "", "  ")
	return string(out), nil
}

func (t *TerminalSessionTool) execSession(sessionID, command string) (string, error) {
	command = strings.TrimSpace(command)
	if command == "" {
		return "", fmt.Errorf("exec 需要 command")
	}
	s, err := getSession(sessionID)
	if err != nil {
		return "", err
	}
	if s.closed.Load() {
		return "", fmt.Errorf("会话已关闭")
	}
	line := command
	if !strings.HasSuffix(line, "\n") {
		line += "\n"
	}
	s.mu.Lock()
	_, werr := s.stdin.Write([]byte(line))
	s.mu.Unlock()
	if werr != nil {
		return "", fmt.Errorf("写入命令失败: %w", werr)
	}
	time.Sleep(50 * time.Millisecond)
	out, _ := json.MarshalIndent(map[string]any{
		"ok":         true,
		"session_id": sessionID,
		"bytes_sent": len(line),
	}, "", "  ")
	return string(out), nil
}

func (t *TerminalSessionTool) readSession(sessionID string, clear bool) (string, error) {
	s, err := getSession(sessionID)
	if err != nil {
		return "", err
	}
	s.mu.Lock()
	chunk := s.buf.String()
	if clear {
		s.buf.Reset()
	}
	s.mu.Unlock()
	out, _ := json.MarshalIndent(map[string]any{
		"ok":         true,
		"session_id": sessionID,
		"output":     chunk,
	}, "", "  ")
	return string(out), nil
}

func (t *TerminalSessionTool) closeSession(sessionID string) (string, error) {
	s, err := getSession(sessionID)
	if err != nil {
		return "", err
	}
	if !s.closed.CompareAndSwap(false, true) {
		out, _ := json.MarshalIndent(map[string]any{"ok": true, "session_id": sessionID, "note": "已关闭"}, "", "  ")
		return string(out), nil
	}
	_ = s.stdin.Close()
	done := make(chan struct{})
	go func() {
		_ = s.cmd.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		_ = s.cmd.Process.Kill()
	}
	<-s.done

	termMu.Lock()
	delete(termSessions, sessionID)
	termMu.Unlock()

	out, _ := json.MarshalIndent(map[string]any{"ok": true, "session_id": sessionID}, "", "  ")
	return string(out), nil
}

func getSession(id string) (*termSession, error) {
	termMu.Lock()
	defer termMu.Unlock()
	s, ok := termSessions[id]
	if !ok {
		return nil, fmt.Errorf("会话不存在: %s", id)
	}
	return s, nil
}
