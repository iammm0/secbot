package network

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strings"
)

type DNSLookupTool struct{}

func (t *DNSLookupTool) Name() string { return "DNSLookup" }
func (t *DNSLookupTool) Description() string {
	return "DNS 查询工具。输入域名，返回 A/AAAA/MX/NS/TXT 等记录"
}

func (t *DNSLookupTool) Call(_ context.Context, input string) (string, error) {
	domain := strings.TrimSpace(input)
	if domain == "" {
		return "", fmt.Errorf("请提供域名")
	}

	result := map[string]any{"domain": domain}

	if ips, err := net.LookupHost(domain); err == nil {
		result["a_records"] = ips
	}

	if cname, err := net.LookupCNAME(domain); err == nil && cname != domain+"." {
		result["cname"] = cname
	}

	if mxs, err := net.LookupMX(domain); err == nil {
		mxList := make([]string, 0, len(mxs))
		for _, mx := range mxs {
			mxList = append(mxList, fmt.Sprintf("%s (priority: %d)", mx.Host, mx.Pref))
		}
		result["mx_records"] = mxList
	}

	if nss, err := net.LookupNS(domain); err == nil {
		nsList := make([]string, 0, len(nss))
		for _, ns := range nss {
			nsList = append(nsList, ns.Host)
		}
		result["ns_records"] = nsList
	}

	if txts, err := net.LookupTXT(domain); err == nil {
		result["txt_records"] = txts
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}
