package memory

import (
	"sync"
	"time"
)

type Role string

const (
	RoleSystem    Role = "system"
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleTool      Role = "tool"
)

type Message struct {
	Role      Role
	Content   string
	Timestamp time.Time
	Metadata  map[string]any
}

type Store struct {
	mu       sync.RWMutex
	messages []Message
	maxSize  int
}

func NewStore(maxSize int) *Store {
	if maxSize <= 0 {
		maxSize = 100
	}
	return &Store{
		messages: make([]Message, 0, maxSize),
		maxSize:  maxSize,
	}
}

func (s *Store) Add(role Role, content string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	msg := Message{
		Role:      role,
		Content:   content,
		Timestamp: time.Now(),
	}
	s.messages = append(s.messages, msg)

	if len(s.messages) > s.maxSize {
		s.messages = s.messages[len(s.messages)-s.maxSize:]
	}
}

func (s *Store) AddWithMeta(role Role, content string, meta map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()

	msg := Message{
		Role:      role,
		Content:   content,
		Timestamp: time.Now(),
		Metadata:  meta,
	}
	s.messages = append(s.messages, msg)

	if len(s.messages) > s.maxSize {
		s.messages = s.messages[len(s.messages)-s.maxSize:]
	}
}

func (s *Store) Recent(n int) []Message {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if n <= 0 || n > len(s.messages) {
		n = len(s.messages)
	}
	start := len(s.messages) - n
	result := make([]Message, n)
	copy(result, s.messages[start:])
	return result
}

func (s *Store) All() []Message {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make([]Message, len(s.messages))
	copy(result, s.messages)
	return result
}

func (s *Store) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.messages = s.messages[:0]
}

func (s *Store) Len() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.messages)
}
