package protocol

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"strconv"
	"strings"
	"time"
)

// RedisProbeTool 探测 Redis（RESP：PING、INFO）。
type RedisProbeTool struct{}

func (t *RedisProbeTool) Name() string { return "redis_probe" }

func (t *RedisProbeTool) Description() string {
	return "连接主机 TCP 6379，发送 RESP 的 PING 与 INFO 命令并返回结果。输入: 主机名或 IP"
}

func writeRESPCommand(w *bufio.Writer, args ...string) error {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("*%d\r\n", len(args)))
	for _, a := range args {
		b.WriteString(fmt.Sprintf("$%d\r\n%s\r\n", len(a), a))
	}
	_, err := w.WriteString(b.String())
	return err
}

func readRESPLine(r *bufio.Reader) (string, error) {
	line, err := r.ReadString('\n')
	if err != nil {
		return "", err
	}
	return strings.TrimRight(line, "\r\n"), nil
}

func (t *RedisProbeTool) Call(ctx context.Context, input string) (string, error) {
	host := strings.TrimSpace(input)
	if host == "" {
		return "", fmt.Errorf("请提供主机名或 IP")
	}
	addr := net.JoinHostPort(host, "6379")

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

	r := bufio.NewReader(conn)
	w := bufio.NewWriter(conn)

	if err := writeRESPCommand(w, "PING"); err != nil {
		return "", fmt.Errorf("写入 PING 失败: %w", err)
	}
	if err := w.Flush(); err != nil {
		return "", err
	}

	pingLine, err := readRESPLine(r)
	if err != nil {
		return "", fmt.Errorf("读取 PING 响应失败: %w", err)
	}

	if err := writeRESPCommand(w, "INFO", "server"); err != nil {
		return "", fmt.Errorf("写入 INFO 失败: %w", err)
	}
	if err := w.Flush(); err != nil {
		return "", err
	}

	infoPreview := ""
	infoFirst, err := readRESPLine(r)
	if err == nil && len(infoFirst) > 0 {
		switch infoFirst[0] {
		case '$':
			n, err := strconv.Atoi(infoFirst[1:])
			if err == nil && n > 0 && n < 512*1024 {
				buf := make([]byte, n+2)
				if _, err := io.ReadFull(r, buf); err == nil {
					infoPreview = strings.TrimSpace(string(buf[:n]))
					if len(infoPreview) > 2000 {
						infoPreview = infoPreview[:2000] + "...(截断)"
					}
				}
			}
		case '-':
			infoPreview = infoFirst
		default:
			infoPreview = infoFirst
		}
	}

	out, _ := json.MarshalIndent(map[string]any{
		"host":         host,
		"port":         6379,
		"ping_reply":   pingLine,
		"info_server":  infoPreview,
		"unauthorized": strings.HasPrefix(pingLine, "-") || strings.Contains(strings.ToLower(pingLine), "auth"),
		"note":         "若需密码，将返回 NOAUTH 等错误；仅用于授权环境探测。",
	}, "", "  ")
	return string(out), nil
}
