// OS built-in executor aggregation / OS 内置工具聚合执行器。
// Author: iammm0; Last edited: 2026-04-23
package executor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/iammm0/execgo/pkg/models"
)

// OSExecutor 聚合本地 OS 能力 / aggregates local OS capabilities.
type OSExecutor struct {
	tools map[string]func(context.Context, *models.Task) (json.RawMessage, error)
}

// NewOSExecutor 创建 OSExecutor 实例并注册内置工具 / creates an OSExecutor and registers builtin tools.
func NewOSExecutor() *OSExecutor {
	shell := &ShellExecutor{}
	file := &FileExecutor{}
	dns := &DNSExecutor{}
	tcp := &TCPExecutor{}
	sleep := &SleepExecutor{}
	noop := &NoopExecutor{}
	httpExec := &HTTPExecutor{}
	return &OSExecutor{
		tools: map[string]func(context.Context, *models.Task) (json.RawMessage, error){
			"shell": shell.Execute,
			"file":  file.Execute,
			"dns":   dns.Execute,
			"tcp":   tcp.Execute,
			"sleep": sleep.Execute,
			"noop":  noop.Execute,
			"http":  httpExec.Execute,
		},
	}
}

// IsOSTool 判断给定名称是否为内置 OS 工具 / reports whether name is a builtin OS tool.
func IsOSTool(name string) bool {
	_, ok := NewOSExecutor().tools[strings.TrimSpace(name)]
	return ok
}

// Name 返回执行器注册名 / returns the executor registry name.
func (e *OSExecutor) Name() string { return "os" }

// Category 返回执行器分类 / returns the executor category.
func (e *OSExecutor) Category() string { return "os" }

// Execute 选择内置工具并执行任务 / selects a builtin tool and executes the task.
func (e *OSExecutor) Execute(ctx context.Context, task *models.Task) (*Result, error) {
	startedAt := time.Now()
	tool := strings.TrimSpace(task.ToolName)
	if tool == "" {
		tool = strings.TrimSpace(task.Type)
	}
	fn, ok := e.tools[tool]
	if !ok {
		return nil, fmt.Errorf("unknown os tool %q", tool)
	}
	if len(task.Input) > 0 && len(task.Params) == 0 {
		task.Params = task.Input
	}
	raw, err := fn(ctx, task)
	finishedAt := time.Now()
	res := &Result{
		TaskID:     task.ID,
		Status:     models.RuntimeSuccess,
		Output:     raw,
		StartedAt:  &startedAt,
		FinishedAt: &finishedAt,
		DurationMS: finishedAt.Sub(startedAt).Milliseconds(),
	}
	if err != nil {
		res.Status = models.RuntimeFailed
		return res, err
	}
	return res, nil
}

// ListTools 返回 OS executor 可发现的工具清单 / returns discoverable tools for the OS executor.
func (e *OSExecutor) ListTools(ctx context.Context) ([]Tool, error) {
	_ = ctx
	return []Tool{
		{Name: "shell", Category: "os", Description: "Run shell command/script"},
		{Name: "file", Category: "os", Description: "Read/write file"},
		{Name: "dns", Category: "os", Description: "DNS lookup"},
		{Name: "tcp", Category: "os", Description: "TCP probe"},
		{Name: "sleep", Category: "os", Description: "Delay execution"},
		{Name: "noop", Category: "os", Description: "No-op tool"},
		{Name: "http", Category: "os", Description: "HTTP request"},
	}, nil
}

// HealthCheck 检查执行器可用性 / checks executor health.
func (e *OSExecutor) HealthCheck() error { return nil }

// Shutdown 释放执行器资源 / releases executor resources.
func (e *OSExecutor) Shutdown(ctx context.Context) error { _ = ctx; return nil }

// --- OS builtin tools ---

// Shell tool executor (whitelist + runner selection) / Shell 工具执行器（白名单 + runner 选择）。

