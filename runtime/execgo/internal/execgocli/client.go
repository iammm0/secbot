package execgocli

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// Client 是对 ExecGo HTTP 面的薄封装 / thin HTTP client.
type Client struct {
	BaseURL    string
	HTTP       *http.Client
	UserAgent  string
	Require2xx bool // 若 true，非 2xx 返回 error
}

// NewClient 使用给定基址与可选 Transport / creates client.
func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL:    baseURL,
		HTTP:       &http.Client{Timeout: 60 * time.Second},
		UserAgent:  "execgocli/1.0",
		Require2xx: true,
	}
}

func (c *Client) get(ctx context.Context, path string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.BaseURL+path, nil)
	if err != nil {
		return nil, 0, err
	}
	if c.UserAgent != "" {
		req.Header.Set("User-Agent", c.UserAgent)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, err := ReadAllLimit(resp.Body, 4<<20)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if c.Require2xx && (resp.StatusCode < 200 || resp.StatusCode > 299) {
		return b, resp.StatusCode, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return b, resp.StatusCode, nil
}

func (c *Client) post(ctx context.Context, path string, body []byte) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.UserAgent != "" {
		req.Header.Set("User-Agent", c.UserAgent)
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	b, err := ReadAllLimit(resp.Body, 4<<20)
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if c.Require2xx && (resp.StatusCode < 200 || resp.StatusCode > 299) {
		return b, resp.StatusCode, fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return b, resp.StatusCode, nil
}

// JSONDecode 将 JSON 解到 map 以保留未建模字段 / decode into map for extra fields.
func JSONDecode(b []byte) (map[string]any, error) {
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		return nil, err
	}
	return m, nil
}

// GetCapabilities 调用 GET /adapters/capabilities.
func (c *Client) GetCapabilities(ctx context.Context) (map[string]any, []byte, int, error) {
	b, code, err := c.get(ctx, "/adapters/capabilities")
	if err != nil {
		return nil, b, code, err
	}
	m, jerr := JSONDecode(b)
	return m, b, code, jerr
}

// GetTools 调用 GET /adapters/tools.
func (c *Client) GetTools(ctx context.Context) (map[string]any, []byte, int, error) {
	b, code, err := c.get(ctx, "/adapters/tools")
	if err != nil {
		return nil, b, code, err
	}
	m, jerr := JSONDecode(b)
	return m, b, code, jerr
}

// PostTranslate 调用 POST /adapters/translate.
func (c *Client) PostTranslate(ctx context.Context, body []byte) (map[string]any, []byte, int, error) {
	b, code, err := c.post(ctx, "/adapters/translate", body)
	if err != nil {
		return nil, b, code, err
	}
	m, jerr := JSONDecode(b)
	return m, b, code, jerr
}

// PostActions 调用 POST /adapters/actions.
func (c *Client) PostActions(ctx context.Context, body []byte) (map[string]any, []byte, int, error) {
	b, code, err := c.post(ctx, "/adapters/actions", body)
	if err != nil {
		return nil, b, code, err
	}
	m, jerr := JSONDecode(b)
	return m, b, code, jerr
}

// PostTasks 调用 POST /tasks（模式 B）/ mode B TaskGraph submit.
func (c *Client) PostTasks(ctx context.Context, body []byte) (map[string]any, []byte, int, error) {
	b, code, err := c.post(ctx, "/tasks", body)
	if err != nil {
		return nil, b, code, err
	}
	m, jerr := JSONDecode(b)
	return m, b, code, jerr
}

// GetTask 调用 GET /tasks/{id}
func (c *Client) GetTask(ctx context.Context, id string) (map[string]any, []byte, int, error) {
	b, code, err := c.get(ctx, "/tasks/"+id)
	if err != nil {
		return nil, b, code, err
	}
	m, jerr := JSONDecode(b)
	return m, b, code, jerr
}

// PostCancelTask 调用 POST /tasks/{id}/cancel / calls POST /tasks/{id}/cancel.
func (c *Client) PostCancelTask(ctx context.Context, id string) (map[string]any, []byte, int, error) {
	b, code, err := c.post(ctx, "/tasks/"+id+"/cancel", nil)
	if err != nil {
		return nil, b, code, err
	}
	m, jerr := JSONDecode(b)
	return m, b, code, jerr
}

// GetHealth 调用 GET /health
func (c *Client) GetHealth(ctx context.Context) (map[string]any, []byte, int, error) {
	b, code, err := c.get(ctx, "/health")
	if err != nil {
		return nil, b, code, err
	}
	m, jerr := JSONDecode(b)
	return m, b, code, jerr
}

// ProbeGET 对任意绝对 URL 做 GET，不限 2xx / probes URL without 2xx requirement.
func ProbeGET(ctx context.Context, client *http.Client, url string) (string, int, error) {
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", 0, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	b, _ := ReadAllLimit(resp.Body, 64<<10)
	return string(b), resp.StatusCode, nil
}

// ReadInput 从 path 或 stdin 读 JSON / read JSON from -file or stdin.
func ReadInput(filePath string, stdin io.Reader) ([]byte, error) {
	if filePath != "" {
		return os.ReadFile(filePath)
	}
	return io.ReadAll(stdin)
}
