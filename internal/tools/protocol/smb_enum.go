package protocol

import (
	"context"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"time"
)

// SmbEnumTool 对 SMB 端口 445 进行基础探测（SMB2 Negotiate）。
type SmbEnumTool struct{}

func (t *SmbEnumTool) Name() string { return "smb_enum" }

func (t *SmbEnumTool) Description() string {
	return "连接目标主机 TCP 445，发送 SMB2 Negotiate 请求并解析响应中的协商信息。输入: 主机名或 IP"
}

func buildSMB2Negotiate() []byte {
	hdr := make([]byte, 64)
	copy(hdr[0:4], []byte{0xFE, 'S', 'M', 'B'})
	binary.LittleEndian.PutUint16(hdr[4:6], 64) // StructureSize
	binary.LittleEndian.PutUint16(hdr[12:14], 0) // SMB2_NEGOTIATE
	binary.LittleEndian.PutUint16(hdr[14:16], 0x0010)
	binary.LittleEndian.PutUint64(hdr[24:32], 1) // MessageId

	// 固定 36 字节 + 1 个 dialect（2 字节），与 MS-SMB2 2.2.3 一致
	neg := make([]byte, 38)
	binary.LittleEndian.PutUint16(neg[0:2], 36)
	binary.LittleEndian.PutUint16(neg[2:4], 1)
	binary.LittleEndian.PutUint16(neg[4:6], 1)
	binary.LittleEndian.PutUint32(neg[8:12], 0x00000007)
	// ClientGuid 16 字节保持为 0
	// ClientStartTime 8 字节（neg[28:36]）保持为 0
	binary.LittleEndian.PutUint16(neg[36:38], 0x0202) // SMB 2.0.2

	payload := append(hdr, neg...)
	nb := make([]byte, 4+len(payload))
	binary.BigEndian.PutUint32(nb[0:4], uint32(len(payload)))
	copy(nb[4:], payload)
	return nb
}

func (t *SmbEnumTool) Call(ctx context.Context, input string) (string, error) {
	host := strings.TrimSpace(input)
	if host == "" {
		return "", fmt.Errorf("请提供主机名或 IP")
	}
	addr := net.JoinHostPort(host, "445")

	d := net.Dialer{Timeout: 8 * time.Second}
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

	pkt := buildSMB2Negotiate()
	if _, err := conn.Write(pkt); err != nil {
		return "", fmt.Errorf("发送 SMB2 Negotiate 失败: %w", err)
	}

	buf := make([]byte, 4096)
	n, err := conn.Read(buf)
	if err != nil && n == 0 {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}
	resp := buf[:n]

	result := map[string]any{
		"host": host,
		"port": 445,
	}

	if len(resp) < 8 {
		result["note"] = "响应过短"
		out, _ := json.MarshalIndent(result, "", "  ")
		return string(out), nil
	}

	off := 0
	if resp[0] == 0x00 && len(resp) >= 8 {
		nbLen := int(binary.BigEndian.Uint32(resp[0:4])) & 0xffffff
		if nbLen > 0 && nbLen <= len(resp)-4 {
			off = 4
		}
	}
	if off+4 <= len(resp) {
		sig := binary.LittleEndian.Uint32(resp[off : off+4])
		if sig == 0x424d53fe {
			result["protocol"] = "SMB2"
		} else if off+4 <= len(resp) && resp[off] == 0xff && resp[off+1] == 'S' {
			result["protocol"] = "SMB1"
		}
	}

	if len(resp) >= off+64 {
		status := binary.LittleEndian.Uint32(resp[off+8 : off+12])
		result["nt_status"] = fmt.Sprintf("0x%08x", status)
		if off+0x12 <= len(resp) {
			dialect := binary.LittleEndian.Uint16(resp[off+0x10 : off+0x12])
			if dialect != 0 {
				result["dialect_revision"] = dialect
			}
		}
	}

	result["response_hex_preview"] = hex.EncodeToString(resp[:min(n, 128)])
	result["response_bytes"] = n
	result["note"] = "基础协商探测；完整枚举需凭据与会话建立。"

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
