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

// DependencyAuditTool 读取常见依赖清单并汇总模块/包信息。
type DependencyAuditTool struct{}

func (t *DependencyAuditTool) Name() string { return "dependency_audit" }

func (t *DependencyAuditTool) Description() string {
	return "分析依赖清单文件（go.mod、package.json、requirements.txt）：提取模块名与依赖列表。输入：清单文件路径。"
}

func (t *DependencyAuditTool) Call(_ context.Context, input string) (string, error) {
	path := strings.TrimSpace(strings.Trim(input, `"`))
	if path == "" {
		return "", fmt.Errorf("请提供清单文件路径")
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取文件失败: %w", err)
	}

	base := strings.ToLower(filepath.Base(path))
	result := map[string]any{"file": path, "kind": base}

	switch base {
	case "go.mod":
		result["summary"] = parseGoMod(string(data))
	case "package.json":
		result["summary"] = parsePackageJSON(data)
	case "requirements.txt":
		result["summary"] = parseRequirementsTxt(string(data))
	default:
		return "", fmt.Errorf("不支持的文件类型（需要 go.mod、package.json 或 requirements.txt）")
	}

	out, _ := json.MarshalIndent(result, "", "  ")
	return string(out), nil
}

func parseGoMod(s string) map[string]any {
	out := map[string]any{
		"requires": []map[string]string{},
	}
	lines := strings.Split(s, "\n")
	modRE := regexp.MustCompile(`^\s*module\s+(\S+)`)
	reqRE := regexp.MustCompile(`^\s*(\S+)\s+v[^\s]+`)
	inRequire := false
	for _, line := range lines {
		t := strings.TrimSpace(line)
		if mod := modRE.FindStringSubmatch(line); len(mod) == 2 {
			out["module"] = mod[1]
		}
		if strings.HasPrefix(t, "require (") || t == "require (" {
			inRequire = true
			continue
		}
		if inRequire && strings.HasPrefix(t, ")") {
			inRequire = false
			continue
		}
		if strings.HasPrefix(t, "require ") && !strings.Contains(t, "(") {
			if m := reqRE.FindStringSubmatch(line); len(m) == 2 {
				out["requires"] = append(out["requires"].([]map[string]string), map[string]string{"module": m[1]})
			}
			continue
		}
		if inRequire {
			if m := reqRE.FindStringSubmatch(line); len(m) == 2 {
				out["requires"] = append(out["requires"].([]map[string]string), map[string]string{"module": m[1]})
			}
		}
	}
	return out
}

func parsePackageJSON(data []byte) map[string]any {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return map[string]any{"parse_error": err.Error()}
	}
	out := map[string]any{}
	if v, ok := raw["name"]; ok {
		var name string
		_ = json.Unmarshal(v, &name)
		out["name"] = name
	}
	for _, key := range []string{"dependencies", "devDependencies", "peerDependencies", "optionalDependencies"} {
		if v, ok := raw[key]; ok {
			var m map[string]string
			if json.Unmarshal(v, &m) == nil && len(m) > 0 {
				out[key] = m
			}
		}
	}
	return out
}

func parseRequirementsTxt(s string) map[string]any {
	deps := []map[string]string{}
	lines := strings.Split(s, "\n")
	lineRE := regexp.MustCompile(`^([A-Za-z0-9_.\-]+)\s*(.*)$`)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "-") {
			continue
		}
		parts := strings.SplitN(line, "#", 2)
		line = strings.TrimSpace(parts[0])
		if m := lineRE.FindStringSubmatch(line); len(m) >= 2 {
			deps = append(deps, map[string]string{"name": m[1], "spec": strings.TrimSpace(m[2])})
		}
	}
	return map[string]any{"requirements": deps, "count": len(deps)}
}
