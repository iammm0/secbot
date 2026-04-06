package utility

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"regexp"
	"strings"
)

// LogAnalyzeTool 对日志文件做简单安全模式统计（失败登录、错误、可疑 IP）。
type LogAnalyzeTool struct{}

func (t *LogAnalyzeTool) Name() string { return "log_analyze" }

func (t *LogAnalyzeTool) Description() string {
	return "分析日志文件：统计失败登录、错误关键字、疑似 IP 出现次数。输入：日志文件路径。"
}

func (t *LogAnalyzeTool) Call(_ context.Context, input string) (string, error) {
	path := strings.TrimSpace(strings.Trim(input, `"`))
	if path == "" {
		return "", fmt.Errorf("请提供日志文件路径")
	}

	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("无法打开文件: %w", err)
	}
	defer f.Close()

	failPatterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)(authentication failed|login failed|failed password|invalid user|auth failure)`),
	}
	errPatterns := []*regexp.Regexp{
		regexp.MustCompile(`(?i)(\berror\b|\bfatal\b|\bexception\b|denied|forbidden)`),
	}
	ipRE := regexp.MustCompile(`\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b`)

	failHits := 0
	errHits := 0
	ipCount := make(map[string]int)
	lines := 0

	sc := bufio.NewScanner(f)
	const maxLine = 512 * 1024
	buf := make([]byte, maxLine)
	sc.Buffer(buf, maxLine)

	for sc.Scan() {
		lines++
		line := sc.Text()
		for _, re := range failPatterns {
			if re.MatchString(line) {
				failHits++
				break
			}
		}
		for _, re := range errPatterns {
			if re.MatchString(line) {
				errHits++
				break
			}
		}
		for _, ip := range ipRE.FindAllString(line, -1) {
			if net.ParseIP(ip) != nil {
				ipCount[ip]++
			}
		}
		if lines > 500000 {
			break
		}
	}
	if err := sc.Err(); err != nil {
		return "", fmt.Errorf("读取日志失败: %w", err)
	}

	topIPs := topN(ipCount, 15)

	result := map[string]any{
		"path":                  path,
		"lines_scanned":         lines,
		"failed_login_matches":  failHits,
		"error_keyword_matches": errHits,
		"unique_ips":            len(ipCount),
		"top_ips":               topIPs,
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}

func topN(m map[string]int, n int) []map[string]any {
	type kv struct {
		k string
		v int
	}
	var s []kv
	for k, v := range m {
		s = append(s, kv{k, v})
	}
	for i := 0; i < len(s); i++ {
		for j := i + 1; j < len(s); j++ {
			if s[j].v > s[i].v {
				s[i], s[j] = s[j], s[i]
			}
		}
	}
	if len(s) > n {
		s = s[:n]
	}
	out := make([]map[string]any, 0, len(s))
	for _, x := range s {
		out = append(out, map[string]any{"ip": x.k, "count": x.v})
	}
	return out
}
