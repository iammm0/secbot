// Package store 定义任务状态存储抽象 / task state storage abstraction.
// Author: iammm0; Last edited: 2026-04-23
package store

import (
	"encoding/json"

	"github.com/iammm0/execgo/pkg/models"
)

// Store 任务存储最小接口，供调度器与 HTTP 层使用 / minimal task store for scheduler and HTTP.
type Store interface {
	Put(task *models.Task)
	Get(id string) (*models.Task, bool)
	GetAll() []*models.Task
	Delete(id string) bool
	UpdateStatus(id string, status models.TaskStatus, result json.RawMessage, errMsg string) bool
}

// Flusher 可选：将内存状态刷盘 / optional persistence flush (e.g. JSON file backend).
type Flusher interface {
	Persist() error
}
