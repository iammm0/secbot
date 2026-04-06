package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

type Manager struct {
	db *sql.DB
}

func NewManager(dbPath string) (*Manager, error) {
	if dbPath == "" {
		dbPath = "data/secbot.db"
	}
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("创建数据库目录失败: %w", err)
	}

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("打开数据库失败: %w", err)
	}

	m := &Manager{db: db}
	if err := m.initTables(); err != nil {
		db.Close()
		return nil, err
	}
	return m, nil
}

func (m *Manager) Close() error {
	return m.db.Close()
}

func (m *Manager) initTables() error {
	tables := []string{
		`CREATE TABLE IF NOT EXISTS conversations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			agent_type TEXT DEFAULT '',
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
			metadata TEXT DEFAULT '{}'
		)`,
		`CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id)`,
		`CREATE TABLE IF NOT EXISTS user_configs (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			category TEXT DEFAULT '',
			description TEXT DEFAULT '',
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS audit_trail (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			agent_type TEXT DEFAULT '',
			step_type TEXT NOT NULL,
			content TEXT NOT NULL,
			metadata TEXT DEFAULT '{}',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_trail(session_id)`,
		`CREATE TABLE IF NOT EXISTS scan_results (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			target TEXT NOT NULL,
			scan_type TEXT NOT NULL,
			result TEXT DEFAULT '',
			vulns TEXT DEFAULT '[]',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_scan_target ON scan_results(target)`,
	}
	for _, q := range tables {
		if _, err := m.db.Exec(q); err != nil {
			return fmt.Errorf("建表失败: %w", err)
		}
	}
	return nil
}

func (m *Manager) SaveConversation(sessionID, agentType, role, content, metadata string) error {
	_, err := m.db.Exec(
		`INSERT INTO conversations (session_id, agent_type, role, content, metadata) VALUES (?, ?, ?, ?, ?)`,
		sessionID, agentType, role, content, metadata,
	)
	return err
}

func (m *Manager) GetConversations(sessionID string, limit int) ([]Conversation, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := m.db.Query(
		`SELECT id, session_id, agent_type, role, content, timestamp, metadata FROM conversations WHERE session_id = ? ORDER BY id DESC LIMIT ?`,
		sessionID, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []Conversation
	for rows.Next() {
		var c Conversation
		var ts string
		if err := rows.Scan(&c.ID, &c.SessionID, &c.AgentType, &c.Role, &c.Content, &ts, &c.Metadata); err != nil {
			continue
		}
		c.Timestamp, _ = time.Parse("2006-01-02 15:04:05", ts)
		results = append(results, c)
	}
	return results, nil
}

func (m *Manager) SaveConfig(key, value, category, description string) error {
	_, err := m.db.Exec(
		`INSERT OR REPLACE INTO user_configs (key, value, category, description, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		key, value, category, description,
	)
	return err
}

func (m *Manager) GetConfig(key string) (string, error) {
	var value string
	err := m.db.QueryRow(`SELECT value FROM user_configs WHERE key = ?`, key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

func (m *Manager) DeleteConfig(key string) error {
	_, err := m.db.Exec(`DELETE FROM user_configs WHERE key = ?`, key)
	return err
}

func (m *Manager) SaveAuditRecord(sessionID, agentType, stepType, content, metadata string) error {
	_, err := m.db.Exec(
		`INSERT INTO audit_trail (session_id, agent_type, step_type, content, metadata) VALUES (?, ?, ?, ?, ?)`,
		sessionID, agentType, stepType, content, metadata,
	)
	return err
}

func (m *Manager) SaveScanResult(target, scanType, result, vulns string) error {
	_, err := m.db.Exec(
		`INSERT INTO scan_results (target, scan_type, result, vulns) VALUES (?, ?, ?, ?)`,
		target, scanType, result, vulns,
	)
	return err
}
