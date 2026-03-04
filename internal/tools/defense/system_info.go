package defense

import (
	"context"
	"encoding/json"
	"os"
	"runtime"
)

type SystemInfoTool struct{}

func (t *SystemInfoTool) Name() string { return "SystemInfo" }
func (t *SystemInfoTool) Description() string {
	return "获取当前系统信息（操作系统、架构、主机名、CPU 核心数等）"
}

func (t *SystemInfoTool) Call(_ context.Context, _ string) (string, error) {
	hostname, _ := os.Hostname()
	wd, _ := os.Getwd()

	result := map[string]any{
		"os":        runtime.GOOS,
		"arch":      runtime.GOARCH,
		"hostname":  hostname,
		"cpus":      runtime.NumCPU(),
		"goroutines": runtime.NumGoroutine(),
		"go_version": runtime.Version(),
		"cwd":       wd,
		"pid":       os.Getpid(),
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}
