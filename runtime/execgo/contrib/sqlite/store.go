// Package sqlite 提供基于 SQLite 的 store.Store 实现（独立子模块）/ SQLite-backed store.Store in a separate module.
// Author: iammm0; Last edited: 2026-04-23
package sqlite

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/iammm0/execgo/pkg/models"
	"github.com/iammm0/execgo/pkg/store"

	_ "modernc.org/sqlite" // 纯 Go 驱动 / pure Go driver
)

const schema = `
CREATE TABLE IF NOT EXISTS execgo_tasks (
	id TEXT NOT NULL PRIMARY KEY,
	payload TEXT NOT NULL
);
`

// Store 将任务以 JSON 行存储于 SQLite / persists tasks as JSON rows.
type Store struct {
	db     *sql.DB
	mu     sync.Mutex
	logger *slog.Logger
}

// 确保实现接口 / compile-time check.
var _ store.Store = (*Store)(nil)

// Open 打开（或创建）数据库文件并返回 Store / opens or creates the database file.
func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("sqlite open: %w", err)
	}
	db.SetMaxOpenConns(1)

	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("sqlite schema: %w", err)
	}
	if _, err := db.Exec(`PRAGMA busy_timeout = 5000`); err != nil {
		db.Close()
		return nil, fmt.Errorf("sqlite pragma busy_timeout: %w", err)
	}
	if _, err := db.Exec(`PRAGMA journal_mode = WAL`); err != nil {
		db.Close()
		return nil, fmt.Errorf("sqlite pragma journal_mode: %w", err)
	}

	return &Store{db: db, logger: slog.Default()}, nil
}

// Close 关闭数据库 / closes the database.
func (s *Store) Close() error {
	return s.db.Close()
}

// Put 插入或整行替换任务 / inserts or replaces a task row.
func (s *Store) Put(task *models.Task) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.Marshal(task)
	if err != nil {
		s.logger.Error("sqlite put: marshal failed", "task_id", task.ID, "error", err)
		return
	}
	if _, err := s.db.Exec(`INSERT OR REPLACE INTO execgo_tasks (id, payload) VALUES (?, ?)`, task.ID, data); err != nil {
		s.logger.Error("sqlite put: exec failed", "task_id", task.ID, "error", err)
	}
}

// Get 按 id 读取任务 / loads a task by id.
func (s *Store) Get(id string) (*models.Task, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var payload string
	err := s.db.QueryRow(`SELECT payload FROM execgo_tasks WHERE id = ?`, id).Scan(&payload)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, false
		}
		return nil, false
	}
	var t models.Task
	if err := json.Unmarshal([]byte(payload), &t); err != nil {
		return nil, false
	}
	return &t, true
}

// GetAll 返回所有任务 / returns all tasks.
func (s *Store) GetAll() []*models.Task {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.Query(`SELECT payload FROM execgo_tasks`)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var out []*models.Task
	for rows.Next() {
		var payload string
		if err := rows.Scan(&payload); err != nil {
			continue
		}
		var t models.Task
		if err := json.Unmarshal([]byte(payload), &t); err != nil {
			continue
		}
		tt := t
		out = append(out, &tt)
	}
	return out
}

// Delete 删除任务 / deletes a task by id.
func (s *Store) Delete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	res, err := s.db.Exec(`DELETE FROM execgo_tasks WHERE id = ?`, id)
	if err != nil {
		return false
	}
	n, _ := res.RowsAffected()
	return n > 0
}

// UpdateStatus 读取-修改-写回 JSON / read-modify-write JSON for status update.
func (s *Store) UpdateStatus(id string, status models.TaskStatus, result json.RawMessage, errMsg string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	tx, err := s.db.Begin()
	if err != nil {
		return false
	}
	defer tx.Rollback()

	var payload string
	err = tx.QueryRow(`SELECT payload FROM execgo_tasks WHERE id = ?`, id).Scan(&payload)
	if err != nil {
		return false
	}
	var t models.Task
	if err := json.Unmarshal([]byte(payload), &t); err != nil {
		return false
	}
	t.Status = status
	t.Result = result
	t.Error = errMsg
	t.UpdatedAt = time.Now()
	data, err := json.Marshal(&t)
	if err != nil {
		return false
	}
	if _, err := tx.Exec(`UPDATE execgo_tasks SET payload = ? WHERE id = ?`, data, id); err != nil {
		return false
	}
	if err := tx.Commit(); err != nil {
		return false
	}
	return true
}
