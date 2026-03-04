package utility

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type IPGeoTool struct{}

func (t *IPGeoTool) Name() string { return "IPGeo" }
func (t *IPGeoTool) Description() string {
	return "查询 IP 地址的地理位置信息。输入: IP 地址（留空查询本机公网 IP）"
}

func (t *IPGeoTool) Call(ctx context.Context, input string) (string, error) {
	ip := strings.TrimSpace(input)
	url := "http://ip-api.com/json/"
	if ip != "" {
		url += ip
	}

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求失败: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("读取响应失败: %w", err)
	}

	var data map[string]any
	if err := json.Unmarshal(body, &data); err != nil {
		return string(body), nil
	}

	out, _ := json.MarshalIndent(data, "", "  ")
	return string(out), nil
}
