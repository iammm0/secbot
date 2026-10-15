package unit_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/iammm0/execgo/pkg/adapter"
)

func TestTranslateShellAliasToOSTask(t *testing.T) {
	kernel := adapter.NewAdapterKernel()
	resp, err := kernel.Translate(adapter.AgentActionRequest{
		Adapter:  "codex",
		AgentID:  "agent-1",
		ActionID: "list-files",
		Action: adapter.AgentAction{
			Kind:  "shell",
			Input: json.RawMessage(`{"command":"ls","args":["-la"]}`),
		},
	})
	if err != nil {
		t.Fatalf("Translate error: %v", err)
	}
	if len(resp.TaskGraph.Tasks) != 1 {
		t.Fatalf("task count=%d want=1", len(resp.TaskGraph.Tasks))
	}
	task := resp.TaskGraph.Tasks[0]
	if task.ID != "list-files" {
		t.Fatalf("id=%q want=list-files", task.ID)
	}
	if task.Type != "os" || task.ToolName != "shell" || task.Category != "os" {
		t.Fatalf("unexpected task routing: type=%q tool=%q category=%q", task.Type, task.ToolName, task.Category)
	}
	if task.Annotations["adapter"] != "codex" || task.Annotations["agent_id"] != "agent-1" {
		t.Fatalf("unexpected annotations: %#v", task.Annotations)
	}
}

func TestTranslateRuntimeCommand(t *testing.T) {
	kernel := adapter.NewAdapterKernel()
	resp, err := kernel.Translate(adapter.AgentActionRequest{
		Adapter:   "codex",
		AgentID:   "agent-1",
		SessionID: "session-1",
		ActionID:  "build-test",
		Action: adapter.AgentAction{
			Kind: "runtime.command",
			Input: json.RawMessage(`{
				"program":"go",
				"args":["test","./..."],
				"limits":{"wall_time_ms":300000,"memory_bytes":1073741824},
				"sandbox":{"profile":"process"},
				"control_context":{"tenant":"default","owner":"agent-1","requires_resource_reservation":true}
			}`),
			Retry:   1,
			Timeout: 300000,
		},
	})
	if err != nil {
		t.Fatalf("Translate error: %v", err)
	}
	task := resp.TaskGraph.Tasks[0]
	if task.Type != "runtime" {
		t.Fatalf("type=%q want=runtime", task.Type)
	}
	if task.Retry != 1 || task.Timeout != 300000 {
		t.Fatalf("retry/timeout=%d/%d", task.Retry, task.Timeout)
	}

	var payload map[string]any
	if err := json.Unmarshal(task.Input, &payload); err != nil {
		t.Fatalf("unmarshal runtime input: %v", err)
	}
	execution := payload["execution"].(map[string]any)
	if execution["kind"] != "command" || execution["program"] != "go" {
		t.Fatalf("unexpected execution: %#v", execution)
	}
	if payload["task_id"] != "build-test" {
		t.Fatalf("task_id=%v want build-test", payload["task_id"])
	}
	if _, ok := payload["limits"].(map[string]any); !ok {
		t.Fatalf("expected limits in payload: %#v", payload)
	}
	if _, ok := payload["sandbox"].(map[string]any); !ok {
		t.Fatalf("expected sandbox in payload: %#v", payload)
	}
	cc := payload["control_context"].(map[string]any)
	if cc["tenant"] != "default" || cc["owner"] != "agent-1" {
		t.Fatalf("unexpected control_context: %#v", cc)
	}
	metadata := payload["metadata"].(map[string]any)
	if metadata["adapter"] != "codex" || metadata["agent_id"] != "agent-1" || metadata["action_id"] != "build-test" {
		t.Fatalf("unexpected metadata: %#v", metadata)
	}
}

func TestTranslateTaskGraphSubmitPassThrough(t *testing.T) {
	kernel := adapter.NewAdapterKernel()
	resp, err := kernel.Translate(adapter.AgentActionRequest{
		Action: adapter.AgentAction{
			Kind:  "task_graph.submit",
			Input: json.RawMessage(`{"tasks":[{"id":"direct","type":"noop","params":{"message":"hi"}}]}`),
		},
	})
	if err != nil {
		t.Fatalf("Translate error: %v", err)
	}
	task := resp.TaskGraph.Tasks[0]
	if task.ID != "direct" || task.Type != "noop" {
		t.Fatalf("unexpected passthrough task: %#v", task)
	}
	if task.Annotations != nil {
		t.Fatalf("expected passthrough graph to remain unannotated, got %#v", task.Annotations)
	}
}

