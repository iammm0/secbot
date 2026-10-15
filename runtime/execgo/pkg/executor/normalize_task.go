// Task normalization helpers / 任务归一化辅助函数。
// Author: iammm0; Last edited: 2026-04-23
package executor

import "github.com/iammm0/execgo/pkg/models"

// NormalizeTask 将 legacy type 映射到 V2 语义 / maps legacy task types to V2 semantics.
func NormalizeTask(task *models.Task) {
	if task == nil || task.Type == "" {
		return
	}
	switch task.Type {
	case "mcp", "cli-skills", "os", "runtime":
		return
	default:
		if IsOSTool(task.Type) {
			task.ToolName = task.Type
			task.Category = "os"
			task.Type = "os"
			if len(task.Input) == 0 {
				task.Input = task.Params
			}
		}
	}
}
