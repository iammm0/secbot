package tools

import (
	"fmt"
	"strings"
	"sync"

	"secbot/internal/tools/defense"
	"secbot/internal/tools/network"
	"secbot/internal/tools/pentest"
	"secbot/internal/tools/utility"
	"secbot/internal/tools/web"

	"github.com/tmc/langchaingo/tools"
)

type Registry struct {
	mu    sync.RWMutex
	tools map[string]tools.Tool
}

func NewRegistry() *Registry {
	return &Registry{tools: make(map[string]tools.Tool)}
}

func (r *Registry) Register(t tools.Tool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.tools[strings.ToLower(t.Name())] = t
}

func (r *Registry) Get(name string) (tools.Tool, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	t, ok := r.tools[strings.ToLower(name)]
	return t, ok
}

func (r *Registry) All() []tools.Tool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]tools.Tool, 0, len(r.tools))
	for _, t := range r.tools {
		result = append(result, t)
	}
	return result
}

func (r *Registry) Names() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.tools))
	for _, t := range r.tools {
		names = append(names, t.Name())
	}
	return names
}

func (r *Registry) MustGet(name string) tools.Tool {
	t, ok := r.Get(name)
	if !ok {
		panic(fmt.Sprintf("工具未找到: %s", name))
	}
	return t
}

func SecurityRegistry() *Registry {
	r := NewRegistry()
	// 渗透测试工具
	r.Register(&pentest.PortScanTool{})
	// 网络工具
	r.Register(&network.DNSLookupTool{})
	r.Register(&network.PingTool{})
	r.Register(&network.WhoisTool{})
	r.Register(&network.HTTPRequestTool{})
	// Web 安全工具
	r.Register(&web.HeaderAnalyzeTool{})
	r.Register(&web.SSLCheckTool{})
	r.Register(&web.TechDetectTool{})
	// 通用工具
	r.Register(&utility.HashTool{})
	r.Register(&utility.EncodeDecodeTool{})
	r.Register(&utility.IPGeoTool{})
	// 防御工具
	r.Register(&defense.SystemInfoTool{})
	// 系统命令
	r.Register(&SystemCommandTool{})
	return r
}