func TestTranslateUnknownKind(t *testing.T) {
	kernel := adapter.NewAdapterKernel()
	_, err := kernel.Translate(adapter.AgentActionRequest{Action: adapter.AgentAction{Kind: "not.real"}})
	if err == nil {
		t.Fatal("expected error")
	}
	if !strings.Contains(err.Error(), "unknown action kind") {
		t.Fatalf("error=%q", err.Error())
	}
}

func TestTranslateGeneratesTaskID(t *testing.T) {
	kernel := adapter.NewAdapterKernel()
	resp, err := kernel.Translate(adapter.AgentActionRequest{
		Action: adapter.AgentAction{
			Kind:  "os.noop",
			Input: json.RawMessage(`{"message":"hi"}`),
		},
	})
	if err != nil {
		t.Fatalf("Translate error: %v", err)
	}
	if resp.TaskGraph.Tasks[0].ID == "" {
		t.Fatal("expected generated task id")
	}
	if resp.TaskGraph.Tasks[0].ID != resp.TaskIDs[0] {
		t.Fatalf("response task id mismatch: %#v", resp.TaskIDs)
	}
}

func TestToolManifestExposesMachineReadableInputSchemas(t *testing.T) {
	kernel := adapter.NewAdapterKernel()
	manifest := kernel.ToolManifest()

	tools := make(map[string]adapter.AgentToolSpec, len(manifest.Tools))
	for _, tool := range manifest.Tools {
		tools[tool.ActionKind] = tool
	}

	shell := requiredTool(t, tools, "os.shell").InputSchema
	shellProps := schemaProperties(t, shell)
	if _, ok := shellProps["command"]; !ok {
		t.Fatalf("os.shell schema missing command property: %#v", shellProps)
	}
	if _, ok := shellProps["script"]; !ok {
		t.Fatalf("os.shell schema missing script property: %#v", shellProps)
	}
	if len(schemaArray(t, shell, "oneOf")) != 2 {
		t.Fatalf("os.shell schema should describe command/script alternatives: %#v", shell)
	}

	file := requiredTool(t, tools, "os.file").InputSchema
	fileProps := schemaProperties(t, file)
	action := schemaObject(t, fileProps["action"])
	if !containsAny(enumValues(t, action), "read", "write", "append", "delete", "stat") {
		t.Fatalf("os.file action enum incomplete: %#v", action["enum"])
	}
	if !containsAny(requiredValues(t, file), "action", "path") {
		t.Fatalf("os.file schema should require action and path: %#v", file["required"])
	}
	if len(schemaArray(t, file, "allOf")) == 0 {
		t.Fatalf("os.file schema should describe content requirement for write/append: %#v", file)
	}

	runtimeCommand := requiredTool(t, tools, "runtime.command").InputSchema
	runtimeProps := schemaProperties(t, runtimeCommand)
	if _, ok := runtimeProps["program"]; !ok {
		t.Fatalf("runtime.command schema missing flat program property: %#v", runtimeProps)
	}
	if _, ok := runtimeProps["execution"]; !ok {
		t.Fatalf("runtime.command schema missing execution property: %#v", runtimeProps)
	}
	if len(schemaArray(t, runtimeCommand, "oneOf")) != 2 {
		t.Fatalf("runtime.command schema should describe program/execution alternatives: %#v", runtimeCommand)
	}

	taskGraph := requiredTool(t, tools, "task_graph.submit").InputSchema
	taskGraphProps := schemaProperties(t, taskGraph)
	if _, ok := taskGraphProps["tasks"]; !ok {
		t.Fatalf("task_graph.submit schema missing tasks property: %#v", taskGraphProps)
	}
	if _, ok := taskGraphProps["task_graph"]; !ok {
		t.Fatalf("task_graph.submit schema missing task_graph property: %#v", taskGraphProps)
	}
}

