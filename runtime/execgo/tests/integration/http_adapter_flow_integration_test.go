// HTTP adapter integration tests / HTTP adapter 集成测试。
package integration_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/tests/testutil"
)

func TestAdapterHTTPFlow_CapabilitiesAndTools(t *testing.T) {
	executor.RegisterBuiltins()
	rt := testutil.NewRuntime(t, 2)
	srv := testutil.NewHTTPServer(t, rt)
	client := srv.Client()

	capResp, err := client.Get(srv.URL + "/adapters/capabilities")
	if err != nil {
		t.Fatalf("GET /adapters/capabilities error: %v", err)
	}
	if capResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /adapters/capabilities status=%d", capResp.StatusCode)
	}
	var caps struct {
		Profiles []string `json:"profiles"`
	}
	if err := json.NewDecoder(capResp.Body).Decode(&caps); err != nil {
		t.Fatalf("decode capabilities: %v", err)
	}
	_ = capResp.Body.Close()
	for _, profile := range []string{"generic", "claudecode", "codex", "openclaw"} {
		if !containsString(caps.Profiles, profile) {
			t.Fatalf("missing profile %q in %#v", profile, caps.Profiles)
		}
	}

	toolsResp, err := client.Get(srv.URL + "/adapters/tools")
	if err != nil {
		t.Fatalf("GET /adapters/tools error: %v", err)
	}
	if toolsResp.StatusCode != http.StatusOK {
		t.Fatalf("GET /adapters/tools status=%d", toolsResp.StatusCode)
	}
	var manifest struct {
		Tools []struct {
			Name string `json:"name"`
		} `json:"tools"`
	}
	if err := json.NewDecoder(toolsResp.Body).Decode(&manifest); err != nil {
		t.Fatalf("decode tools: %v", err)
	}
	_ = toolsResp.Body.Close()
	names := make([]string, 0, len(manifest.Tools))
	for _, tool := range manifest.Tools {
		names = append(names, tool.Name)
	}
	for _, name := range []string{"execgo.os.shell", "execgo.os.file", "execgo.runtime.command", "execgo.task_graph.submit"} {
		if !containsString(names, name) {
			t.Fatalf("missing tool %q in %#v", name, names)
		}
	}
}

func TestAdapterHTTPFlow_TranslateDoesNotSubmit(t *testing.T) {
	executor.RegisterBuiltins()
	rt := testutil.NewRuntime(t, 2)
	srv := testutil.NewHTTPServer(t, rt)
	client := srv.Client()

	body := []byte(`{
		"adapter":"codex",
		"action_id":"translate-only",
		"action":{"kind":"os.noop","input":{"message":"hi"}}
	}`)
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/adapters/translate", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("POST /adapters/translate error: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /adapters/translate status=%d", resp.StatusCode)
	}
	var translated struct {
		TaskIDs   []string `json:"task_ids"`
		TaskGraph struct {
			Tasks []models.Task `json:"tasks"`
		} `json:"task_graph"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&translated); err != nil {
		t.Fatalf("decode translate response: %v", err)
	}
	_ = resp.Body.Close()
	if len(translated.TaskIDs) != 1 || translated.TaskIDs[0] != "translate-only" {
		t.Fatalf("unexpected task ids: %#v", translated.TaskIDs)
	}
	if len(translated.TaskGraph.Tasks) != 1 || translated.TaskGraph.Tasks[0].Status != "" {
		t.Fatalf("expected untranslated task state to remain empty: %#v", translated.TaskGraph.Tasks)
	}

	getResp, err := client.Get(srv.URL + "/tasks/translate-only")
	if err != nil {
		t.Fatalf("GET translated task error: %v", err)
	}
	defer getResp.Body.Close()
	if getResp.StatusCode != http.StatusNotFound {
		t.Fatalf("translated task was submitted; status=%d", getResp.StatusCode)
	}
}

func TestAdapterHTTPFlow_ActionSubmitThenPoll(t *testing.T) {
	executor.RegisterBuiltins()
	rt := testutil.NewRuntime(t, 2)
	srv := testutil.NewHTTPServer(t, rt)
	client := srv.Client()

	body := []byte(`{
		"adapter":"claudecode",
		"agent_id":"agent-1",
		"action_id":"adapter-noop",
		"action":{"kind":"os.noop","input":{"message":"hello adapter"}}
	}`)
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/adapters/actions", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("POST /adapters/actions error: %v", err)
	}
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("POST /adapters/actions status=%d", resp.StatusCode)
	}
	var accepted struct {
		Accepted int      `json:"accepted"`
		TaskIDs  []string `json:"task_ids"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&accepted); err != nil {
		t.Fatalf("decode adapter action response: %v", err)
	}
	_ = resp.Body.Close()
	if accepted.Accepted != 1 || len(accepted.TaskIDs) != 1 || accepted.TaskIDs[0] != "adapter-noop" {
		t.Fatalf("unexpected accepted response: %#v", accepted)
	}

	task := pollTaskByHTTP(t, client, srv.URL, "adapter-noop", 5*time.Second)
	if task.Status != models.StatusSuccess {
		t.Fatalf("task status=%s error=%s", task.Status, task.Error)
	}
	if task.Annotations["adapter"] != "claudecode" || task.Annotations["agent_id"] != "agent-1" {
		t.Fatalf("unexpected annotations: %#v", task.Annotations)
	}
}

func TestAdapterHTTPFlow_InvalidActionKind(t *testing.T) {
	executor.RegisterBuiltins()
	rt := testutil.NewRuntime(t, 2)
	srv := testutil.NewHTTPServer(t, rt)

	body := []byte(`{"action":{"kind":"not.real"}}`)
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/adapters/actions", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("POST /adapters/actions error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d want=%d", resp.StatusCode, http.StatusBadRequest)
	}
	var er models.ErrorResponse
	if err := json.NewDecoder(resp.Body).Decode(&er); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if !strings.Contains(er.Error, "unknown action kind") {
		t.Fatalf("error=%q", er.Error)
	}
}

func TestAdapterHTTPFlow_InvalidActionInputSchema(t *testing.T) {
	executor.RegisterBuiltins()
	rt := testutil.NewRuntime(t, 2)
	srv := testutil.NewHTTPServer(t, rt)

	body := []byte(`{
		"adapter":"codex",
		"action_id":"bad-file-write",
		"action":{"kind":"os.file","input":{"action":"write","path":"/tmp/out.txt"}}
	}`)
	req, err := http.NewRequest(http.MethodPost, srv.URL+"/adapters/actions", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := srv.Client().Do(req)
	if err != nil {
		t.Fatalf("POST /adapters/actions error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status=%d want=%d", resp.StatusCode, http.StatusBadRequest)
	}
	var er models.ErrorResponse
	if err := json.NewDecoder(resp.Body).Decode(&er); err != nil {
		t.Fatalf("decode error response: %v", err)
	}
	if !strings.Contains(er.Error, "content is required") {
		t.Fatalf("error=%q", er.Error)
	}
	if _, ok := rt.Store.Get("bad-file-write"); ok {
		t.Fatal("invalid adapter action should not be submitted")
	}
}

func containsString(items []string, want string) bool {
	for _, item := range items {
		if item == want {
			return true
		}
	}
	return false
}