const (
	// ShellPolicyEnv 控制 shell 执行策略 / controls shell executor policy.
	ShellPolicyEnv = "EXECGO_SHELL_POLICY"
	// ShellPolicyOpen 跳过命令白名单 / bypasses command whitelist.
	ShellPolicyOpen = "open"
	// ShellRunnerAuto 按操作系统自动选择脚本执行器 / automatically picks runner by OS.
	ShellRunnerAuto = "auto"
	// ShellRunnerDirect 直接执行 command/args / executes command/args directly.
	ShellRunnerDirect = "direct"
	// ShellRunnerPowerShell 通过 PowerShell 执行脚本 / executes script through PowerShell.
	ShellRunnerPowerShell = "powershell"
	// ShellRunnerCMD 通过 cmd.exe 执行脚本 / executes script through cmd.exe.
	ShellRunnerCMD = "cmd"
	// ShellRunnerSh 通过 /bin/sh 执行脚本 / executes script through /bin/sh.
	ShellRunnerSh = "sh"
)

// 安全白名单: 仅允许以下命令执行 / security whitelist: only these commands are allowed.
var allowedCommands = map[string]bool{
	"echo": true, "cat": true, "ls": true, "date": true,
	"whoami": true, "hostname": true, "uname": true, "pwd": true,
	"curl": true, "wget": true, "ping": true, "dig": true,
	"grep": true, "awk": true, "sed": true, "head": true, "tail": true,
	"wc": true, "sort": true, "uniq": true, "find": true,
	"dir": true, "where": true, "type": true, // Windows 常用命令 / common Windows commands
}

// ShellParams Shell 执行器参数 / Shell executor parameters.
type ShellParams struct {
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
	Dir     string   `json:"dir,omitempty"`
	Runner  string   `json:"runner,omitempty"` // auto | direct | powershell | cmd | sh
	Script  string   `json:"script,omitempty"`
}

// ShellExecutor 执行白名单内的 Shell 命令 / executes whitelisted shell commands.
type ShellExecutor struct{}

// Type 返回工具类型名 / returns the tool type name.
func (e *ShellExecutor) Type() string { return "shell" }

func isOpenShellPolicy() bool {
	return strings.EqualFold(strings.TrimSpace(os.Getenv(ShellPolicyEnv)), ShellPolicyOpen)
}

func resolveScriptRunner(runner string) (string, []string, string, error) {
	r := strings.ToLower(strings.TrimSpace(runner))
	if r == "" || r == ShellRunnerAuto {
		if runtime.GOOS == "windows" {
			return "powershell", []string{"-NoProfile", "-NonInteractive", "-Command"}, ShellRunnerPowerShell, nil
		}
		return "/bin/sh", []string{"-c"}, ShellRunnerSh, nil
	}
	switch r {
	case ShellRunnerPowerShell:
		return "powershell", []string{"-NoProfile", "-NonInteractive", "-Command"}, ShellRunnerPowerShell, nil
	case ShellRunnerCMD:
		return "cmd", []string{"/C"}, ShellRunnerCMD, nil
	case ShellRunnerSh:
		return "/bin/sh", []string{"-c"}, ShellRunnerSh, nil
	default:
		return "", nil, "", fmt.Errorf("invalid runner %q (supported for script: auto, powershell, cmd, sh)", runner)
	}
}

