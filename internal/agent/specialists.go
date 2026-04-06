package agent

import (
	"secbot/internal/memory"
	"secbot/pkg/event"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

const networkReconPrompt = `你是网络侦察专家 Agent。你的职责是：
- 执行端口扫描和服务识别
- DNS 查询和子域名枚举
- 网络拓扑和路由分析
- WHOIS 和 IP 信息收集
仅使用你被分配的网络侦察工具，专注于信息收集而非攻击。`

const webPentestPrompt = `你是 Web 安全测试专家 Agent。你的职责是：
- HTTP 安全头分析
- SSL/TLS 证书检查
- 目录和文件枚举
- Web 技术栈识别和 WAF 检测
- CORS/JWT/参数安全分析
仅使用你被分配的 Web 安全工具。`

const osintPrompt = `你是开源情报（OSINT）专家 Agent。你的职责是：
- Shodan/VirusTotal 情报查询
- 证书透明度日志查询
- 凭据泄露检查
- 联网搜索和信息聚合
仅使用你被分配的 OSINT 工具。`

const terminalOpsPrompt = `你是终端操作专家 Agent。你的职责是：
- 在授权范围内执行系统命令
- 收集系统信息
- 管理终端会话
仅执行安全且授权的操作。`

const defenseMonitorPrompt = `你是防御监控专家 Agent。你的职责是：
- 本机安全自检
- 网络连接分析
- 入侵检测模式匹配
- 系统信息收集和安全评估
仅使用你被分配的防御工具。`

func CreateSpecialists(
	llm llms.Model,
	toolRegistry map[string]tools.Tool,
	mem *memory.Manager,
	bus *event.Bus,
) map[string]*SpecialistAgent {
	specialists := make(map[string]*SpecialistAgent)

	networkTools := collectTools(toolRegistry,
		"PortScan", "port_scan",
		"DNSLookup", "dns_lookup",
		"Ping", "ping",
		"Whois", "whois_lookup",
		"HTTPRequest", "http_request",
		"service_detect", "ping_sweep", "traceroute",
		"subdomain_enum", "banner_grab", "arp_scan",
		"ssl_analyzer",
	)
	if len(networkTools) > 0 {
		specialists["network_recon"] = NewSpecialistAgent(
			"NetworkRecon", "network_recon", networkReconPrompt,
			llm, networkTools, mem, bus,
		)
	}

	webTools := collectTools(toolRegistry,
		"HeaderAnalyze", "header_analyze",
		"SSLCheck", "ssl_check",
		"TechDetect", "tech_detect",
		"dir_bruteforce", "waf_detect", "cors_check",
		"jwt_analyze", "param_fuzzer", "ssrf_detect",
	)
	if len(webTools) > 0 {
		specialists["web_pentest"] = NewSpecialistAgent(
			"WebPentest", "web_pentest", webPentestPrompt,
			llm, webTools, mem, bus,
		)
	}

	osintTools := collectTools(toolRegistry,
		"IPGeo", "ip_geolocation",
		"shodan_query", "virustotal_check",
		"cert_transparency", "credential_leak_check",
		"smart_search", "page_extract", "deep_crawl",
		"api_client", "web_research", "web_search",
	)
	if len(osintTools) > 0 {
		specialists["osint"] = NewSpecialistAgent(
			"OSINT", "osint", osintPrompt,
			llm, osintTools, mem, bus,
		)
	}

	termTools := collectTools(toolRegistry,
		"SystemCommand", "execute_command", "terminal_session",
	)
	if len(termTools) > 0 {
		specialists["terminal_ops"] = NewSpecialistAgent(
			"TerminalOps", "terminal_ops", terminalOpsPrompt,
			llm, termTools, mem, bus,
		)
	}

	defenseTools := collectTools(toolRegistry,
		"SystemInfo", "system_info",
		"defense_scan", "self_vuln_scan",
		"network_analyze", "intrusion_detect",
	)
	if len(defenseTools) > 0 {
		specialists["defense_monitor"] = NewSpecialistAgent(
			"DefenseMonitor", "defense_monitor", defenseMonitorPrompt,
			llm, defenseTools, mem, bus,
		)
	}

	return specialists
}

func collectTools(registry map[string]tools.Tool, names ...string) []tools.Tool {
	var result []tools.Tool
	for _, name := range names {
		if t, ok := registry[name]; ok {
			result = append(result, t)
		}
	}
	return result
}
