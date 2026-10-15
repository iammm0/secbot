# Go (HTTP) Integration Example

This example uses Go to integrate with ExecGo's HTTP API:

1. `POST /tasks` to submit a `TaskGraph`
2. read returned `task_ids`
3. poll `GET /tasks/{id}` until each task reaches `success/failed/skipped`

To keep it truly runnable without external dependencies, the example uses the built-in `noop` executor (no external I/O).

## Minimal runnable client

```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

type Task struct {
	ID        string                 `json:"id"`
	Type      string                 `json:"type"`
	Params    map[string]any        `json:"params,omitempty"`
	DependsOn []string              `json:"depends_on,omitempty"`
	Retry     int                    `json:"retry,omitempty"`
	Timeout   int64                  `json:"timeout,omitempty"` // milliseconds
}

type TaskGraph struct {
	Tasks []Task `json:"tasks"`
}

type SubmitResponse struct {
	Accepted int      `json:"accepted"`
	TaskIDs  []string `json:"task_ids"`
}

type TaskState struct {
	ID     string           `json:"id"`
	Status string           `json:"status"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  string           `json:"error,omitempty"`
}

func main() {
	baseURL := "http://localhost:8080"
	if v := os.Getenv("EXECGO_URL"); v != "" {
		baseURL = v
	}

	graph := TaskGraph{
		Tasks: []Task{
			{
				ID:      "t1",
				Type:    "noop",
				Params:  map[string]any{"message": "hello"},
				Retry:   0,
				Timeout: 0,
			},
			{
				ID:        "t2",
				Type:      "noop",
				Params:    map[string]any{"message": "after t1"},
				DependsOn: []string{"t1"},
				Retry:     0,
				Timeout:   0,
			},
		},
	}

	// 1) submit
	reqBody, _ := json.Marshal(graph)
	resp, err := http.Post(baseURL+"/tasks", "application/json", bytes.NewReader(reqBody))
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusAccepted {
		panic(fmt.Sprintf("submit failed: status=%d body=%s", resp.StatusCode, string(body)))
	}

	var submit SubmitResponse
	if err := json.Unmarshal(body, &submit); err != nil {
		panic(err)
	}
	fmt.Println("accepted task_ids:", submit.TaskIDs)

	// 2) poll
	for _, id := range submit.TaskIDs {
		pollTask(baseURL, id)
	}
}

func pollTask(baseURL, id string) {
	interval := 500 * time.Millisecond
	maxInterval := 5 * time.Second

	for {
		resp, err := http.Get(baseURL + "/tasks/" + id)
		if err != nil {
			fmt.Println("poll error:", err)
			time.Sleep(interval)
			continue
		}

		b, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		var st TaskState
		if err := json.Unmarshal(b, &st); err != nil {
			fmt.Println("decode error:", err, "raw:", string(b))
			time.Sleep(interval)
			continue
		}

		switch st.Status {
		case "success":
			var result map[string]any
			_ = json.Unmarshal(st.Result, &result)
			fmt.Printf("task %s success: %v\n", id, result)
			return
		case "failed":
			fmt.Printf("task %s failed: %s\n", id, st.Error)
			return
		case "skipped":
			fmt.Printf("task %s skipped: %s\n", id, st.Error)
			return
		default:
			// pending/running
		}

		time.Sleep(interval)
		interval *= 2
		if interval > maxInterval {
			interval = maxInterval
		}
	}
}
```

