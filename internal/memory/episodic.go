package memory

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type EpisodicEntry struct {
	Content    string    `json:"content"`
	Timestamp  time.Time `json:"timestamp"`
	Importance float64   `json:"importance"`
}

type EpisodicMemory struct {
	mu      sync.RWMutex
	entries map[string]EpisodicEntry
	path    string
}

func NewEpisodicMemory(dataDir string) *EpisodicMemory {
	path := filepath.Join(dataDir, "episodic_memory.json")
	em := &EpisodicMemory{
		entries: make(map[string]EpisodicEntry),
		path:    path,
	}
	em.load()
	return em
}

func (e *EpisodicMemory) Save(key, value string, importance float64) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.entries[key] = EpisodicEntry{
		Content:    value,
		Timestamp:  time.Now(),
		Importance: importance,
	}
	e.persist()
}

func (e *EpisodicMemory) Recall(key string) (string, bool) {
	e.mu.RLock()
	defer e.mu.RUnlock()
	entry, ok := e.entries[key]
	if !ok {
		return "", false
	}
	return entry.Content, true
}

func (e *EpisodicMemory) GetAll() map[string]EpisodicEntry {
	e.mu.RLock()
	defer e.mu.RUnlock()
	cp := make(map[string]EpisodicEntry, len(e.entries))
	for k, v := range e.entries {
		cp[k] = v
	}
	return cp
}

func (e *EpisodicMemory) load() {
	data, err := os.ReadFile(e.path)
	if err != nil {
		return
	}
	_ = json.Unmarshal(data, &e.entries)
}

func (e *EpisodicMemory) persist() {
	dir := filepath.Dir(e.path)
	_ = os.MkdirAll(dir, 0o755)
	data, err := json.MarshalIndent(e.entries, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(e.path, data, 0o644)
}
