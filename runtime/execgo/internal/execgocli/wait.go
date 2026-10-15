package execgocli

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// TaskSnapshot 从 GET /tasks/{id} 映射的最小轮询视图 / minimal poll view.
type TaskSnapshot struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// WaitResult 是 wait 子命令的 data 形状 / wait subcommand data.
type WaitResult struct {
	Tasks       []map[string]any `json:"tasks"`
	AllTerminal bool             `json:"all_terminal"`
	Deadline    string           `json:"deadline_rfc3339,omitempty"`
}

func isTerminalStatus(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "success", "failed", "cancelled", "skipped":
		return true
	default:
		return false
	}
}

// Wait polls GET /tasks/{id} until all terminal or context done.
func Wait(ctx context.Context, c *Client, ids []string, interval, timeout time.Duration) (*WaitResult, error) {
	if len(ids) == 0 {
		return nil, fmt.Errorf("no task ids")
	}
	deadline, ok := ctx.Deadline()
	if !ok && timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, timeout)
		defer cancel()
		deadline, _ = ctx.Deadline()
	}
	var deadlineStr string
	if !deadline.IsZero() {
		deadlineStr = deadline.UTC().Format(time.RFC3339)
	}

	if interval <= 0 {
		interval = 500 * time.Millisecond
	}

	out := &WaitResult{
		Deadline: deadlineStr,
	}

	for {
		out.Tasks = nil
		allTerm := true
		for _, id := range ids {
			m, _, _, err := c.GetTask(ctx, id)
			if err != nil {
				return out, err
			}
			st, _ := m["status"].(string)
			if !isTerminalStatus(st) {
				allTerm = false
			}
			out.Tasks = append(out.Tasks, m)
		}
		out.AllTerminal = allTerm
		if allTerm {
			return out, nil
		}
		select {
		case <-ctx.Done():
			out.AllTerminal = false
			return out, ctx.Err()
		case <-time.After(interval):
		}
	}
}
