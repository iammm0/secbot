// CLI skills executor (local subprocess) / CLI skills 执行器（本地子进程）。
// Author: iammm0; Last edited: 2026-04-23
package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/iammm0/execgo/pkg/models"
)

// CLISkillsExecutor 执行本地 CLI skill 命令 / executes local CLI skill commands.
type CLISkillsExecutor struct {
	ext ExecutorExtension
}

// NewCLISkillsExecutor 创建 CLI skills executor，并在未传扩展时使用空扩展 / creates a CLI skills executor and uses a no-op extension when none is provided.
func NewCLISkillsExecutor(ext ExecutorExtension) *CLISkillsExecutor {
	if ext == nil {
		ext = NopExtension{}
	}
	return &CLISkillsExecutor{ext: ext}
}

// Name 返回执行器注册名 / returns the executor registry name.
func (e *CLISkillsExecutor) Name() string { return "cli-skills" }

// Category 返回执行器分类 / returns the executor category.
func (e *CLISkillsExecutor) Category() string { return "cli-skills" }

// CLISkillInput 描述要执行的本地命令及参数 / describes the local command and arguments to execute.
type CLISkillInput struct {
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
}

// Execute 解析任务输入并通过本地子进程执行 CLI 命令 / parses task input and executes the CLI command as a local subprocess.
func (e *CLISkillsExecutor) Execute(ctx context.Context, task *models.Task) (*Result, error) {
	if err := e.ext.BeforeExecute(ctx, task); err != nil {
		return nil, err
	}
	startedAt := time.Now()

	var in CLISkillInput
	raw := task.Input
	if len(raw) == 0 {
		raw = task.Params
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return nil, fmt.Errorf("parse cli-skills input: %w", err)
	}
	if strings.TrimSpace(in.Command) == "" {
		return nil, fmt.Errorf("command is required")
	}

	cmd := exec.CommandContext(ctx, in.Command, in.Args...)
	out, err := cmd.CombinedOutput()
	finishedAt := time.Now()
	res := &Result{
		TaskID:     task.ID,
		Status:     models.RuntimeSuccess,
		StartedAt:  &startedAt,
		FinishedAt: &finishedAt,
		DurationMS: finishedAt.Sub(startedAt).Milliseconds(),
		Output: mustJSONMarshal(map[string]any{
			"command": in.Command,
			"args":    in.Args,
			"output":  string(out),
		}),
	}
	if err != nil {
		res.Status = models.RuntimeFailed
		_ = e.ext.OnError(ctx, err, task)
		return res, fmt.Errorf("cli skill command failed: %w", err)
	}
	_ = e.ext.AfterExecute(ctx, res)
	return res, nil
}

// ListTools 返回 CLI skills executor 暴露的工具清单 / returns the tools exposed by the CLI skills executor.
func (e *CLISkillsExecutor) ListTools(ctx context.Context) ([]Tool, error) {
	_ = ctx
	return []Tool{
		{
			Name:        "cli.run",
			Category:    "cli-skills",
			Description: "Run local CLI command",
			InputSchema: map[string]any{"type": "object"},
		},
	}, nil
}

// HealthCheck 检查 CLI skills executor 是否可用 / checks whether the CLI skills executor is available.
func (e *CLISkillsExecutor) HealthCheck() error { return nil }

// Shutdown 关闭 CLI skills executor 并释放资源 / shuts down the CLI skills executor and releases resources.
func (e *CLISkillsExecutor) Shutdown(ctx context.Context) error { _ = ctx; return nil }
