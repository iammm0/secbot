package protocol

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"time"
)

// SnmpQueryTool 使用 SNMPv2c 与 public 团体名请求 sysDescr（UDP/161）。
type SnmpQueryTool struct{}

func (t *SnmpQueryTool) Name() string { return "snmp_query" }

func (t *SnmpQueryTool) Description() string {
	return "向 UDP 161 发送 SNMPv2c GET（sysDescr），使用团体名 public，解析响应中的可读信息。输入: 主机名或 IP"
}

// snmpSysDescrGet 为预构建的 SNMPv2c GetRequest（OID 1.3.6.1.2.1.1.1.0）。
var snmpSysDescrGet = []byte{
	0x30, 0x29,
	0x02, 0x01, 0x01,
	0x04, 0x06, 0x70, 0x75, 0x62, 0x6c, 0x69, 0x63,
	0xa0, 0x1c,
	0x02, 0x04, 0x00, 0x00, 0x00, 0x01,
	0x02, 0x01, 0x00,
	0x02, 0x01, 0x00,
	0x30, 0x0e,
	0x30, 0x0c,
	0x06, 0x08, 0x2b, 0x06, 0x01, 0x02, 0x01, 0x01, 0x01, 0x00,
	0x05, 0x00,
}

func extractPrintableFromSNMP(data []byte) string {
	var b strings.Builder
	for _, c := range data {
		if c >= 32 && c < 127 && c != '"' {
			b.WriteByte(c)
		} else if c == ' ' || c == '\n' || c == '\t' {
			b.WriteByte(' ')
		}
	}
	s := strings.TrimSpace(b.String())
	if len(s) > 800 {
		return s[:800] + "...(截断)"
	}
	return s
}

func (t *SnmpQueryTool) Call(ctx context.Context, input string) (string, error) {
	host := strings.TrimSpace(input)
	if host == "" {
		return "", fmt.Errorf("请提供主机名或 IP")
	}
	addr := net.JoinHostPort(host, "161")

	d := net.Dialer{}
	conn, err := d.DialContext(ctx, "udp", addr)
	if err != nil {
		return "", fmt.Errorf("UDP 连接 %s 失败: %w", addr, err)
	}
	defer conn.Close()

	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(5 * time.Second)
	}
	_ = conn.SetDeadline(deadline)

	if _, err := conn.Write(snmpSysDescrGet); err != nil {
		return "", fmt.Errorf("发送 SNMP 请求失败: %w", err)
	}

	buf := make([]byte, 65535)
	n, err := conn.Read(buf)
	if err != nil {
		return "", fmt.Errorf("读取 SNMP 响应失败: %w", err)
	}
	resp := buf[:n]

	result := map[string]any{
		"host":           host,
		"port":           161,
		"community_tried": "public",
		"response_bytes": n,
	}

	// 简单错误/状态检查：SNMPv2 响应 PDU 中 error-status 通常为 INTEGER 0
	if len(resp) >= 8 && resp[0] == 0x30 {
		result["asn1_sequence"] = true
	}

	// 尝试从响应中提取 OCTET STRING（sysDescr）
	sysDescr := ""
	for i := 0; i+2 < len(resp); i++ {
		if resp[i] == 0x04 { // OCTET STRING
			l := int(resp[i+1])
			if l > 0 && i+2+l <= len(resp) {
				sysDescr = string(resp[i+2 : i+2+l])
				if len(strings.TrimSpace(sysDescr)) > 3 {
					break
				}
			}
		}
	}
	if sysDescr != "" {
		result["sys_descr"] = sysDescr
	} else {
		result["text_preview"] = extractPrintableFromSNMP(resp)
	}

	result["response_hex_preview"] = hex.EncodeToString(resp[:min(n, 96)])
	result["note"] = "仅测试默认 public；生产环境应使用只读凭据与授权范围。"

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}
