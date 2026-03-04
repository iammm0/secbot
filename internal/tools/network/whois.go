package network

import (
	"context"
	"fmt"
	"io"
	"net"
	"strings"
	"time"
)

type WhoisTool struct{}

func (t *WhoisTool) Name() string { return "Whois" }
func (t *WhoisTool) Description() string {
	return "WHOIS 查询工具。输入域名或 IP，返回注册信息"
}

func (t *WhoisTool) Call(_ context.Context, input string) (string, error) {
	query := strings.TrimSpace(input)
	if query == "" {
		return "", fmt.Errorf("请提供域名或 IP")
	}

	server := "whois.iana.org"
	if strings.Contains(query, ".com") || strings.Contains(query, ".net") {
		server = "whois.verisign-grs.com"
	} else if strings.Contains(query, ".org") {
		server = "whois.pir.org"
	} else if strings.Contains(query, ".cn") {
		server = "whois.cnnic.cn"
	}

	conn, err := net.DialTimeout("tcp", server+":43", 10*time.Second)
	if err != nil {
		return "", fmt.Errorf("连接 WHOIS 服务器失败: %w", err)
	}
	defer conn.Close()

	conn.SetDeadline(time.Now().Add(10 * time.Second))
	fmt.Fprintf(conn, "%s\r\n", query)

	data, err := io.ReadAll(conn)
	if err != nil {
		return "", fmt.Errorf("读取 WHOIS 数据失败: %w", err)
	}

	result := string(data)
	if len(result) > 4000 {
		result = result[:4000] + "\n... (结果已截断)"
	}
	return result, nil
}
