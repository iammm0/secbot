package execgocli

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// RuntimeProbe runtime 段探活结果 / runtime probe.
type RuntimeProbe struct {
	URL         string `json:"url"`
	Reachable   bool   `json:"reachable"`
	StartedBy   string `json:"started_by,omitempty"`
	ReadyBody   string `json:"ready_body,omitempty"`
	ReadyCode   int    `json:"ready_status_code,omitempty"`
	AttemptNote string `json:"attempt_note,omitempty"`
}

// EnsureResult 是 ensure-running 的 data 形状 / ensure-running output.
type EnsureResult struct {
	ExecGo struct {
		URL         string `json:"url"`
		Reachable   bool   `json:"reachable"`
		StartedBy   string `json:"started_by,omitempty"` // already-up | docker-compose
		HealthBody  string `json:"health_body,omitempty"`
		HealthCode  int    `json:"health_status_code,omitempty"`
		AttemptNote string `json:"attempt_note,omitempty"`
	} `json:"execgo"`
	Runtime *RuntimeProbe `json:"runtime,omitempty"`
	Hints   []string      `json:"manual_hints,omitempty"`
}

// EnsureOptions 控制 ensure-running / options for ensure.
type EnsureOptions struct {
	WithRuntime   bool
	ComposeDir    string
	RuntimeImage  string
	RuntimeSource string
}

// EnsureRunning 探活 ExecGo，可选拉 compose；可选探活/尝试拉起 runtime。不保证一定启动成功；失败时填充 Hints / probes and optional compose.
func EnsureRunning(ctx context.Context, opts EnsureOptions) (*EnsureResult, error) {
	res := &EnsureResult{}
	base := BaseURL()
	res.ExecGo.URL = base

	hc := NewClient(base)
	hc.HTTP.Timeout = 5 * time.Second

	// 1) ExecGo
	_, hb, hcode, herr := hc.GetHealth(ctx)
	if herr == nil {
		res.ExecGo.Reachable = true
		res.ExecGo.StartedBy = "already-up"
		res.ExecGo.HealthCode = hcode
		res.ExecGo.HealthBody = string(hb)
	} else {
		res.ExecGo.Reachable = false
		res.ExecGo.HealthCode = hcode
		res.ExecGo.HealthBody = errString(hb, herr)
		// try docker compose
		compose := opts.ComposeDir
		if compose == "" {
			compose = os.Getenv(EnvComposeDir)
		}
		if compose != "" && hasDocker(ctx) {
			composeYML := filepath.Join(compose, "docker-compose.yml")
			if st, e := os.Stat(composeYML); e == nil && !st.IsDir() {
				note, runErr := runDockerComposeUp(ctx, compose)
				res.ExecGo.AttemptNote = note
				if runErr == nil {
					time.Sleep(300 * time.Millisecond)
					_, b2, code2, err2 := hc.GetHealth(ctx)
					if err2 == nil {
						res.ExecGo.Reachable = true
						res.ExecGo.StartedBy = "docker-compose"
						res.ExecGo.HealthCode = code2
						res.ExecGo.HealthBody = string(b2)
					}
				}
			}
		}
	}

	if !res.ExecGo.Reachable {
		res.Hints = append(res.Hints, manualExecGoHint())
	}

	// 2) Runtime
	if !opts.WithRuntime {
		return res, nil
	}
	rtBase := RuntimeBaseURL()
	res.Runtime = &RuntimeProbe{URL: rtBase}
	body, code, perr := ProbeGET(ctx, nil, strings.TrimRight(rtBase, "/")+"/readyz")
	res.Runtime.ReadyCode = code
	res.Runtime.ReadyBody = body
	if perr == nil && code == 200 {
		res.Runtime.Reachable = true
		res.Runtime.StartedBy = "already-up"
		return res, nil
	}
	res.Runtime.Reachable = false

	rtImg := opts.RuntimeImage
	if rtImg == "" {
		rtImg = os.Getenv(EnvRuntimeImage)
	}
	// 可选：docker 拉 runtime
	if hasDocker(ctx) && rtImg != "" {
		name := "execgocli-runtime-" + randomSuffix()
		hostPort := "18080"
		if u := strings.TrimPrefix(rtBase, "http://"); u != "" {
			if i := strings.LastIndex(u, ":"); i > 0 {
				hostPort = u[i+1:]
			}
		}
		args := []string{
			"run", "-d", "--name", name,
			"-p", hostPort + ":8080",
			"-v", os.TempDir() + "/execgocli-runtime-data:/data",
			rtImg,
		}
		cmd := exec.CommandContext(ctx, "docker", args...)
		out, err := cmd.CombinedOutput()
		_ = out
		if err == nil {
			res.Runtime.AttemptNote = "docker run: " + string(out)
			time.Sleep(400 * time.Millisecond)
			b2, c2, e2 := ProbeGET(ctx, nil, strings.TrimRight(rtBase, "/")+"/readyz")
			res.Runtime.ReadyCode = c2
			res.Runtime.ReadyBody = b2
			if e2 == nil && c2 == 200 {
				res.Runtime.Reachable = true
				res.Runtime.StartedBy = "docker"
			}
		} else {
			res.Runtime.AttemptNote = fmt.Sprintf("docker run failed: %v — %s", err, string(out))
		}
	}

	if !res.Runtime.Reachable {
		rtsrc := opts.RuntimeSource
		if rtsrc == "" {
			rtsrc = os.Getenv(EnvRuntimeSource)
		}
		res.Hints = append(res.Hints, manualRuntimeHint(rtBase, rtsrc))
	}

	return res, nil
}

