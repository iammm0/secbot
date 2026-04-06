package osint

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

// CredentialLeakTool 使用 Have I Been Pwned v3 API 检查邮箱是否在已知泄露中出现。
type CredentialLeakTool struct{}

func (t *CredentialLeakTool) Name() string { return "credential_leak" }

func (t *CredentialLeakTool) Description() string {
	return "检查邮箱是否在已知数据泄露中出现（Have I Been Pwned）。需环境变量 HIBP_API_KEY（与官网 API 密钥一致）。"
}

func (t *CredentialLeakTool) Call(ctx context.Context, input string) (string, error) {
	apiKey := strings.TrimSpace(os.Getenv("HIBP_API_KEY"))
	if apiKey == "" {
		// 官方 v3 需要 API Key；若用户仅设置了旧名，尝试兼容
		apiKey = strings.TrimSpace(os.Getenv("HAVEIBEENPWNED_API_KEY"))
	}
	if apiKey == "" {
		return "", fmt.Errorf("未设置 HIBP_API_KEY（HIBP v3 需要官网申请的 API 密钥）")
	}

	email := strings.TrimSpace(input)
	if email == "" || !strings.Contains(email, "@") {
		return "", fmt.Errorf("请提供有效邮箱地址")
	}

	path := url.PathEscape(email)
	u := "https://haveibeenpwned.com/api/v3/breachedaccount/" + path + "?truncateResponse=false"

	client := &http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("hibp-api-key", apiKey)
	req.Header.Set("User-Agent", "SecBot/1.0 (security-tool; +https://github.com/)")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	switch resp.StatusCode {
	case http.StatusOK:
		return string(body), nil
	case http.StatusNotFound:
		return "未发现该邮箱出现在已知泄露列表中（或尚未收录）。", nil
	case http.StatusTooManyRequests:
		return "", fmt.Errorf("请求过于频繁，请稍后再试（HIBP 限流）")
	case http.StatusUnauthorized:
		return "", fmt.Errorf("API 密钥无效或未授权（HTTP 401）")
	default:
		return fmt.Sprintf("HTTP %d: %s", resp.StatusCode, truncateStr(string(body), 2000)), nil
	}
}
