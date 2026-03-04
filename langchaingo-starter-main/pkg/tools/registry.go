package tools

import (
	"fmt"
	"strings"
	"sync"

	"github.com/tmc/langchaingo/tools"
)

// Registry is a thread-safe tool registry for managing available tools.
type Registry struct {
	mu    sync.RWMutex
	tools map[string]tools.Tool
}

// NewRegistry creates a new empty tool registry.
func NewRegistry() *Registry {
	return &Registry{
		tools: make(map[string]tools.Tool),
	}
}

// Register adds a tool to the registry.
func (r *Registry) Register(t tools.Tool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tools[strings.ToUpper(t.Name())] = t
}

// Get retrieves a tool by name (case-insensitive).
func (r *Registry) Get(name string) (tools.Tool, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	t, ok := r.tools[strings.ToUpper(name)]
	return t, ok
}

// All returns all registered tools as a slice.
func (r *Registry) All() []tools.Tool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]tools.Tool, 0, len(r.tools))
	for _, t := range r.tools {
		result = append(result, t)
	}
	return result
}

// Names returns the names of all registered tools.
func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.tools))
	for _, t := range r.tools {
		names = append(names, t.Name())
	}
	return names
}

// MustGet retrieves a tool by name and panics if not found.
func (r *Registry) MustGet(name string) tools.Tool {
	t, ok := r.Get(name)
	if !ok {
		panic(fmt.Sprintf("tool not found: %s", name))
	}
	return t
}

// DefaultRegistry returns a registry pre-loaded with all built-in example tools.
func DefaultRegistry() *Registry {
	r := NewRegistry()
	r.Register(&WeatherTool{})
	r.Register(&CalculatorTool{})
	r.Register(&SearchTool{})
	return r
}