// Execute 执行 shell 命令或脚本 / executes a shell command or script.
func (e *ShellExecutor) Execute(ctx context.Context, task *models.Task) (json.RawMessage, error) {
	var p ShellParams
	if err := json.Unmarshal(task.Params, &p); err != nil {
		return nil, fmt.Errorf("parse shell params: %w", err)
	}

	if strings.TrimSpace(p.Script) == "" && strings.TrimSpace(p.Command) == "" {
		return nil, fmt.Errorf("either script or command is required")
	}

	openMode := isOpenShellPolicy()
	executedRunner := ShellRunnerDirect

	var cmd *exec.Cmd
	script := strings.TrimSpace(p.Script)
	if script != "" {
		if strings.EqualFold(strings.TrimSpace(p.Runner), ShellRunnerDirect) {
			return nil, fmt.Errorf("runner %q cannot be used with script", p.Runner)
		}
		bin, prefixArgs, normalizedRunner, err := resolveScriptRunner(p.Runner)
		if err != nil {
			return nil, err
		}
		cmd = exec.CommandContext(ctx, bin, append(prefixArgs, p.Script)...)
		executedRunner = normalizedRunner
	} else {
		if strings.TrimSpace(p.Command) == "" {
			return nil, fmt.Errorf("command is required")
		}
		if !openMode {
			// 提取基础命令名用于白名单校验 / extract base command name for whitelist check
			base := p.Command
			if idx := strings.LastIndexAny(base, "/\\"); idx >= 0 {
				base = base[idx+1:]
			}

			if !allowedCommands[base] {
				return nil, fmt.Errorf("command %q is not in the allowed whitelist", base)
			}
		}
		cmd = exec.CommandContext(ctx, p.Command, p.Args...)
	}

	if p.Dir != "" {
		cmd.Dir = p.Dir
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	exitCode := -1
	if cmd.ProcessState != nil {
		exitCode = cmd.ProcessState.ExitCode()
	}

	result := map[string]any{
		"stdout":    stdout.String(),
		"stderr":    stderr.String(),
		"exit_code": exitCode,
		"runner":    executedRunner,
	}

	data, _ := json.Marshal(result)

	if err != nil {
		return data, fmt.Errorf("command failed: %w", err)
	}
	return data, nil
}

// File tool executor (read/write/append/delete/stat) / 文件工具执行器（读/写/追加/删除/元信息）。

// FileParams 文件执行器参数 / File executor parameters.
type FileParams struct {
	Action  string `json:"action"` // read, write, append, delete, stat（读/写/追加/删除/元信息）/ supported actions: read/write/append/delete/stat
	Path    string `json:"path"`
	Content string `json:"content,omitempty"`
}

// FileExecutor 执行文件系统操作 / executes file system operations.
type FileExecutor struct{}

// Type 返回工具类型名 / returns the tool type name.
func (e *FileExecutor) Type() string { return "file" }

// Execute 执行文件系统任务 / executes a filesystem task.
func (e *FileExecutor) Execute(ctx context.Context, task *models.Task) (json.RawMessage, error) {
	_ = ctx
	var p FileParams
	if err := json.Unmarshal(task.Params, &p); err != nil {
		return nil, fmt.Errorf("parse file params: %w", err)
	}

	if p.Path == "" {
		return nil, fmt.Errorf("path is required")
	}

	// 清理路径防止目录穿越 / sanitize path to prevent traversal
	p.Path = filepath.Clean(p.Path)

	switch p.Action {
	case "read":
		return e.read(p.Path)
	case "write":
		return e.write(p.Path, p.Content, false)
	case "append":
		return e.write(p.Path, p.Content, true)
	case "delete":
		return e.delete(p.Path)
	case "stat":
		return e.stat(p.Path)
	default:
		return nil, fmt.Errorf("unknown action %q (supported: read, write, append, delete, stat)", p.Action)
	}
}

func (e *FileExecutor) read(path string) (json.RawMessage, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}
	return json.Marshal(map[string]any{
		"content": string(data),
		"size":    len(data),
	})
}

func (e *FileExecutor) write(path, content string, appendMode bool) (json.RawMessage, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create directory: %w", err)
	}

	flag := os.O_WRONLY | os.O_CREATE
	if appendMode {
		flag |= os.O_APPEND
	} else {
		flag |= os.O_TRUNC
	}

	f, err := os.OpenFile(path, flag, 0o644)
	if err != nil {
		return nil, fmt.Errorf("open file: %w", err)
	}
	defer f.Close()

	n, err := f.WriteString(content)
	if err != nil {
		return nil, fmt.Errorf("write file: %w", err)
	}

	return json.Marshal(map[string]any{
		"bytes_written": n,
	})
}

func (e *FileExecutor) delete(path string) (json.RawMessage, error) {
	if err := os.Remove(path); err != nil {
		return nil, fmt.Errorf("delete file: %w", err)
	}
	return json.Marshal(map[string]any{"deleted": true})
}

func (e *FileExecutor) stat(path string) (json.RawMessage, error) {
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("stat file: %w", err)
	}
	return json.Marshal(map[string]any{
		"name":     info.Name(),
		"size":     info.Size(),
		"mode":     info.Mode().String(),
		"mod_time": info.ModTime(),
		"is_dir":   info.IsDir(),
	})
}

