// HTTP error path integration tests / HTTP 错误路径集成测试。
// Author: iammm0; Last edited: 2026-04-23
package integration_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/iammm0/execgo/pkg/executor"
	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/tests/testutil"
)

// TestHTTPTaskFlow_ErrorBranches verifies HTTP error branches / 验证 HTTP 错误分支。
func TestHTTPTaskFlow_ErrorBranches(t *testing.T) {
	executor.RegisterBuiltins()
	rt := testutil.NewRuntime(t, 2)
	srv := testutil.NewHTTPServer(t, rt)
	client := srv.Client()

	cases := []struct {
		name       string
		method     string
		path       string
		body       string
		wantStatus int
		wantSubstr string
	}{
		{
			name:       "invalid JSON body",
			method:     http.MethodPost,
			path:       "/tasks",
			body:       `{"tasks":[`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "invalid JSON",
		},
		{
			name:       "task graph validation error",
			method:     http.MethodPost,
			path:       "/tasks",
			body:       `{"tasks":[{"id":"missing-type"}]}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "type is required",
		},
		{
			name:       "unknown task type",
			method:     http.MethodPost,
			path:       "/tasks",
			body:       `{"tasks":[{"id":"a","type":"not-registered"}]}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "unknown task type",
		},
		{
			name:       "get missing task",
			method:     http.MethodGet,
			path:       "/tasks/not-exist",
			wantStatus: http.StatusNotFound,
			wantSubstr: "task not found",
		},
		{
			name:       "delete missing task",
			method:     http.MethodDelete,
			path:       "/tasks/not-exist",
			wantStatus: http.StatusNotFound,
			wantSubstr: "task not found",
		},
		{
			name:       "poll missing mcp handle",
			method:     http.MethodGet,
			path:       "/mcp/tasks/not-exist",
			wantStatus: http.StatusNotFound,
			wantSubstr: "handle not found",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req, err := http.NewRequest(tc.method, srv.URL+tc.path, bytes.NewBufferString(tc.body))
			if err != nil {
				t.Fatalf("new request: %v", err)
			}
			if tc.body != "" {
				req.Header.Set("Content-Type", "application/json")
			}

			resp, err := client.Do(req)
			if err != nil {
				t.Fatalf("do request: %v", err)
			}
			defer resp.Body.Close()

			if resp.StatusCode != tc.wantStatus {
				t.Fatalf("status=%d want=%d", resp.StatusCode, tc.wantStatus)
			}

			var er models.ErrorResponse
			if err := json.NewDecoder(resp.Body).Decode(&er); err != nil {
				t.Fatalf("decode error response: %v", err)
			}
			if !strings.Contains(er.Error, tc.wantSubstr) {
				t.Fatalf("error=%q does not contain %q", er.Error, tc.wantSubstr)
			}
		})
	}
}

// TestHealthEndpoint_ReturnsReleasedVersion verifies health version reporting / 验证 health 返回版本号。
func TestHealthEndpoint_ReturnsReleasedVersion(t *testing.T) {
	executor.RegisterBuiltins()
	rt := testutil.NewRuntime(t, 1)
	srv := testutil.NewHTTPServer(t, rt)

	resp, err := srv.Client().Get(srv.URL + "/health")
	if err != nil {
		t.Fatalf("GET /health: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status=%d want=%d", resp.StatusCode, http.StatusOK)
	}

	var health models.HealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		t.Fatalf("decode health response: %v", err)
	}
	if health.Version != "v1.1.0" {
		t.Fatalf("version=%q want=%q", health.Version, "v1.1.0")
	}
}
