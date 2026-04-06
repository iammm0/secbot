package cloud

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// CloudMetadataTool 检测云元数据端点是否可达（AWS / GCP / Azure 风格）。
type CloudMetadataTool struct{}

func (t *CloudMetadataTool) Name() string { return "cloud_metadata" }

func (t *CloudMetadataTool) Description() string {
	return "检查云实例元数据端点是否可访问（169.254.169.254 等）。输入为空则尝试全部，或输入 aws、gcp、azure 之一。"
}

func (t *CloudMetadataTool) Call(ctx context.Context, input string) (string, error) {
	input = strings.ToLower(strings.TrimSpace(input))
	targets := []string{"aws", "gcp", "azure"}
	if input != "" {
		if input != "aws" && input != "gcp" && input != "azure" {
			return "", fmt.Errorf("输入应为空或 aws、gcp、azure 之一")
		}
		targets = []string{input}
	}

	client := &http.Client{Timeout: 3 * time.Second}
	results := make([]map[string]any, 0, len(targets))

	for _, kind := range targets {
		r := map[string]any{"provider": kind, "reachable": false}
		switch kind {
		case "aws":
			u := "http://169.254.169.254/latest/meta-data/"
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
			if err != nil {
				r["error"] = err.Error()
				results = append(results, r)
				continue
			}
			resp, err := client.Do(req)
			if err != nil {
				r["error"] = err.Error()
				results = append(results, r)
				continue
			}
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 512))
			_ = resp.Body.Close()
			r["reachable"] = resp.StatusCode < 500
			r["status_code"] = resp.StatusCode
			r["endpoint"] = u
		case "gcp":
			u := "http://metadata.google.internal/computeMetadata/v1/instance/name"
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
			if err != nil {
				r["error"] = err.Error()
				results = append(results, r)
				continue
			}
			req.Header.Set("Metadata-Flavor", "Google")
			resp, err := client.Do(req)
			if err != nil {
				r["error"] = err.Error()
				results = append(results, r)
				continue
			}
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 256))
			_ = resp.Body.Close()
			r["reachable"] = resp.StatusCode == http.StatusOK
			r["status_code"] = resp.StatusCode
			r["endpoint"] = u
		case "azure":
			u := "http://169.254.169.254/metadata/instance?api-version=2021-02-01"
			req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
			if err != nil {
				r["error"] = err.Error()
				results = append(results, r)
				continue
			}
			req.Header.Set("Metadata", "true")
			resp, err := client.Do(req)
			if err != nil {
				r["error"] = err.Error()
				results = append(results, r)
				continue
			}
			_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 512))
			_ = resp.Body.Close()
			r["reachable"] = resp.StatusCode == http.StatusOK
			r["status_code"] = resp.StatusCode
			r["endpoint"] = u
		}
		results = append(results, r)
	}

	out, err := json.MarshalIndent(map[string]any{"results": results}, "", "  ")
	if err != nil {
		return "", err
	}
	return string(out), nil
}
