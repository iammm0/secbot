package web

import (
	"context"
	"io"
	"net/http"
)

// briefResp 为 param_fuzzer / ssrf_detect 共用的轻量响应摘要。
type briefResp struct {
	status  int
	bodyLen int
}

func fetchBrief(ctx context.Context, client *http.Client, target string) (briefResp, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return briefResp{}, err
	}
	req.Header.Set("User-Agent", "SecBot-WebProbe/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return briefResp{}, err
	}
	defer resp.Body.Close()
	n, _ := io.Copy(io.Discard, io.LimitReader(resp.Body, 512*1024))
	return briefResp{status: resp.StatusCode, bodyLen: int(n)}, nil
}
