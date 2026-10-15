// Package adapter 为成熟 agent（Claude Code / Codex / OpenClaw 等）提供“结构化 action → ExecGo Task DSL”的翻译层。
// 它位于上层 agent 与 ExecGo 执行内核之间，负责把框架无关的 action 归一化、校验并翻译为 TaskGraph。
//
// Package adapter translates mature-agent actions into ExecGo Task DSL.
// It sits between higher-level agents and the ExecGo execution kernel: normalizing, validating,
// and translating framework-neutral actions into TaskGraph values.
package adapter

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/iammm0/execgo/pkg/models"
)

const SchemaVersion = "adapter.v1"

// AdapterKernel 校验成熟 agent 的 action 并翻译成 TaskGraph。
//
// AdapterKernel validates mature-agent actions and translates them into TaskGraph values.
type AdapterKernel struct{}

// NewAdapterKernel 创建默认的确定性 adapter kernel（无外部依赖、纯函数式翻译）。
//
// NewAdapterKernel creates the default deterministic adapter kernel (no external dependencies).
func NewAdapterKernel() *AdapterKernel {
	return &AdapterKernel{}
}

// AgentActionRequest 是成熟 agent 调用 `/adapters/*` 端点时使用的公共请求封装。
//
// AgentActionRequest is the public envelope accepted from mature agents.
type AgentActionRequest struct {
	Adapter   string            `json:"adapter,omitempty"`
	AgentID   string            `json:"agent_id,omitempty"`
	SessionID string            `json:"session_id,omitempty"`
	ActionID  string            `json:"action_id,omitempty"`
	Action    AgentAction       `json:"action"`
	Metadata  map[string]string `json:"metadata,omitempty"`
}

// AgentAction 是框架无关的 action 形状，由 AdapterKernel 翻译为 ExecGo 任务。
//
// AgentAction is the framework-neutral action shape translated by AdapterKernel.
type AgentAction struct {
	Kind      string          `json:"kind"`
	ToolName  string          `json:"tool_name,omitempty"`
	Input     json.RawMessage `json:"input,omitempty"`
	DependsOn []string        `json:"depends_on,omitempty"`
	Retry     int             `json:"retry,omitempty"`
	Timeout   int64           `json:"timeout,omitempty"`
}

// AgentActionResponse 返回翻译后的 TaskGraph，以及可用于调试/审计的翻译痕迹。
//
// AgentActionResponse returns the translated graph and trace metadata.
type AgentActionResponse struct {
	Accepted         int               `json:"accepted"`
	TaskIDs          []string          `json:"task_ids"`
	TaskGraph        *models.TaskGraph `json:"task_graph"`
	TranslationTrace map[string]any    `json:"translation_trace,omitempty"`
}

// AdapterCapabilitiesResponse 描述 adapter 的稳定契约（schema_version）、支持的 profile 与 action 词表。
//
// AdapterCapabilitiesResponse describes the adapter contract and supported profiles.
type AdapterCapabilitiesResponse struct {
	SchemaVersion      string   `json:"schema_version"`
	Profiles           []string `json:"profiles"`
	ActionKinds        []string `json:"action_kinds"`
	CompatibilityNotes []string `json:"compatibility_notes,omitempty"`
}

// ToolManifestResponse 以 agent 友好的方式暴露 ExecGo 可用工具清单（可当作 tools/skills）。
//
// ToolManifestResponse exposes ExecGo tools in an agent-friendly form.
type ToolManifestResponse struct {
	SchemaVersion string          `json:"schema_version"`
	Tools         []AgentToolSpec `json:"tools"`
}

// AgentToolSpec 描述一个 adapter 层“工具/动作”规范（名称、kind、输入 schema 与别名）。
//
// AgentToolSpec describes one adapter-level tool/action.
type AgentToolSpec struct {
	Name        string         `json:"name"`
	ActionKind  string         `json:"action_kind"`
	Category    string         `json:"category"`
	Description string         `json:"description,omitempty"`
	InputSchema map[string]any `json:"input_schema,omitempty"`
	Aliases     []string       `json:"aliases,omitempty"`
}

