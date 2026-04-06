package network

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"sync"
)

// SubdomainEnumTool 使用常见前缀字典对域名做 DNS 解析枚举。
type SubdomainEnumTool struct{}

func (t *SubdomainEnumTool) Name() string { return "subdomain_enum" }
func (t *SubdomainEnumTool) Description() string {
	return "通过常见子域名字典进行 DNS 解析枚举。输入: 主域名，例如 example.com"
}

var subdomainPrefixes = []string{
	"www", "mail", "ftp", "localhost", "webmail", "smtp", "pop", "ns1", "webdisk",
	"admin", "m", "imap", "test", "ns", "blog", "pop3", "dev", "www2", "mysql",
	"vpn", "ns2", "api", "cdn", "shop", "smtp2", "mail2", "crm", "git", "staging",
	"app", "portal", "support", "secure", "static", "media", "img", "video",
}

func (t *SubdomainEnumTool) Call(ctx context.Context, input string) (string, error) {
	domain := strings.TrimSpace(strings.ToLower(input))
	if domain == "" {
		return "", fmt.Errorf("请提供域名")
	}
	domain = strings.TrimSuffix(domain, ".")

	found := make([]map[string]any, 0)
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 32)

	for _, prefix := range subdomainPrefixes {
		if ctx.Err() != nil {
			break
		}
		fqdn := prefix + "." + domain
		wg.Add(1)
		sem <- struct{}{}
		go func(name string) {
			defer wg.Done()
			defer func() { <-sem }()

			r := net.Resolver{}
			ips, err := r.LookupHost(ctx, name)
			if err != nil || len(ips) == 0 {
				return
			}
			mu.Lock()
			found = append(found, map[string]any{
				"subdomain": name,
				"ips":       ips,
			})
			mu.Unlock()
		}(fqdn)
	}
	wg.Wait()

	out, _ := json.MarshalIndent(map[string]any{
		"domain":  domain,
		"checked": len(subdomainPrefixes),
		"found":   found,
		"total":   len(found),
	}, "", "  ")
	return string(out), nil
}
