package defense

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

// SelfVulnScanTool 扫描当前用户可写目录下的危险权限与可疑文件。
type SelfVulnScanTool struct{}

func (t *SelfVulnScanTool) Name() string { return "self_vuln_scan" }

func (t *SelfVulnScanTool) Description() string {
	return "检查本机常见风险：工作目录下全局可写文件（类 Unix）、异常扩展名脚本、过宽目录权限摘要。输入可留空。"
}

func (t *SelfVulnScanTool) Call(_ context.Context, _ string) (string, error) {
	wd, err := os.Getwd()
	if err != nil {
		wd = "."
	}

	worldWritable := []string{}
	suspicious := []string{}
	dirPermIssues := []string{}

	_ = filepath.WalkDir(wd, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if d.Name() == ".git" || d.Name() == "node_modules" || d.Name() == "vendor" {
				return filepath.SkipDir
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			if runtime.GOOS != "windows" {
				mode := info.Mode().Perm()
				if mode&0o002 != 0 && path != wd {
					dirPermIssues = append(dirPermIssues, fmt.Sprintf("%s (%s)", path, mode))
				}
			}
			return nil
		}

		info, err := d.Info()
		if err != nil || info.Size() > 20<<20 {
			return nil
		}

		lower := strings.ToLower(path)
		if strings.HasSuffix(lower, ".sh") || strings.HasSuffix(lower, ".ps1") || strings.HasSuffix(lower, ".bat") {
			if info.Mode().Perm()&0o111 != 0 && runtime.GOOS != "windows" {
				suspicious = append(suspicious, path)
			}
		}

		if runtime.GOOS != "windows" {
			mode := info.Mode().Perm()
			if mode&0o002 != 0 {
				worldWritable = append(worldWritable, path)
			}
		}

		if len(worldWritable) > 200 {
			return filepath.SkipAll
		}
		return nil
	})

	result := map[string]any{
		"scan_root":               wd,
		"world_writable_files":    trimList(worldWritable, 80),
		"executable_scripts_hint": trimList(suspicious, 40),
		"world_writable_dirs":     trimList(dirPermIssues, 40),
		"note":                    "结果为启发式；Windows ACL 需用专用工具进一步分析。",
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}

func trimList(s []string, n int) []string {
	if len(s) <= n {
		return s
	}
	return append(s[:n], fmt.Sprintf("... 另有 %d 条未显示", len(s)-n))
}
