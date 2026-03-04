package utility

import (
	"context"
	"crypto/md5"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
)

type HashTool struct{}

func (t *HashTool) Name() string { return "Hash" }
func (t *HashTool) Description() string {
	return "计算字符串的各种哈希值（MD5、SHA1、SHA256、SHA512）。输入: 要哈希的字符串"
}

func (t *HashTool) Call(_ context.Context, input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("请提供要哈希的字符串")
	}

	data := []byte(input)
	md5Sum := md5.Sum(data)
	sha1Sum := sha1.Sum(data)
	sha256Sum := sha256.Sum256(data)
	sha512Sum := sha512.Sum512(data)

	result := map[string]string{
		"input":  input,
		"md5":    hex.EncodeToString(md5Sum[:]),
		"sha1":   hex.EncodeToString(sha1Sum[:]),
		"sha256": hex.EncodeToString(sha256Sum[:]),
		"sha512": hex.EncodeToString(sha512Sum[:]),
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}
