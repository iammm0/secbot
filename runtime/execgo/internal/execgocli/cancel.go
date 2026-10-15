package execgocli

import (
	"context"
	"fmt"
	"time"
)

// CancelResult is the JSON data shape returned by the cancel subcommand.
type CancelResult struct {
	Tasks       []map[string]any `json:"tasks"`
	Wait        *WaitResult      `json:"wait,omitempty"`
	AllTerminal bool             `json:"all_terminal,omitempty"`
}

// Cancel requests cancellation for each task id through ExecGo's cancel endpoint.
func Cancel(ctx context.Context, c *Client, ids []string) (*CancelResult, error) {
	if len(ids) == 0 {
		return nil, fmt.Errorf("no task ids")
	}
	out := &CancelResult{Tasks: make([]map[string]any, 0, len(ids))}
	for _, id := range ids {
		m, _, _, err := c.PostCancelTask(ctx, id)
		if err != nil {
			return out, err
		}
		out.Tasks = append(out.Tasks, m)
	}
	return out, nil
}

// CancelAndWait requests cancellation, then waits until all tasks are terminal.
func CancelAndWait(ctx context.Context, c *Client, ids []string, interval time.Duration) (*CancelResult, error) {
	out, err := Cancel(ctx, c, ids)
	if err != nil {
		return out, err
	}
	wait, err := Wait(ctx, c, ids, interval, 0)
	out.Wait = wait
	if wait != nil {
		out.AllTerminal = wait.AllTerminal
	}
	return out, err
}