// HTTP request tool executor / HTTP 请求工具执行器。

// HTTPParams HTTP 执行器参数 / HTTP executor parameters.
type HTTPParams struct {
	URL     string            `json:"url"`
	Method  string            `json:"method"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
}

// HTTPExecutor 通过 HTTP 请求执行任务 / executes tasks via HTTP requests.
type HTTPExecutor struct{}

// Type 返回工具类型名 / returns the tool type name.
func (e *HTTPExecutor) Type() string { return "http" }

// Execute 执行 HTTP 请求任务 / executes an HTTP request task.
func (e *HTTPExecutor) Execute(ctx context.Context, task *models.Task) (json.RawMessage, error) {
	var p HTTPParams
	if err := json.Unmarshal(task.Params, &p); err != nil {
		return nil, fmt.Errorf("parse http params: %w", err)
	}

	if p.URL == "" {
		return nil, fmt.Errorf("url is required")
	}
	if p.Method == "" {
		p.Method = http.MethodGet
	}

	var bodyReader io.Reader
	if p.Body != "" {
		bodyReader = strings.NewReader(p.Body)
	}

	req, err := http.NewRequestWithContext(ctx, p.Method, p.URL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	for k, v := range p.Headers {
		req.Header.Set(k, v)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 限制 1MB / limit 1MB
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	result := map[string]any{
		"status_code": resp.StatusCode,
		"body":        string(respBody),
	}

	if resp.StatusCode >= 400 {
		return json.Marshal(result) // 仍然返回结果但标记错误 / still return result but mark error
	}

	return json.Marshal(result)
}

// DNS lookup tool executor / DNS 查询工具执行器。

// DNSParams DNS 执行器参数 / DNS executor parameters.
type DNSParams struct {
	Name   string `json:"name"`
	Record string `json:"record,omitempty"` // ip | txt | cname，默认 ip / default ip
}

// DNSExecutor 使用系统解析器做 DNS 查询 / DNS lookups via system resolver.
type DNSExecutor struct{}

// Type 返回工具类型名 / returns the tool type name.
func (e *DNSExecutor) Type() string { return "dns" }

// Execute 执行 DNS 查询任务 / executes a DNS lookup task.
func (e *DNSExecutor) Execute(ctx context.Context, task *models.Task) (json.RawMessage, error) {
	var p DNSParams
	if err := json.Unmarshal(task.Params, &p); err != nil {
		return nil, fmt.Errorf("parse dns params: %w", err)
	}
	if strings.TrimSpace(p.Name) == "" {
		return nil, fmt.Errorf("name is required")
	}

	rec := strings.ToLower(strings.TrimSpace(p.Record))
	if rec == "" {
		rec = "ip"
	}

	r := &net.Resolver{PreferGo: true}

	switch rec {
	case "ip":
		addrs, err := r.LookupHost(ctx, p.Name)
		if err != nil {
			return nil, fmt.Errorf("lookup host: %w", err)
		}
		return json.Marshal(map[string]any{"name": p.Name, "record": "ip", "addrs": addrs})
	case "txt":
		txts, err := r.LookupTXT(ctx, p.Name)
		if err != nil {
			return nil, fmt.Errorf("lookup txt: %w", err)
		}
		return json.Marshal(map[string]any{"name": p.Name, "record": "txt", "txt": txts})
	case "cname":
		cname, err := r.LookupCNAME(ctx, p.Name)
		if err != nil {
			return nil, fmt.Errorf("lookup cname: %w", err)
		}
		return json.Marshal(map[string]any{"name": p.Name, "record": "cname", "cname": cname})
	default:
		return nil, fmt.Errorf("record must be one of: ip, txt, cname (got %q)", p.Record)
	}
}

// TCP probe tool executor / TCP 连通性探测工具执行器。

const defaultTCPTimeoutMS = 5000

// TCPMaxDialTimeout 单次拨号超时上限 / max dial timeout per task.
const TCPMaxDialTimeout = 60 * time.Second

// TCPParams TCP 连通性探测参数 / TCP dial probe parameters.
type TCPParams struct {
	Address   string `json:"address"`
	TimeoutMS int64  `json:"timeout_ms,omitempty"`
}

// TCPExecutor 检测 TCP 端口是否可达 / checks TCP connectivity to host:port.
type TCPExecutor struct{}

// Type 返回工具类型名 / returns the tool type name.
func (e *TCPExecutor) Type() string { return "tcp" }

// Execute 执行 TCP 探测任务 / executes a TCP dial probe task.
func (e *TCPExecutor) Execute(ctx context.Context, task *models.Task) (json.RawMessage, error) {
	var p TCPParams
	if err := json.Unmarshal(task.Params, &p); err != nil {
		return nil, fmt.Errorf("parse tcp params: %w", err)
	}
	if p.Address == "" {
		return nil, fmt.Errorf("address is required (host:port)")
	}

	timeout := time.Duration(defaultTCPTimeoutMS) * time.Millisecond
	if p.TimeoutMS > 0 {
		timeout = time.Duration(p.TimeoutMS) * time.Millisecond
	}
	if timeout > TCPMaxDialTimeout {
		return nil, fmt.Errorf("timeout_ms exceeds max of %d ms", TCPMaxDialTimeout.Milliseconds())
	}

	d := net.Dialer{Timeout: timeout}
	c, err := d.DialContext(ctx, "tcp", p.Address)
	if err != nil {
		return nil, fmt.Errorf("tcp dial: %w", err)
	}
	_ = c.Close()

	return json.Marshal(map[string]any{
		"ok":      true,
		"address": p.Address,
	})
}

// Sleep tool executor / 延时工具执行器。

// SleepMaxDuration 单次 sleep 上限，防止长时间占用并发槽 / max sleep to avoid hogging worker slots.
const SleepMaxDuration = 10 * time.Minute

// SleepParams sleep 执行器参数 / sleep executor parameters.
type SleepParams struct {
	DurationMS int64 `json:"duration_ms"`
}

// SleepExecutor 按毫秒延时，可被 context 取消 / delays for a duration; cancellable via context.
type SleepExecutor struct{}

// Type 返回工具类型名 / returns the tool type name.
func (e *SleepExecutor) Type() string { return "sleep" }

// Execute 执行 sleep 延时任务 / executes a sleep (delay) task.
func (e *SleepExecutor) Execute(ctx context.Context, task *models.Task) (json.RawMessage, error) {
	var p SleepParams
	if err := json.Unmarshal(task.Params, &p); err != nil {
		return nil, fmt.Errorf("parse sleep params: %w", err)
	}
	if p.DurationMS < 0 {
		return nil, fmt.Errorf("duration_ms must be non-negative")
	}
	d := time.Duration(p.DurationMS) * time.Millisecond
	if d > SleepMaxDuration {
		return nil, fmt.Errorf("duration_ms exceeds max of %d ms", SleepMaxDuration.Milliseconds())
	}
	if d == 0 {
		return json.Marshal(map[string]any{"slept_ms": int64(0)})
	}

	t := time.NewTimer(d)
	defer t.Stop()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-t.C:
	}

	return json.Marshal(map[string]any{"slept_ms": p.DurationMS})
}

// No-op tool executor / 空操作工具执行器。

// NoopParams 无操作执行器参数（均可选）/ noop executor parameters (all optional).
type NoopParams struct {
	Message string `json:"message,omitempty"`
}

// NoopExecutor 占位与测试，无外部 IO / placeholder for DAGs and tests; no external I/O.
type NoopExecutor struct{}

// Type 返回工具类型名 / returns the tool type name.
func (e *NoopExecutor) Type() string { return "noop" }

// Execute 执行 noop 任务并回显 message / executes a noop task and echoes the message.
func (e *NoopExecutor) Execute(ctx context.Context, task *models.Task) (json.RawMessage, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	var p NoopParams
	if len(task.Params) > 0 {
		if err := json.Unmarshal(task.Params, &p); err != nil {
			return nil, fmt.Errorf("parse noop params: %w", err)
		}
	}

	return json.Marshal(map[string]any{
		"ok":      true,
		"message": p.Message,
	})
}