func errString(b []byte, err error) string {
	if len(b) > 0 {
		if len(b) > 2000 {
			return string(b[:2000]) + "..."
		}
		return string(b)
	}
	if err != nil {
		return err.Error()
	}
	return ""
}

func hasDocker(ctx context.Context) bool {
	c := exec.CommandContext(ctx, "docker", "version")
	c.Stdout = nil
	c.Stderr = nil
	return c.Run() == nil
}

func runDockerComposeUp(ctx context.Context, dir string) (string, error) {
	// 优先新 compose 子命令
	cmd := exec.CommandContext(ctx, "docker", "compose", "-f", filepath.Join(dir, "docker-compose.yml"), "up", "-d", "--build")
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err == nil {
		return "docker compose up -d: ok", nil
	}
	// 回退 docker-compose
	cmd2 := exec.CommandContext(ctx, "docker-compose", "-f", filepath.Join(dir, "docker-compose.yml"), "up", "-d", "--build")
	cmd2.Dir = dir
	out2, err2 := cmd2.CombinedOutput()
	if err2 == nil {
		return "docker-compose up -d: ok", nil
	}
	return "compose failed: " + string(out) + " | " + string(out2), err2
}

func manualExecGoHint() string {
	return "手动启动 ExecGo: 在 execgo 仓库根目录执行 `go run ./cmd/execgo` 或 `docker compose up -d`；默认监听 EXECGO_ADDR=:8080。环境变量: EXECGO_URL 指向本机/远端。"
}

func manualRuntimeHint(baseURL, sourceRoot string) string {
	s := "手动启动 execgo-runtime: 将 ExecGo 进程配置 EXECGO_RUNTIME_URL 与此处一致（默认 " + DefaultRuntimeBaseURL + "）。\n" +
		"  Docker 示例: `docker build -t execgo-runtime:local .` 然后 `docker run -d -p 18080:8080 -v /tmp/eg-rt:/data execgo-runtime:local`\n" +
		"  Cargo 示例: `cargo run -- serve --listen-addr 127.0.0.1:18080`（在 execgo-runtime 目录）"
	if sourceRoot != "" {
		s += "\n  已指定 EXECGO_RUNTIME_SOURCE=" + sourceRoot
	}
	return s
}

func randomSuffix() string {
	return fmt.Sprintf("%d", time.Now().UnixNano()%100_000_000)
}
