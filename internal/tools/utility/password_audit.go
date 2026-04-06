package utility

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"unicode"
)

// PasswordAuditTool 评估密码强度（长度、复杂度、熵、常见弱模式）。
type PasswordAuditTool struct{}

func (t *PasswordAuditTool) Name() string { return "password_audit" }

func (t *PasswordAuditTool) Description() string {
	return "评估密码强度：长度、字符类型、香农熵、常见弱口令模式。输入：待评估字符串（注意环境可能记录输入）。"
}

func (t *PasswordAuditTool) Call(_ context.Context, input string) (string, error) {
	pw := input
	if pw == "" {
		return "", fmt.Errorf("请提供密码字符串")
	}

	var lower, upper, digit, symbol, space int
	for _, r := range pw {
		switch {
		case unicode.IsLower(r):
			lower++
		case unicode.IsUpper(r):
			upper++
		case unicode.IsDigit(r):
			digit++
		case unicode.IsSpace(r):
			space++
		default:
			symbol++
		}
	}

	entropy := shannonEntropy(pw)
	score := 0
	if len(pw) >= 12 {
		score += 2
	} else if len(pw) >= 8 {
		score += 1
	}
	kinds := 0
	if lower > 0 {
		kinds++
	}
	if upper > 0 {
		kinds++
	}
	if digit > 0 {
		kinds++
	}
	if symbol+space > 0 {
		kinds++
	}
	score += kinds
	if entropy >= 3.5 {
		score += 2
	} else if entropy >= 2.5 {
		score += 1
	}

	issues := []string{}
	if isCommonWeak(pw) {
		issues = append(issues, "匹配常见弱口令/键盘序列模式")
		score -= 3
	}
	if len(pw) < 8 {
		issues = append(issues, "长度过短（建议至少 12 位）")
	}
	if kinds < 3 {
		issues = append(issues, "字符类型多样性不足")
	}

	rating := "弱"
	switch {
	case score >= 8:
		rating = "强"
	case score >= 5:
		rating = "中"
	}

	result := map[string]any{
		"length":           len([]rune(pw)),
		"lower":            lower,
		"upper":            upper,
		"digit":            digit,
		"symbol_and_space": symbol + space,
		"shannon_entropy":  roundFloat(entropy, 3),
		"score_heuristic":  score,
		"rating":           rating,
		"issues":           issues,
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}

func shannonEntropy(s string) float64 {
	if len(s) == 0 {
		return 0
	}
	freq := make(map[rune]int)
	for _, r := range s {
		freq[r]++
	}
	n := float64(len([]rune(s)))
	var ent float64
	for _, c := range freq {
		p := float64(c) / n
		ent -= p * math.Log2(p)
	}
	return ent
}

func roundFloat(x float64, prec int) float64 {
	p := math.Pow10(prec)
	return math.Round(x*p) / p
}

func isCommonWeak(pw string) bool {
	p := strings.ToLower(pw)
	weak := []string{
		"password", "123456", "qwerty", "admin", "letmein", "welcome",
		"password123", "12345678", "iloveyou", "monkey", "sunshine",
	}
	for _, w := range weak {
		if strings.Contains(p, w) {
			return true
		}
	}
	// 简单键盘序列
	if strings.Contains(p, "qwerty") || strings.Contains(p, "asdf") || strings.Contains(p, "12345") {
		return true
	}
	return false
}
