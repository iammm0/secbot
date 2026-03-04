package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"secbot/config"
	"secbot/internal/session"
	"secbot/internal/tools"
	"secbot/pkg/logger"

	"github.com/joho/godotenv"
)

const banner = `
 ____            ____        _
/ ___|  ___  ___| __ )  ___ | |_
\___ \ / _ \/ __|  _ \ / _ \| __|
 ___) |  __/ (__| |_) | (_) | |_
|____/ \___|\___|____/ \___/ \__|

SecBot - AI 安全测试机器人 (Go)
输入 /help 查看帮助，Ctrl+C 退出
`

func main() {
	_ = godotenv.Load()

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		fmt.Fprintf(os.Stderr, "配置错误: %v\n", err)
		fmt.Fprintf(os.Stderr, "请检查 .env 文件或设置环境变量\n")
		os.Exit(1)
	}

	if err := logger.Init(cfg.LogLevel, cfg.LogFile); err != nil {
		fmt.Fprintf(os.Stderr, "日志初始化失败: %v\n", err)
	}
	defer logger.Close()

	fmt.Print(banner)
	fmt.Printf("模型: %s (%s)\n\n", cfg.ModelName, cfg.LLMProvider)

	sess, err := session.NewSession(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "初始化失败: %v\n", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		fmt.Println("\n再见！")
		cancel()
		os.Exit(0)
	}()

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for {
		fmt.Print("\033[36msecbot>\033[0m ")
		if !scanner.Scan() {
			break
		}

		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}

		if handleCommand(input, sess) {
			continue
		}

		fmt.Println("\033[33m思考中...\033[0m")
		resp, err := sess.Handle(ctx, input)
		if err != nil {
			fmt.Printf("\033[31m错误: %v\033[0m\n", err)
			continue
		}

		fmt.Println()
		fmt.Println(resp)
		fmt.Println()
	}
}

func handleCommand(input string, sess *session.Session) bool {
	switch {
	case input == "/help" || input == "/h":
		printHelp()
		return true
	case input == "/tools":
		names := sess.ToolNames()
		fmt.Println("\n可用工具:")
		for _, name := range names {
			fmt.Printf("  - %s\n", name)
		}
		fmt.Println()
		return true
	case input == "/clear":
		fmt.Print("\033[2J\033[H")
		fmt.Print(banner)
		return true
	case input == "/exit" || input == "/quit" || input == "/q":
		fmt.Println("再见！")
		os.Exit(0)
		return true
	case input == "/version":
		fmt.Println("SecBot v2.0.0 (Go)")
		return true
	}
	return false
}

func printHelp() {
	registry := tools.SecurityRegistry()
	fmt.Printf(`
SecBot 帮助
===========

命令:
  /help, /h     显示此帮助
  /tools        列出可用安全工具
  /clear        清屏
  /version      版本信息
  /exit, /q     退出

使用示例:
  扫描 example.com 的开放端口
  检查 example.com 的 SSL 证书
  分析 example.com 的 HTTP 安全头
  查询 8.8.8.8 的地理位置
  对 example.com 做 DNS 查询
  计算 "hello" 的 SHA256 哈希

可用工具 (%d):
`, len(registry.Names()))
	for _, name := range registry.Names() {
		fmt.Printf("  - %s\n", name)
	}
	fmt.Println()
}
