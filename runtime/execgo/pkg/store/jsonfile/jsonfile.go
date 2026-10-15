// Package jsonfile 提供内存任务表 + JSON 文件持久化 / in-memory tasks with JSON file persistence.
// Author: iammm0; Last edited: 2026-04-23
package jsonfile

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/pkg/store"
)

// Manager 任务状态管理器 / task state manager.
type Manager struct {
	mu       sync.RWMutex
	tasks    map[string]*models.Task
	filePath string
	logger   *slog.Logger
}

// 确保实现接口 / compile-time interface checks.
var _ store.Store = (*Manager)(nil)
var _ store.Flusher = (*Manager)(nil)

// NewManager 创建状态管理器并加载持久化数据 / creates a state manager and loads persisted data.
func NewManager(dataDir string, logger *slog.Logger) (*Manager, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	m := &Manager{
		tasks:    make(map[string]*models.Task),
		filePath: filepath.Join(dataDir, "state.json"),
		logger:   logger,
	}

	if err := m.loadFromDisk(); err != nil {
		logger.Warn("failed to load state, starting fresh", "error", err)
	}

	// 恢复时将 running 状态重置为 pending / reset running tasks to pending on recovery
	m.mu.Lock()
	for _, t := range m.tasks {
		if t.Status == models.StatusRunning {
			t.Status = models.StatusPending
			t.UpdatedAt = time.Now()
			logger.Info("reset running task to pending on recovery", "task_id", t.ID)
		}
	}
	m.mu.Unlock()

	return m, nil
}

// Put 存储或更新任务 / stores or updates a task.
func (m *Manager) Put(task *models.Task) {
	m.mu.Lock()
	m.tasks[task.ID] = task
	m.mu.Unlock()
}

// Get 获取单个任务 / retrieves a single task.
func (m *Manager) Get(id string) (*models.Task, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.tasks[id]
	return t, ok
}

// GetAll 获取所有任务 / retrieves all tasks.
func (m *Manager) GetAll() []*models.Task {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*models.Task, 0, len(m.tasks))
	for _, t := range m.tasks {
		result = append(result, t)
	}
	return result
}

// Delete 删除任务 / deletes a task.
func (m *Manager) Delete(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.tasks[id]; !ok {
		return false
	}
	delete(m.tasks, id)
	return true
}

// UpdateStatus 原子更新任务状态 / atomically updates task status.
func (m *Manager) UpdateStatus(id string, status models.TaskStatus, result json.RawMessage, errMsg string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	t, ok := m.tasks[id]
	if !ok {
		return false
	}
	t.Status = status
	t.Result = result
	t.Error = errMsg
	t.UpdatedAt = time.Now()
	return true
}

// Persist 将当前状态持久化到磁盘 / persists current state to disk.
func (m *Manager) Persist() error {
	m.mu.RLock()
	snapshot := make(map[string]*models.Task, len(m.tasks))
	for k, v := range m.tasks {
		snapshot[k] = v
	}
	m.mu.RUnlock()

	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal state: %w", err)
	}

	// 先写临时文件再原子重命名 / write to temp file then atomic rename
	tmpPath := m.filePath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return fmt.Errorf("write state file: %w", err)
	}
	if err := os.Rename(tmpPath, m.filePath); err != nil {
		return fmt.Errorf("rename state file: %w", err)
	}

	return nil
}

// loadFromDisk 从磁盘加载状态 / loads state from disk.
func (m *Manager) loadFromDisk() error {
	data, err := os.ReadFile(m.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	if len(data) == 0 {
		return nil
	}

	tasks := make(map[string]*models.Task)
	if err := json.Unmarshal(data, &tasks); err != nil {
		return fmt.Errorf("unmarshal state: %w", err)
	}

	m.tasks = tasks
	m.logger.Info("loaded state from disk", "task_count", len(tasks))
	return nil
}

// StartPeriodicPersist 启动定期持久化，返回 done 通道在最终持久化完成后关闭 / starts periodic persistence; the returned channel is closed after the final persist completes.
func (m *Manager) StartPeriodicPersist(interval time.Duration, stop <-chan struct{}) <-chan struct{} {
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				if err := m.Persist(); err != nil {
					m.logger.Error("periodic persist failed", "error", err)
				}
			case <-stop:
				if err := m.Persist(); err != nil {
					m.logger.Error("final persist failed", "error", err)
				}
				return
			}
		}
	}()
	return done
}
