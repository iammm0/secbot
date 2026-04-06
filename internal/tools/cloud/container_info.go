package cloud

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
	"strings"
)

// ContainerInfoTool 检测是否运行在容器或 Kubernetes 环境中。
type ContainerInfoTool struct{}

func (t *ContainerInfoTool) Name() string { return "container_info" }

func (t *ContainerInfoTool) Description() string {
	return "检测容器运行环境：Docker（/.dockerenv、cgroup）、Kubernetes（环境变量等）。无输入。"
}

func (t *ContainerInfoTool) Call(_ context.Context, _ string) (string, error) {
	info := map[string]any{
		"os":   runtime.GOOS,
		"arch": runtime.GOARCH,
	}

	dockerEnv := false
	if runtime.GOOS != "windows" {
		if _, err := os.Stat("/.dockerenv"); err == nil {
			dockerEnv = true
		}
	}
	info["dockerenv_file"] = dockerEnv

	cgroupHint := ""
	if runtime.GOOS != "windows" {
		if b, err := os.ReadFile("/proc/self/cgroup"); err == nil {
			s := string(b)
			cgroupHint = s
			if strings.Contains(s, "docker") {
				info["cgroup_docker"] = true
			}
			if strings.Contains(s, "kubepods") || strings.Contains(s, "kubernetes") {
				info["cgroup_kubernetes"] = true
			}
		}
	}
	if cgroupHint != "" && len(cgroupHint) > 800 {
		cgroupHint = cgroupHint[:800] + "..."
	}
	info["cgroup_sample"] = cgroupHint

	k8sVars := []string{
		"KUBERNETES_SERVICE_HOST",
		"KUBERNETES_SERVICE_PORT",
		"KUBERNETES_PORT",
	}
	k8sDetected := false
	k8sFound := map[string]string{}
	for _, k := range k8sVars {
		if v := os.Getenv(k); v != "" {
			k8sDetected = true
			k8sFound[k] = v
		}
	}
	info["kubernetes_env_detected"] = k8sDetected
	if len(k8sFound) > 0 {
		info["kubernetes_env"] = k8sFound
	}

	// 常见容器/编排相关变量
	for _, k := range []string{"container", "Container_Name"} {
		if v := os.Getenv(k); v != "" {
			info["extra_"+strings.ToLower(k)] = v
		}
	}

	inContainer := dockerEnv || k8sDetected
	if cg, ok := info["cgroup_docker"].(bool); ok && cg {
		inContainer = true
	}
	if cg, ok := info["cgroup_kubernetes"].(bool); ok && cg {
		inContainer = true
	}
	info["likely_container_or_k8s"] = inContainer

	out, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return "", fmt.Errorf("序列化失败: %w", err)
	}
	return string(out), nil
}
