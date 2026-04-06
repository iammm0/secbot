package memory

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type LongTermEntry struct {
	Category  string    `json:"category"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
}

type LongTermMemory struct {
	mu      sync.RWMutex
	entries []LongTermEntry
	path    string
}

func NewLongTermMemory(dataDir string) *LongTermMemory {
	path := filepath.Join(dataDir, "long_term_memory.json")
	ltm := &LongTermMemory{
		entries: make([]LongTermEntry, 0),
		path:    path,
	}
	ltm.load()
	return ltm
}

func (l *LongTermMemory) Store(category, content string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.entries = append(l.entries, LongTermEntry{
		Category:  category,
		Content:   content,
		Timestamp: time.Now(),
	})
	if len(l.entries) > 500 {
		l.entries = l.entries[len(l.entries)-500:]
	}
	l.persist()
}

func (l *LongTermMemory) Retrieve(category string, limit int) []LongTermEntry {
	l.mu.RLock()
	defer l.mu.RUnlock()
	if limit <= 0 {
		limit = 10
	}
	var results []LongTermEntry
	for i := len(l.entries) - 1; i >= 0 && len(results) < limit; i-- {
		if category == "" || l.entries[i].Category == category {
			results = append(results, l.entries[i])
		}
	}
	return results
}

func (l *LongTermMemory) load() {
	data, err := os.ReadFile(l.path)
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, &l.entries)
}

func (l *LongTermMemory) persist() {
	dir := filepath.Dir(l.path)
	_ = os.MkdirAll(dir, 0o755)
	data, err := json.MarshalIndent(l.entries, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(l.path, data, 0o644)
}