var supportedKinds = []string{
	"os.shell",
	"os.file",
	"os.http",
	"os.dns",
	"os.tcp",
	"os.sleep",
	"os.noop",
	"runtime.command",
	"runtime.script",
	"mcp.call",
	"cli.run",
	"task_graph.submit",
}

// Capabilities 返回 adapter 能力集：schema 版本、profiles 与稳定 action 词表。
//
// Capabilities returns the adapter profiles and stable action vocabulary.
func (k *AdapterKernel) Capabilities() AdapterCapabilitiesResponse {
	_ = k
	return AdapterCapabilitiesResponse{
		SchemaVersion: SchemaVersion,
		Profiles:      []string{"generic", "claudecode", "codex", "openclaw"},
		ActionKinds:   append([]string{}, supportedKinds...),
		CompatibilityNotes: []string{
			"POST /tasks remains the direct Task DSL path.",
			"POST /adapters/actions translates structured mature-agent actions into TaskGraph submissions.",
			"runtime.command and runtime.script use the runtime executor for process scheduling, resource limits, and sandbox policy.",
		},
	}
}

// ToolManifest 返回稳定的工具清单，方便成熟 agent 直接暴露为 tools/skills（避免手写 DSL）。
//
// ToolManifest returns a stable manifest that mature agents can expose as tools or skills.
func (k *AdapterKernel) ToolManifest() ToolManifestResponse {
	_ = k
	return ToolManifestResponse{
		SchemaVersion: SchemaVersion,
		Tools: []AgentToolSpec{
			{Name: "execgo.os.shell", ActionKind: "os.shell", Category: "os", Description: "Run an allowlisted shell command or script", InputSchema: shellInputSchema(), Aliases: []string{"shell", "bash", "terminal.command"}},
			{Name: "execgo.os.file", ActionKind: "os.file", Category: "os", Description: "Read, write, append, delete, or stat a file", InputSchema: fileInputSchema(), Aliases: []string{"file.read", "file.write"}},
			{Name: "execgo.os.http", ActionKind: "os.http", Category: "os", Description: "Issue an HTTP request", InputSchema: httpInputSchema(), Aliases: []string{"http.request"}},
			{Name: "execgo.os.dns", ActionKind: "os.dns", Category: "os", Description: "Perform a DNS lookup", InputSchema: dnsInputSchema()},
			{Name: "execgo.os.tcp", ActionKind: "os.tcp", Category: "os", Description: "Probe a TCP endpoint", InputSchema: tcpInputSchema()},
			{Name: "execgo.os.sleep", ActionKind: "os.sleep", Category: "os", Description: "Delay execution for a duration", InputSchema: sleepInputSchema()},
			{Name: "execgo.os.noop", ActionKind: "os.noop", Category: "os", Description: "No-op action for testing and placeholders", InputSchema: noopInputSchema()},
			{Name: "execgo.runtime.command", ActionKind: "runtime.command", Category: "runtime", Description: "Submit a command to execgo-runtime with resource and sandbox policy", InputSchema: runtimeCommandInputSchema(), Aliases: []string{"command"}},
			{Name: "execgo.runtime.script", ActionKind: "runtime.script", Category: "runtime", Description: "Submit a script to execgo-runtime with resource and sandbox policy", InputSchema: runtimeScriptInputSchema(), Aliases: []string{"script"}},
			{Name: "execgo.mcp.call", ActionKind: "mcp.call", Category: "mcp", Description: "Call an MCP tool through ExecGo", InputSchema: mcpCallInputSchema()},
			{Name: "execgo.cli.run", ActionKind: "cli.run", Category: "cli-skills", Description: "Run a local CLI skill command", InputSchema: cliRunInputSchema()},
			{Name: "execgo.task_graph.submit", ActionKind: "task_graph.submit", Category: "task-dsl", Description: "Submit a prebuilt ExecGo TaskGraph", InputSchema: taskGraphSubmitInputSchema()},
		},
	}
}

func shellInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"command": stringInput("Command to execute directly. The command basename is checked against ExecGo's shell allowlist unless shell policy is open."),
			"args":    stringArrayInput("Arguments passed to command without shell interpolation."),
			"dir":     stringInput("Optional working directory for the command or script."),
			"script":  stringInput("Script body to execute through the selected runner."),
			"runner":  enumInput([]string{"auto", "direct", "powershell", "cmd", "sh"}, "auto", "Script runner. direct is valid only with command/args, not with script."),
		},
		nil,
		false,
		map[string]any{
			"oneOf": []any{
				map[string]any{"required": []string{"command"}},
				map[string]any{"required": []string{"script"}},
			},
		},
	)
}

func fileInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"action":  enumInput([]string{"read", "write", "append", "delete", "stat"}, "", "Filesystem action to perform."),
			"path":    stringInput("File path. ExecGo cleans the path before executing the action."),
			"content": stringInput("Content used by write and append actions."),
		},
		[]string{"action", "path"},
		false,
		map[string]any{
			"allOf": []any{
				map[string]any{
					"if": map[string]any{
						"properties": map[string]any{
							"action": map[string]any{"enum": []string{"write", "append"}},
						},
					},
					"then": map[string]any{"required": []string{"content"}},
				},
			},
		},
	)
}

func httpInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"url":     map[string]any{"type": "string", "format": "uri", "description": "Request URL."},
			"method":  stringInputWithDefault("HTTP method. Defaults to GET.", "GET"),
			"headers": stringMapInput("HTTP headers to set on the request."),
			"body":    stringInput("Optional request body."),
		},
		[]string{"url"},
		false,
		nil,
	)
}

func dnsInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"name":   stringInput("DNS name to resolve."),
			"record": enumInput([]string{"ip", "txt", "cname"}, "ip", "DNS record kind. Defaults to ip."),
		},
		[]string{"name"},
		false,
		nil,
	)
}

func tcpInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"address":    stringInput("TCP endpoint in host:port form."),
			"timeout_ms": integerInput("Dial timeout in milliseconds. Defaults to 5000.", int64(1), int64(60000), int64(5000)),
		},
		[]string{"address"},
		false,
		nil,
	)
}

func sleepInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"duration_ms": integerInput("Delay duration in milliseconds.", int64(0), int64(600000), nil),
		},
		[]string{"duration_ms"},
		false,
		nil,
	)
}

func noopInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"message": stringInput("Optional message echoed in the result."),
		},
		nil,
		false,
		nil,
	)
}

func runtimeCommandInputSchema() map[string]any {
	return runtimeInputSchema(
		map[string]any{
			"program": stringInput("Executable path or program name for a flat runtime.command input."),
			"args":    stringArrayInput("Arguments passed to program."),
			"env":     stringMapInput("Environment variables merged into the execution object."),
		},
		[]any{
			map[string]any{"required": []string{"program"}},
			map[string]any{"required": []string{"execution"}},
		},
	)
}

func runtimeScriptInputSchema() map[string]any {
	return runtimeInputSchema(
		map[string]any{
			"script":      stringInput("Script body for a flat runtime.script input."),
			"interpreter": stringArrayInput("Interpreter command and arguments, for example [\"/bin/sh\", \"-c\"]."),
			"env":         stringMapInput("Environment variables merged into the execution object."),
		},
		[]any{
			map[string]any{"required": []string{"script"}},
			map[string]any{"required": []string{"execution"}},
		},
	)
}

func runtimeInputSchema(flatProperties map[string]any, oneOf []any) map[string]any {
	properties := map[string]any{
		"task_id":         stringInput("Optional runtime task id. ExecGo injects the adapter action_id when present."),
		"execution":       runtimeExecutionInputSchema(),
		"limits":          freeObjectInput("execgo-runtime limits object, forwarded as-is."),
		"sandbox":         freeObjectInput("execgo-runtime sandbox object, forwarded as-is."),
		"policy":          freeObjectInput("execgo-runtime policy object, forwarded as-is."),
		"control_context": freeObjectInput("execgo-runtime control_context object, forwarded as-is."),
		"metadata":        stringMapInput("Runtime metadata. ExecGo merges adapter provenance into this map."),
	}
	for key, value := range flatProperties {
		properties[key] = value
	}
	return objectInputSchema(properties, nil, false, map[string]any{"oneOf": oneOf})
}

func runtimeExecutionInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"kind":        enumInput([]string{"command", "script"}, "", "Runtime execution kind."),
			"program":     stringInput("Executable path or program name for command execution."),
			"args":        stringArrayInput("Arguments passed to program."),
			"script":      stringInput("Script body for script execution."),
			"interpreter": stringArrayInput("Interpreter command and arguments for script execution."),
			"env":         stringMapInput("Environment variables for the runtime execution."),
		},
		nil,
		true,
		nil,
	)
}

func mcpCallInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"tool_name": stringInput("MCP tool name. Required here when action.tool_name is not set."),
		},
		nil,
		true,
		nil,
	)
}

func cliRunInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"command": stringInput("Local CLI command to execute."),
			"args":    stringArrayInput("Arguments passed to the local CLI command."),
		},
		[]string{"command"},
		false,
		nil,
	)
}

func taskGraphSubmitInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"tasks":      taskArrayInputSchema(),
			"task_graph": objectInputSchema(map[string]any{"tasks": taskArrayInputSchema()}, []string{"tasks"}, false, nil),
		},
		nil,
		false,
		map[string]any{
			"oneOf": []any{
				map[string]any{"required": []string{"tasks"}},
				map[string]any{"required": []string{"task_graph"}},
			},
		},
	)
}

func taskArrayInputSchema() map[string]any {
	return map[string]any{
		"type":        "array",
		"description": "ExecGo Task DSL tasks.",
		"items":       taskInputSchema(),
	}
}

func taskInputSchema() map[string]any {
	return objectInputSchema(
		map[string]any{
			"id":                 stringInput("Unique task id within the graph."),
			"type":               stringInput("Executor type, for example os, runtime, mcp, cli-skills, or a legacy type such as shell/file/http/noop."),
			"tool_name":          stringInput("Tool name used with category-style task types, for example shell, file, http, noop."),
			"execution_category": stringInput("Optional executor category."),
			"params":             freeObjectInput("Legacy task parameters."),
			"input":              freeObjectInput("Category/tool input payload."),
			"depends_on":         stringArrayInput("Task ids that must finish successfully before this task runs."),
			"retry":              integerInput("Retry count.", int64(0), nil, nil),
			"timeout":            integerInput("Timeout in milliseconds.", int64(1), nil, nil),
			"annotations":        stringMapInput("Task annotations for audit and provenance."),
		},
		[]string{"id", "type"},
		true,
		nil,
	)
}

