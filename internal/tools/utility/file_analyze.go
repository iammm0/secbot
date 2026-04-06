package utility

import (
	"context"
	"crypto/md5"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
)

// FileAnalyzeTool 分析本地文件：大小、权限、哈希与魔数。
type FileAnalyzeTool struct{}

func (t *FileAnalyzeTool) Name() string { return "file_analyze" }

func (t *FileAnalyzeTool) Description() string {
	return "分析本地文件：大小、权限（类 Unix）、MD5/SHA256、前 256 字节的十六进制与可读魔数。输入：文件路径。"
}

func (t *FileAnalyzeTool) Call(_ context.Context, input string) (string, error) {
	path := strings.TrimSpace(strings.Trim(input, `"`))
	if path == "" {
		return "", fmt.Errorf("请提供文件路径")
	}

	fi, err := os.Stat(path)
	if err != nil {
		return "", fmt.Errorf("无法访问文件: %w", err)
	}
	if fi.IsDir() {
		return "", fmt.Errorf("路径是目录，请指定文件")
	}

	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("打开文件失败: %w", err)
	}
	defer f.Close()

	buf := make([]byte, 256)
	n, _ := io.ReadFull(f, buf)
	sample := buf[:n]

	md5h := md5.New()
	sha := sha256.New()
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return "", err
	}
	tr := io.TeeReader(io.LimitReader(f, 50<<20), io.MultiWriter(md5h, sha))
	written, _ := io.Copy(io.Discard, tr)

	md5Sum := hex.EncodeToString(md5h.Sum(nil))
	shaSum := hex.EncodeToString(sha.Sum(nil))

	hexPreview := hex.EncodeToString(sample)
	if len(hexPreview) > 512 {
		hexPreview = hexPreview[:512] + "..."
	}

	result := map[string]any{
		"path":               path,
		"size_bytes":         fi.Size(),
		"size_read_for_hash": written,
		"mode":               fi.Mode().String(),
		"mod_time":           fi.ModTime().UTC().Format("2006-01-02T15:04:05Z"),
		"md5":                md5Sum,
		"sha256":             shaSum,
		"first_bytes_hex":    hexPreview,
		"magic_hint":         guessMagic(sample),
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}

func guessMagic(b []byte) string {
	if len(b) == 0 {
		return "empty"
	}
	switch {
	case len(b) >= 4 && b[0] == 0x7f && b[1] == 'E' && b[2] == 'L' && b[3] == 'F':
		return "ELF"
	case len(b) >= 2 && b[0] == 'M' && b[1] == 'Z':
		return "PE/MS-DOS (MZ)"
	case len(b) >= 4 && b[0] == 0x50 && b[1] == 0x4b && (b[2] == 0x03 || b[2] == 0x05 || b[2] == 0x07):
		return "ZIP/JAR/Office Open XML"
	case len(b) >= 8 && string(b[0:8]) == "\x89PNG\r\n\x1a\n":
		return "PNG"
	case len(b) >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF:
		return "JPEG"
	case len(b) >= 4 && string(b[0:4]) == "%PDF":
		return "PDF"
	case len(b) >= 5 && string(b[0:5]) == "<?xml":
		return "XML (text)"
	default:
		return "unknown/binary"
	}
}
