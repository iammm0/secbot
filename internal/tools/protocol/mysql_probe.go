package protocol

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"strings"
	"time"
)

// MysqlProbeTool 读取 MySQL 握手初始包中的服务器版本等信息。
type MysqlProbeTool struct{}

func (t *MysqlProbeTool) Name() string { return "mysql_probe" }

func (t *MysqlProbeTool) Description() string {
	return "连接 MySQL 端口 3306，读取握手包中的协议版本与服务器版本字符串。输入: 主机名或 IP"
}

func (t *MysqlProbeTool) Call(ctx context.Context, input string) (string, error) {
	host := strings.TrimSpace(input)
	if host == "" {
		return "", fmt.Errorf("请提供主机名或 IP")
	}
	addr := net.JoinHostPort(host, "3306")

	d := net.Dialer{Timeout: 6 * time.Second}
	conn, err := d.DialContext(ctx, "tcp", addr)
	if err != nil {
		return "", fmt.Errorf("连接 %s 失败: %w", addr, err)
	}
	defer conn.Close()

	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(8 * time.Second)
	}
	_ = conn.SetDeadline(deadline)

	hdr := make([]byte, 4)
	if _, err := io.ReadFull(conn, hdr); err != nil {
		return "", fmt.Errorf("读取包头失败: %w", err)
	}
	pktLen := int(hdr[0]) | int(hdr[1])<<8 | int(hdr[2])<<16
	seq := hdr[3]

	body := make([]byte, pktLen)
	if _, err := io.ReadFull(conn, body); err != nil {
		return "", fmt.Errorf("读取握手包体失败: %w", err)
	}

	if len(body) < 2 {
		return "", fmt.Errorf("握手包过短")
	}

	proto := body[0]
	result := map[string]any{
		"host":             host,
		"port":             3306,
		"sequence_id":      seq,
		"protocol_version": proto,
	}

	// 0xff = ERR packet
	if proto == 0xff {
		result["error_packet"] = true
		out, _ := json.MarshalIndent(result, "", "  ")
		return string(out), nil
	}

	// 0x0a = handshake v10
	if proto == 0x0a {
		rest := body[1:]
		verEnd := strings.IndexByte(string(rest), 0)
		if verEnd < 0 {
			result["server_version"] = string(rest)
		} else {
			result["server_version"] = string(rest[:verEnd])
			pos := verEnd + 1
			if pos+4 <= len(rest) {
				result["connection_id"] = binary.LittleEndian.Uint32(rest[pos : pos+4])
			}
		}
	} else {
		result["note"] = fmt.Sprintf("非典型握手首字节 0x%02x", proto)
		result["raw_preview"] = fmt.Sprintf("%x", body[:min(len(body), 64)])
	}

	result["note2"] = "未进行认证；仅解析握手横幅。"

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}