func objectInputSchema(properties map[string]any, required []string, additionalProperties bool, extra map[string]any) map[string]any {
	schema := map[string]any{
		"type":                 "object",
		"properties":           properties,
		"additionalProperties": additionalProperties,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	for key, value := range extra {
		schema[key] = value
	}
	return schema
}

func freeObjectInput(description string) map[string]any {
	return map[string]any{
		"type":                 "object",
		"description":          description,
		"additionalProperties": true,
	}
}

func stringInput(description string) map[string]any {
	return map[string]any{
		"type":        "string",
		"description": description,
	}
}

func stringInputWithDefault(description, defaultValue string) map[string]any {
	schema := stringInput(description)
	schema["default"] = defaultValue
	return schema
}

func stringArrayInput(description string) map[string]any {
	return map[string]any{
		"type":        "array",
		"description": description,
		"items":       map[string]any{"type": "string"},
	}
}

func stringMapInput(description string) map[string]any {
	return map[string]any{
		"type":        "object",
		"description": description,
		"additionalProperties": map[string]any{
			"type": "string",
		},
	}
}

func enumInput(values []string, defaultValue string, description string) map[string]any {
	schema := map[string]any{
		"type":        "string",
		"enum":        values,
		"description": description,
	}
	if defaultValue != "" {
		schema["default"] = defaultValue
	}
	return schema
}

func integerInput(description string, minimum any, maximum any, defaultValue any) map[string]any {
	schema := map[string]any{
		"type":        "integer",
		"description": description,
	}
	if minimum != nil {
		schema["minimum"] = minimum
	}
	if maximum != nil {
		schema["maximum"] = maximum
	}
	if defaultValue != nil {
		schema["default"] = defaultValue
	}
	return schema
}

// Translate 把单个 agent action 请求翻译为 ExecGo TaskGraph（并执行 TaskGraph.Validate 校验）。
//
// Translate converts one agent action request into an ExecGo TaskGraph.
func (k *AdapterKernel) Translate(req AgentActionRequest) (*AgentActionResponse, error) {
	_ = k
	if err := k.ValidateActionRequest(req); err != nil {
		return nil, err
	}

	rawKind := strings.TrimSpace(req.Action.Kind)
	kind, err := NormalizeActionKind(rawKind)
	if err != nil {
		return nil, err
	}

	var graph *models.TaskGraph
	switch kind {
	case "task_graph.submit":
		graph, err = graphFromActionInput(req.Action.Input)
	case "runtime.command", "runtime.script":
		var task *models.Task
		task, err = runtimeTask(req, kind)
		graph = &models.TaskGraph{Tasks: []*models.Task{task}}
	case "mcp.call":
		var task *models.Task
		task, err = mcpTask(req, kind)
		graph = &models.TaskGraph{Tasks: []*models.Task{task}}
	case "cli.run":
		var task *models.Task
		task, err = cliTask(req, kind)
		graph = &models.TaskGraph{Tasks: []*models.Task{task}}
	default:
		if strings.HasPrefix(kind, "os.") {
			var task *models.Task
			task, err = osTask(req, rawKind, kind)
			graph = &models.TaskGraph{Tasks: []*models.Task{task}}
		} else {
			err = fmt.Errorf("invalid adapter action: unknown action kind %q", rawKind)
		}
	}
	if err != nil {
		return nil, err
	}
	if graph == nil {
		return nil, fmt.Errorf("invalid adapter action: translation produced no task graph")
	}
	if err := graph.Validate(); err != nil {
		return nil, fmt.Errorf("invalid adapter action: %w", err)
	}

	taskIDs := taskIDs(graph)
	return &AgentActionResponse{
		TaskIDs:   taskIDs,
		TaskGraph: graph,
		TranslationTrace: map[string]any{
			"schema_version":  SchemaVersion,
			"adapter":         adapterName(req.Adapter),
			"agent_id":        req.AgentID,
			"session_id":      req.SessionID,
			"action_id":       req.ActionID,
			"source_kind":     rawKind,
			"normalized_kind": kind,
			"task_ids":        taskIDs,
		},
	}, nil
}

// NormalizeActionKind 将成熟 agent 的别名/口语化 kind 映射到稳定的 v1 action 词表。
//
// NormalizeActionKind maps mature-agent aliases onto the stable v1 action vocabulary.
func NormalizeActionKind(kind string) (string, error) {
	k := strings.ToLower(strings.TrimSpace(kind))
	switch k {
	case "":
		return "", fmt.Errorf("invalid adapter action: action.kind is required")
	case "shell", "bash", "terminal.command":
		return "os.shell", nil
	case "file.read", "file.write":
		return "os.file", nil
	case "http.request":
		return "os.http", nil
	case "command":
		return "runtime.command", nil
	case "script":
		return "runtime.script", nil
	case "noop":
		return "os.noop", nil
	case "dns":
		return "os.dns", nil
	case "tcp":
		return "os.tcp", nil
	case "sleep":
		return "os.sleep", nil
	}
	for _, supported := range supportedKinds {
		if k == supported {
			return k, nil
		}
	}
	return "", fmt.Errorf("invalid adapter action: unknown action kind %q", kind)
}

// osTask 将 os.* action 翻译为 ExecGo `type=os` 的任务，并在必要时对输入做兼容归一化。
//
// osTask translates os.* actions into an ExecGo `type=os` task (with compatibility normalization when needed).
func osTask(req AgentActionRequest, rawKind, kind string) (*models.Task, error) {
	input, err := normalizeOSInput(req.Action.Input, rawKind)
	if err != nil {
		return nil, err
	}
	return &models.Task{
		ID:          taskID(req.ActionID),
		Type:        "os",
		ToolName:    strings.TrimPrefix(kind, "os."),
		Input:       input,
		Category:    "os",
		DependsOn:   append([]string{}, req.Action.DependsOn...),
		Retry:       req.Action.Retry,
		Timeout:     req.Action.Timeout,
		Annotations: provenance(req, kind),
	}, nil
}

// runtimeTask 将 runtime.* action 翻译为 ExecGo `type=runtime` 的任务（由 runtime executor 对接 execgo-runtime）。
//
// runtimeTask translates runtime.* actions into an ExecGo `type=runtime` task (handled by the runtime executor).
func runtimeTask(req AgentActionRequest, kind string) (*models.Task, error) {
	payload, taskIDValue, err := runtimePayload(req, kind)
	if err != nil {
		return nil, err
	}
	return &models.Task{
		ID:          taskIDValue,
		Type:        "runtime",
		Input:       payload,
		Category:    "runtime",
		DependsOn:   append([]string{}, req.Action.DependsOn...),
		Retry:       req.Action.Retry,
		Timeout:     req.Action.Timeout,
		Annotations: provenance(req, kind),
	}, nil
}

// mcpTask 将 mcp.call 翻译为 `type=mcp` 的任务；tool_name 可来自 Action.ToolName 或输入体。
//
// mcpTask translates mcp.call into a `type=mcp` task; tool_name may come from Action.ToolName or the input body.
func mcpTask(req AgentActionRequest, kind string) (*models.Task, error) {
	toolName := strings.TrimSpace(req.Action.ToolName)
	if toolName == "" {
		input, err := rawObject(req.Action.Input)
		if err != nil {
			return nil, err
		}
		toolName, _ = input["tool_name"].(string)
	}
	if strings.TrimSpace(toolName) == "" {
		return nil, fmt.Errorf("invalid adapter action: tool_name is required for mcp.call")
	}
	return &models.Task{
		ID:          taskID(req.ActionID),
		Type:        "mcp",
		ToolName:    toolName,
		Input:       cloneRaw(req.Action.Input),
		Category:    "mcp",
		DependsOn:   append([]string{}, req.Action.DependsOn...),
		Retry:       req.Action.Retry,
		Timeout:     req.Action.Timeout,
		Annotations: provenance(req, kind),
	}, nil
}

// cliTask 将 cli.run 翻译为 `type=cli-skills` 的任务。
//
// cliTask translates cli.run into a `type=cli-skills` task.
func cliTask(req AgentActionRequest, kind string) (*models.Task, error) {
	return &models.Task{
		ID:          taskID(req.ActionID),
		Type:        "cli-skills",
		ToolName:    "cli.run",
		Input:       cloneRaw(req.Action.Input),
		Category:    "cli-skills",
		DependsOn:   append([]string{}, req.Action.DependsOn...),
		Retry:       req.Action.Retry,
		Timeout:     req.Action.Timeout,
		Annotations: provenance(req, kind),
	}, nil
}

// runtimePayload 构造 execgo-runtime 提交体，并尽可能兼容两种输入形式：
// - input.execution = {...}（已是 runtime 形状）
// - 扁平字段（program/args 或 script/interpreter），会归一化成 execution
//
// runtimePayload builds the execgo-runtime request payload, supporting both an explicit `execution` object
// and a flat input shape that gets normalized into `execution`.
func runtimePayload(req AgentActionRequest, kind string) (json.RawMessage, string, error) {
	in, err := rawObject(req.Action.Input)
	if err != nil {
		return nil, "", err
	}

	taskIDValue := taskID(req.ActionID)
	if req.ActionID == "" {
		if existing, ok := stringValue(in["task_id"]); ok {
			taskIDValue = existing
		}
	}

	payload := make(map[string]any)
	payload["task_id"] = taskIDValue

	if execution, ok := in["execution"].(map[string]any); ok {
		execution = cloneMap(execution)
		if _, exists := execution["kind"]; !exists {
			execution["kind"] = strings.TrimPrefix(kind, "runtime.")
		}
		payload["execution"] = execution
	} else {
		execution, err := runtimeExecution(in, kind)
		if err != nil {
			return nil, "", err
		}
		payload["execution"] = execution
	}

	for _, key := range []string{"limits", "sandbox", "policy", "control_context"} {
		if v, ok := in[key]; ok {
			payload[key] = v
		}
	}
	metadata := mergeStringMaps(stringMapValue(in["metadata"]), req.Metadata, provenance(req, kind))
	if len(metadata) > 0 {
		payload["metadata"] = metadata
	}

	data, err := json.Marshal(payload)
	if err != nil {
		return nil, "", fmt.Errorf("invalid adapter action: marshal runtime payload: %w", err)
	}
	return data, taskIDValue, nil
}

// runtimeExecution 根据 kind 生成最小可用的 execution 对象（command/script 二选一），并合并 env。
//
// runtimeExecution builds the minimal `execution` object based on kind (command vs script) and merges env.
func runtimeExecution(in map[string]any, kind string) (map[string]any, error) {
	execution := map[string]any{"kind": strings.TrimPrefix(kind, "runtime.")}
	if kind == "runtime.command" {
		program, ok := stringValue(in["program"])
		if !ok {
			return nil, fmt.Errorf("invalid adapter action: input.program is required for runtime.command")
		}
		execution["program"] = program
		if args, ok := stringSliceValue(in["args"]); ok {
			execution["args"] = args
		}
	} else {
		script, ok := stringValue(in["script"])
		if !ok {
			return nil, fmt.Errorf("invalid adapter action: input.script is required for runtime.script")
		}
		execution["script"] = script
		if interpreter, ok := stringSliceValue(in["interpreter"]); ok {
			execution["interpreter"] = interpreter
		}
	}
	if env := stringMapValue(in["env"]); len(env) > 0 {
		execution["env"] = env
	}
	return execution, nil
}

// graphFromActionInput 从 action.input 解析 TaskGraph；支持两种形式：
// - {"task_graph": {...}}
// - {"tasks": [...]}
//
// graphFromActionInput parses a TaskGraph from action.input, supporting either `task_graph` or `tasks`.
func graphFromActionInput(raw json.RawMessage) (*models.TaskGraph, error) {
	if len(raw) == 0 {
		return nil, fmt.Errorf("invalid adapter action: input is required for task_graph.submit")
	}
	var env struct {
		TaskGraph *models.TaskGraph `json:"task_graph,omitempty"`
		Tasks     []*models.Task    `json:"tasks,omitempty"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return nil, fmt.Errorf("invalid adapter action: parse task graph input: %w", err)
	}
	if env.TaskGraph != nil {
		return env.TaskGraph, nil
	}
	if env.Tasks != nil {
		return &models.TaskGraph{Tasks: env.Tasks}, nil
	}
	return nil, fmt.Errorf("invalid adapter action: input must contain tasks or task_graph")
}

// normalizeOSInput 为部分历史 alias 做输入归一化（例如 file.read / file.write 自动补 action 字段）。
//
// normalizeOSInput performs compatibility normalization for some legacy aliases (e.g. file.read/file.write).
func normalizeOSInput(raw json.RawMessage, rawKind string) (json.RawMessage, error) {
	input := cloneRaw(raw)
	switch strings.ToLower(strings.TrimSpace(rawKind)) {
	case "file.read":
		return inputWithDefaultAction(input, "read")
	case "file.write":
		return inputWithDefaultAction(input, "write")
	default:
		return input, nil
	}
}

// inputWithDefaultAction 当缺少 action 字段时补默认值（主要用于 os.file 的 read/write 别名）。
//
// inputWithDefaultAction injects a default `action` when missing (primarily for os.file read/write aliases).
func inputWithDefaultAction(raw json.RawMessage, action string) (json.RawMessage, error) {
	obj, err := rawObject(raw)
	if err != nil {
		return nil, err
	}
	if _, ok := obj["action"]; !ok {
		obj["action"] = action
	}
	data, err := json.Marshal(obj)
	if err != nil {
		return nil, fmt.Errorf("invalid adapter action: marshal file input: %w", err)
	}
	return data, nil
}

// rawObject 将 input 解析为 JSON object；空 input 会返回空 map。
//
// rawObject parses the raw input into a JSON object; an empty input yields an empty map.
func rawObject(raw json.RawMessage) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var obj map[string]any
	if err := json.Unmarshal(raw, &obj); err != nil {
		return nil, fmt.Errorf("invalid adapter action: input must be a JSON object: %w", err)
	}
	if obj == nil {
		return map[string]any{}, nil
	}
	return obj, nil
}

// taskID 选择任务 ID：优先使用 action_id，否则生成一个可读的时间戳派生 ID。
//
// taskID picks the task ID: use action_id when present, otherwise generate a timestamp-derived ID.
func taskID(id string) string {
	id = strings.TrimSpace(id)
	if id != "" {
		return id
	}
	return fmt.Sprintf("adapter-%d", time.Now().UnixNano())
}

// taskIDs 收集 graph 中所有任务的 ID（保持原顺序）。
//
// taskIDs collects all task IDs in the graph (preserving order).
func taskIDs(graph *models.TaskGraph) []string {
	out := make([]string, 0, len(graph.Tasks))
	for _, task := range graph.Tasks {
		out = append(out, task.ID)
	}
	return out
}

// provenance 生成可追溯的 annotations/metadata：schema 版本、adapter profile、action kind 与可选的 agent/session/action 标识。
//
// provenance builds traceable annotations/metadata: schema version, adapter profile, action kind,
// and optional agent/session/action identifiers.
func provenance(req AgentActionRequest, kind string) map[string]string {
	out := mergeStringMaps(req.Metadata, map[string]string{
		"adapter_schema": SchemaVersion,
		"adapter":        adapterName(req.Adapter),
		"action_kind":    kind,
	})
	if strings.TrimSpace(req.AgentID) != "" {
		out["agent_id"] = strings.TrimSpace(req.AgentID)
	}
	if strings.TrimSpace(req.SessionID) != "" {
		out["session_id"] = strings.TrimSpace(req.SessionID)
	}
	if strings.TrimSpace(req.ActionID) != "" {
		out["action_id"] = strings.TrimSpace(req.ActionID)
	}
	return out
}

// adapterName 规范化 adapter profile 名称；空值回退为 generic。
//
// adapterName normalizes the adapter profile name; empty falls back to "generic".
func adapterName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return "generic"
	}
	return name
}

// cloneRaw 复制一份 RawMessage，避免调用方复用同一底层 slice 时产生意外修改。
//
// cloneRaw copies a RawMessage to avoid accidental mutation through shared backing slices.
func cloneRaw(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	out := make([]byte, len(raw))
	copy(out, raw)
	return out
}

// cloneMap 浅拷贝 map，用于在补默认字段前避免就地修改输入对象。
//
// cloneMap shallow-copies a map to avoid in-place mutation when adding defaults.
func cloneMap(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

// mergeStringMaps 合并多个 string map；会 trim key/value，并忽略空 key 或空 value。
//
// mergeStringMaps merges multiple string maps; trims key/value and drops empty keys/values.
func mergeStringMaps(items ...map[string]string) map[string]string {
	out := make(map[string]string)
	for _, item := range items {
		for k, v := range item {
			k = strings.TrimSpace(k)
			v = strings.TrimSpace(v)
			if k != "" && v != "" {
				out[k] = v
			}
		}
	}
	return out
}

// stringValue 从 any 中提取非空字符串（会 trim）。
//
// stringValue extracts a non-empty string from any (with trimming).
func stringValue(v any) (string, bool) {
	s, ok := v.(string)
	s = strings.TrimSpace(s)
	return s, ok && s != ""
}

// stringSliceValue 将 []any 解析为 []string（所有元素必须为 string）。
//
// stringSliceValue parses a []any into a []string (all elements must be strings).
func stringSliceValue(v any) ([]string, bool) {
	raw, ok := v.([]any)
	if !ok {
		return nil, false
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		s, ok := item.(string)
		if !ok {
			return nil, false
		}
		out = append(out, s)
	}
	return out, true
}

// stringMapValue 将 map[string]any 转换为 map[string]string（仅保留 string 值）。
//
// stringMapValue converts map[string]any into map[string]string (keeping only string values).
func stringMapValue(v any) map[string]string {
	raw, ok := v.(map[string]any)
	if !ok {
		return nil
	}
	out := make(map[string]string, len(raw))
	for k, item := range raw {
		if s, ok := item.(string); ok {
			out[k] = s
		}
	}
	return out
}