func TestValidateActionRequestUsesToolInputSchema(t *testing.T) {
	kernel := adapter.NewAdapterKernel()

	cases := []struct {
		name    string
		req     adapter.AgentActionRequest
		wantErr string
	}{
		{
			name: "file write requires content",
			req: adapter.AgentActionRequest{Action: adapter.AgentAction{
				Kind:  "os.file",
				Input: json.RawMessage(`{"action":"write","path":"/tmp/out.txt"}`),
			}},
			wantErr: "content is required",
		},
		{
			name: "file rejects unknown action enum",
			req: adapter.AgentActionRequest{Action: adapter.AgentAction{
				Kind:  "os.file",
				Input: json.RawMessage(`{"action":"copy","path":"/tmp/out.txt"}`),
			}},
			wantErr: "must be one of",
		},
		{
			name: "shell requires command or script",
			req: adapter.AgentActionRequest{Action: adapter.AgentAction{
				Kind:  "os.shell",
				Input: json.RawMessage(`{"args":["-la"]}`),
			}},
			wantErr: "command is required",
		},
		{
			name: "shell rejects extra property",
			req: adapter.AgentActionRequest{Action: adapter.AgentAction{
				Kind:  "os.shell",
				Input: json.RawMessage(`{"command":"pwd","unexpected":true}`),
			}},
			wantErr: "unexpected is not allowed",
		},
		{
			name: "runtime command requires program or execution",
			req: adapter.AgentActionRequest{Action: adapter.AgentAction{
				Kind:  "runtime.command",
				Input: json.RawMessage(`{"args":["test","./..."]}`),
			}},
			wantErr: "program is required",
		},
		{
			name: "sleep duration must be integer",
			req: adapter.AgentActionRequest{Action: adapter.AgentAction{
				Kind:  "os.sleep",
				Input: json.RawMessage(`{"duration_ms":1.5}`),
			}},
			wantErr: "duration_ms must be integer",
		},
		{
			name: "valid file write",
			req: adapter.AgentActionRequest{Action: adapter.AgentAction{
				Kind:  "os.file",
				Input: json.RawMessage(`{"action":"write","path":"/tmp/out.txt","content":"ok"}`),
			}},
		},
		{
			name: "valid file read alias gets default action",
			req: adapter.AgentActionRequest{Action: adapter.AgentAction{
				Kind:  "file.read",
				Input: json.RawMessage(`{"path":"/tmp/out.txt"}`),
			}},
		},
		{
			name: "valid task graph submit",
			req: adapter.AgentActionRequest{Action: adapter.AgentAction{
				Kind:  "task_graph.submit",
				Input: json.RawMessage(`{"tasks":[{"id":"t1","type":"noop","params":{"message":"hi"}}]}`),
			}},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := kernel.ValidateActionRequest(tc.req)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("ValidateActionRequest error: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatal("expected validation error")
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("error=%q want substring %q", err.Error(), tc.wantErr)
			}
		})
	}
}

func requiredTool(t *testing.T, tools map[string]adapter.AgentToolSpec, kind string) adapter.AgentToolSpec {
	t.Helper()
	tool, ok := tools[kind]
	if !ok {
		t.Fatalf("missing tool kind %q in manifest", kind)
	}
	if tool.InputSchema["type"] != "object" {
		t.Fatalf("%s input schema type=%v want object", kind, tool.InputSchema["type"])
	}
	return tool
}

func schemaProperties(t *testing.T, schema map[string]any) map[string]any {
	t.Helper()
	return schemaObject(t, schema["properties"])
}

func schemaObject(t *testing.T, value any) map[string]any {
	t.Helper()
	obj, ok := value.(map[string]any)
	if !ok {
		t.Fatalf("schema value is %T, want map[string]any: %#v", value, value)
	}
	return obj
}

func schemaArray(t *testing.T, schema map[string]any, key string) []any {
	t.Helper()
	values, ok := schema[key].([]any)
	if !ok {
		t.Fatalf("schema[%q] is %T, want []any: %#v", key, schema[key], schema[key])
	}
	return values
}

func enumValues(t *testing.T, schema map[string]any) []string {
	t.Helper()
	values, ok := schema["enum"].([]string)
	if !ok {
		t.Fatalf("schema enum is %T, want []string: %#v", schema["enum"], schema["enum"])
	}
	return values
}

func requiredValues(t *testing.T, schema map[string]any) []string {
	t.Helper()
	values, ok := schema["required"].([]string)
	if !ok {
		t.Fatalf("schema required is %T, want []string: %#v", schema["required"], schema["required"])
	}
	return values
}

func containsAny(values []string, wants ...string) bool {
	seen := make(map[string]bool, len(values))
	for _, value := range values {
		seen[value] = true
	}
	for _, want := range wants {
		if !seen[want] {
			return false
		}
	}
	return true
}
