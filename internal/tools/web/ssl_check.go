package web

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"time"
)

type SSLCheckTool struct{}

func (t *SSLCheckTool) Name() string { return "SSLCheck" }
func (t *SSLCheckTool) Description() string {
	return "检查目标的 SSL/TLS 证书信息和安全性。输入: 域名或 host:port"
}

func (t *SSLCheckTool) Call(_ context.Context, input string) (string, error) {
	host := strings.TrimSpace(input)
	if host == "" {
		return "", fmt.Errorf("请提供域名")
	}

	host = strings.TrimPrefix(host, "https://")
	host = strings.TrimPrefix(host, "http://")
	host = strings.Split(host, "/")[0]

	addr := host
	if !strings.Contains(addr, ":") {
		addr = host + ":443"
	}

	dialer := &net.Dialer{Timeout: 10 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
		InsecureSkipVerify: false,
	})
	if err != nil {
		// 尝试跳过验证以获取证书信息
		conn2, err2 := tls.DialWithDialer(dialer, "tcp", addr, &tls.Config{
			InsecureSkipVerify: true,
		})
		if err2 != nil {
			return "", fmt.Errorf("TLS 连接失败: %w", err)
		}
		defer conn2.Close()
		conn = conn2
	} else {
		defer conn.Close()
	}

	state := conn.ConnectionState()
	if len(state.PeerCertificates) == 0 {
		return "未获取到证书信息", nil
	}

	cert := state.PeerCertificates[0]
	daysLeft := int(time.Until(cert.NotAfter).Hours() / 24)

	status := "有效"
	if daysLeft < 0 {
		status = "已过期"
	} else if daysLeft < 30 {
		status = "即将过期"
	}

	result := map[string]any{
		"host":        host,
		"subject":     cert.Subject.CommonName,
		"issuer":      cert.Issuer.CommonName,
		"not_before":  cert.NotBefore.Format("2006-01-02"),
		"not_after":   cert.NotAfter.Format("2006-01-02"),
		"days_left":   daysLeft,
		"status":      status,
		"dns_names":   cert.DNSNames,
		"tls_version": tlsVersionName(state.Version),
		"cipher":      tls.CipherSuiteName(state.CipherSuite),
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}

func tlsVersionName(v uint16) string {
	switch v {
	case tls.VersionTLS10:
		return "TLS 1.0"
	case tls.VersionTLS11:
		return "TLS 1.1"
	case tls.VersionTLS12:
		return "TLS 1.2"
	case tls.VersionTLS13:
		return "TLS 1.3"
	default:
		return fmt.Sprintf("unknown(0x%04x)", v)
	}
}
