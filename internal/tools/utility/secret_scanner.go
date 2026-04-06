package utility

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// SecretScannerTool 在目录中递归扫描文本文件中的疑似密钥/令牌模式。
type SecretScannerTool struct{}

func (t *SecretScannerTool) Name() string { return "secret_scanner" }

func (t *SecretScannerTool) Description() string {
	return "扫描目录下文本文件中的疑似密钥（AWS、私钥、Slack、GitHub 等正则模式）。输入：目录路径；大文件与二进制会跳过。"
}

type patternDef struct {
	Name    string
	Pattern *regexp.Regexp
}

var secretPatterns = []patternDef{
	{"aws_access_key", regexp.MustCompile(`AKIA[0-9A-Z]{16}`)},
	{"aws_secret_like", regexp.MustCompile(`(?i)aws[_-]?secret[_-]?access[_-]?key['\"]?\s*[:=]\s*['\"]?([A-Za-z0-9/+=]{40})`)},
	{"private_key_block", regexp.MustCompile(`-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----`)},
	{"github_token", regexp.MustCompile(`gh[pousr]_[A-Za-z0-9_]{36,255}`)},
	{"slack_token", regexp.MustCompile(`xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*`)},
	{"generic_api_key", regexp.MustCompile(`(?i)(api[_-]?key|apikey|secret[_-]?key)['\"]?\s*[:=]\s*['\"]?([a-z0-9_\-]{20,})`)},
	{"jwt_like", regexp.MustCompile(`eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}`)},
}

func (t *SecretScannerTool) Call(_ context.Context, input string) (string, error) {
	root := strings.TrimSpace(strings.Trim(input, `"`))
	if root == "" {
		return "", fmt.Errorf("请提供目录路径")
	}
	st, err := os.Stat(root)
	if err != nil {
		return "", fmt.Errorf("无法访问路径: %w", err)
	}
	if !st.IsDir() {
		return "", fmt.Errorf("请提供目录路径")
	}

	findings := []map[string]any{}
	const maxFile = 512 * 1024
	const maxFindings = 200

	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || len(findings) >= maxFindings {
			return nil
		}
		if d.IsDir() {
			base := d.Name()
			if base == ".git" || base == "node_modules" || base == "vendor" {
				return filepath.SkipDir
			}
			return nil
		}

		info, err := d.Info()
		if err != nil || info.Size() == 0 || info.Size() > maxFile {
			return nil
		}

		lower := strings.ToLower(path)
		switch {
		case strings.HasSuffix(lower, ".png"), strings.HasSuffix(lower, ".jpg"), strings.HasSuffix(lower, ".exe"),
			strings.HasSuffix(lower, ".dll"), strings.HasSuffix(lower, ".zip"), strings.HasSuffix(lower, ".jar"):
			return nil
		}

		data, err := os.ReadFile(path)
		if err != nil {
			return nil
		}
		if isBinarySample(data) {
			return nil
		}
		text := string(data)

		for _, pd := range secretPatterns {
			if len(findings) >= maxFindings {
				break
			}
			for _, loc := range pd.Pattern.FindAllStringIndex(text, 8) {
				if len(findings) >= maxFindings {
					break
				}
				snippet := text[loc[0]:loc[1]]
				if len(snippet) > 120 {
					snippet = snippet[:120] + "..."
				}
				findings = append(findings, map[string]any{
					"file":    path,
					"rule":    pd.Name,
					"preview": redactMiddle(snippet),
				})
			}
		}
		return nil
	})

	result := map[string]any{
		"root":           root,
		"findings_count": len(findings),
		"findings":       findings,
		"note":           "结果已做部分脱敏；请人工复核误报。",
	}
	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}

func isBinarySample(b []byte) bool {
	if len(b) == 0 {
		return true
	}
	n := len(b)
	if n > 8000 {
		n = 8000
	}
	zeros := 0
	for i := 0; i < n; i++ {
		if b[i] == 0 {
			zeros++
		}
	}
	return float64(zeros)/float64(n) > 0.001
}

func redactMiddle(s string) string {
	r := []rune(s)
	if len(r) <= 12 {
		return string(r)
	}
	return string(r[:4]) + "…" + string(r[len(r)-4:])
}
