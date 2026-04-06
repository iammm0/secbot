package network

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strconv"
	"strings"
	"time"
)

// BannerGrabTool 对指定主机的一个或多个端口抓取 TCP banner。
type BannerGrabTool struct{}

func (t *BannerGrabTool) Name() string { return "banner_grab" }
func (t *BannerGrabTool) Description() string {
	return "连接指定端口并读取服务 banner。输入: \"host\"（默认多端口）或 \"host:port1,port2,port3\""
}

var defaultBannerPorts = []int{21, 22, 23, 25, 80, 110, 143, 443, 445, 3306, 3389, 8080}

func (t *BannerGrabTool) Call(ctx context.Context, input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("请提供 host 或 host:port1,port2")
	}

	host, ports, err := parseBannerInput(input)
	if err != nil {
		return "", err
	}
	if len(ports) == 0 {
		ports = append(ports, defaultBannerPorts...)
	}

	d := net.Dialer{Timeout: 5 * time.Second}
	dialHost := stripIPv6Brackets(host)
	results := make([]map[string]any, 0, len(ports))

	for _, port := range ports {
		addr := net.JoinHostPort(dialHost, strconv.Itoa(port))
		conn, err := d.DialContext(ctx, "tcp", addr)
		if err != nil {
			results = append(results, map[string]any{
				"address": addr,
				"open":    false,
				"error":   err.Error(),
			})
			continue
		}

		deadline, ok := ctx.Deadline()
		if !ok {
			deadline = time.Now().Add(3 * time.Second)
		}
		_ = conn.SetReadDeadline(deadline)

		buf := make([]byte, 1024)
		n, _ := conn.Read(buf)
		_ = conn.Close()

		s := strings.TrimSpace(string(buf[:n]))
		if s == "" {
			s = "(端口开放但无 banner 数据)"
		}

		results = append(results, map[string]any{
			"address": addr,
			"open":    true,
			"banner":  s,
		})
	}

	out, _ := json.MarshalIndent(map[string]any{
		"host":    host,
		"results": results,
	}, "", "  ")
	return string(out), nil
}

func stripIPv6Brackets(host string) string {
	h := strings.TrimSpace(host)
	if strings.HasPrefix(h, "[") && strings.HasSuffix(h, "]") && len(h) > 2 {
		return h[1 : len(h)-1]
	}
	return h
}

func parseBannerInput(input string) (host string, ports []int, err error) {
	// host:80,443,8080
	if idx := strings.LastIndex(input, ":"); idx > 0 {
		possibleHost := input[:idx]
		rest := input[idx+1:]
		if strings.Contains(rest, ",") || isAllDigits(rest) {
			host = strings.Trim(possibleHost, "[]")
			for _, p := range strings.Split(rest, ",") {
				p = strings.TrimSpace(p)
				if p == "" {
					continue
				}
				n, e := strconv.Atoi(p)
				if e != nil || n <= 0 || n > 65535 {
					return "", nil, fmt.Errorf("无效端口: %s", p)
				}
				ports = append(ports, n)
			}
			if len(ports) > 0 {
				return host, ports, nil
			}
		}
	}
	// IPv6 [addr]:ports
	if strings.HasPrefix(input, "[") {
		end := strings.Index(input, "]")
		if end > 0 && end+1 < len(input) && input[end+1] == ':' {
			h := input[1:end]
			rest := input[end+2:]
			for _, p := range strings.Split(rest, ",") {
				p = strings.TrimSpace(p)
				n, e := strconv.Atoi(p)
				if e != nil {
					return "", nil, fmt.Errorf("无效端口: %s", p)
				}
				ports = append(ports, n)
			}
			return h, ports, nil
		}
	}
	return input, nil, nil
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
