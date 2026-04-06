package tools

import (
	"fmt"
	"strings"
	"sync"

	"secbot/internal/tools/cloud"
	"secbot/internal/tools/control"
	"secbot/internal/tools/crawler"
	"secbot/internal/tools/defense"
	"secbot/internal/tools/network"
	"secbot/internal/tools/osint"
	"secbot/internal/tools/pentest"
	"secbot/internal/tools/protocol"
	"secbot/internal/tools/reporting"
	"secbot/internal/tools/utility"
	"secbot/internal/tools/web"
	"secbot/internal/tools/webresearch"

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

func (r *Registry) Map() map[string]tools.Tool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	m := make(map[string]tools.Tool, len(r.tools))
	for k, v := range r.tools {
		m[k] = v
	}
	return m
}

func SecurityRegistry() *Registry {
	r := NewRegistry()
	// 渗透测试工具
	r.Register(&pentest.PortScanTool{})
	r.Register(&pentest.ServiceDetectTool{})
	r.Register(&pentest.VulnScanTool{})
	r.Register(&pentest.ReconTool{})
	// 网络工具
	r.Register(&network.DNSLookupTool{})
	r.Register(&network.PingTool{})
	r.Register(&network.WhoisTool{})
	r.Register(&network.HTTPRequestTool{})
	r.Register(&network.PingSweepTool{})
	r.Register(&network.TracerouteTool{})
	r.Register(&network.SubdomainEnumTool{})
	r.Register(&network.BannerGrabTool{})
	r.Register(&network.ArpScanTool{})
	// Web 安全工具
	r.Register(&web.HeaderAnalyzeTool{})
	r.Register(&web.SSLCheckTool{})
	r.Register(&web.TechDetectTool{})
	r.Register(&web.DirBruteforceTool{})
	r.Register(&web.WafDetectTool{})
	r.Register(&web.CorsCheckTool{})
	r.Register(&web.JwtAnalyzeTool{})
	r.Register(&web.ParamFuzzerTool{})
	r.Register(&web.SsrfDetectTool{})
	r.Register(&protocol.SmbEnumTool{})
	r.Register(&protocol.RedisProbeTool{})
	r.Register(&protocol.MysqlProbeTool{})
	r.Register(&protocol.SnmpQueryTool{})
	// 通用工具
	r.Register(&utility.HashTool{})
	r.Register(&utility.EncodeDecodeTool{})
	r.Register(&utility.IPGeoTool{})
	r.Register(&utility.FileAnalyzeTool{})
	r.Register(&utility.CveLookupTool{})
	r.Register(&utility.LogAnalyzeTool{})
	r.Register(&utility.PasswordAuditTool{})
	r.Register(&utility.SecretScannerTool{})
	r.Register(&utility.DependencyAuditTool{})
	r.Register(&utility.PayloadGeneratorTool{})
	r.Register(&utility.WebSearchTool{})
	// OSINT
	r.Register(&osint.ShodanQueryTool{})
	r.Register(&osint.VirusTotalTool{})
	r.Register(&osint.CertTransparencyTool{})
	r.Register(&osint.CredentialLeakTool{})
	// 防御工具
	r.Register(&defense.SystemInfoTool{})
	r.Register(&defense.DefenseScanTool{})
	r.Register(&defense.SelfVulnScanTool{})
	r.Register(&defense.NetworkAnalyzeTool{})
	r.Register(&defense.IntrusionDetectTool{})
	// 云安全
	r.Register(&cloud.CloudMetadataTool{})
	r.Register(&cloud.S3BucketEnumTool{})
	r.Register(&cloud.ContainerInfoTool{})
	// 控制
	r.Register(&control.TerminalSessionTool{})
	r.Register(&control.ExecuteCommandTool{})
	// 报告
	r.Register(&reporting.ReportGeneratorTool{})
	// Web 研究
	r.Register(&webresearch.SmartSearchTool{})
	r.Register(&webresearch.PageExtractTool{})
	r.Register(&webresearch.DeepCrawlTool{})
	r.Register(&webresearch.ApiClientTool{})
	// 爬虫
	r.Register(&crawler.WebCrawlerTool{})
	// 系统命令(兼容)
	r.Register(&SystemCommandTool{})
	return r
}
