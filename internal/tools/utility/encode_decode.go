package utility

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
)

type EncodeDecodeTool struct{}

func (t *EncodeDecodeTool) Name() string { return "EncodeDecode" }
func (t *EncodeDecodeTool) Description() string {
	return "编码/解码工具。格式: <操作> <内容>。操作: base64-encode, base64-decode, url-encode, url-decode, hex-encode, hex-decode"
}

func (t *EncodeDecodeTool) Call(_ context.Context, input string) (string, error) {
	input = strings.TrimSpace(input)
	parts := strings.SplitN(input, " ", 2)
	if len(parts) < 2 {
		return "", fmt.Errorf("格式: <操作> <内容>。操作: base64-encode, base64-decode, url-encode, url-decode, hex-encode, hex-decode")
	}

	op := strings.ToLower(parts[0])
	content := parts[1]
	var result string
	var err error

	switch op {
	case "base64-encode", "b64e":
		result = base64.StdEncoding.EncodeToString([]byte(content))
	case "base64-decode", "b64d":
		data, e := base64.StdEncoding.DecodeString(content)
		if e != nil {
			return "", fmt.Errorf("Base64 解码失败: %w", e)
		}
		result = string(data)
	case "url-encode", "urle":
		result = url.QueryEscape(content)
	case "url-decode", "urld":
		result, err = url.QueryUnescape(content)
		if err != nil {
			return "", fmt.Errorf("URL 解码失败: %w", err)
		}
	case "hex-encode", "hexe":
		result = hex.EncodeToString([]byte(content))
	case "hex-decode", "hexd":
		data, e := hex.DecodeString(content)
		if e != nil {
			return "", fmt.Errorf("Hex 解码失败: %w", e)
		}
		result = string(data)
	default:
		return "", fmt.Errorf("未知操作: %s", op)
	}

	out, _ := json.MarshalIndent(map[string]string{
		"operation": op,
		"input":     content,
		"output":    result,
	}, "", "  ")
	return string(out), nil
}
