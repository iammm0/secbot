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
	"secbot/internal/cli"
	"secbot/internal/models"
	"secbot/internal/session"
	"secbot/internal/tools"
	"secbot/pkg/logger"

	"github.com/fatih/color"
	"github.com/joho/godotenv"
	"github.com/spf13/cobra"
)

const version = "2.0.0"

const banner = `
 ____            ____        _
/ ___|  ___  ___| __ )  ___ | |_
\___ \ / _ \/ __|  _ \ / _ \| __|
 ___) |  __/ (__| |_) | (_) | |_
|____/ \___|\___|____/ \___/ \__|

SecBot - AI 安全测试机器人 (Go)
`

var (
	agentFlag string
	askFlag   bool
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "secbot [message]",
		Short: "SecBot — 开源自动化安全测试助手",
		Long: `SecBot — AI 驱动的自动化安全测试 CLI。

无子命令时启动交互式会话；传入 MESSAGE 参数则执行单条任务后退出。

示例:
  secbot                                # 进入交互模式
  secbot "扫描 192.168.1.1 的开放端口"     # 单次任务
  secbot --ask "什么是 XSS 攻击？"        # 问答模式
  secbot --agent superhackbot            # 使用专家模式`,
		Args: cobra.MaximumNArgs(1),
		Run:  runMain,
	}

	rootCmd.Flags().StringVarP(&agentFlag, "agent", "a", "secbot-cli", "智能体类型: secbot-cli / superhackbot")
	rootCmd.Flags().BoolVar(&askFlag, "ask", false, "使用 Ask 模式（仅问答，不执行工具）")

	rootCmd.AddCommand(modelCmd())
	rootCmd.AddCommand(serverCmd())
	rootCmd.AddCommand(versionCmd())

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func runMain(cmd *cobra.Command, args []string) {
	_ = godotenv.Load()

	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		color.Red("配置错误: %v", err)
		color.Red("请检查 .env 文件或设置环境变量")
		os.Exit(1)
	}

	if err := logger.Init(cfg.LogLevel, cfg.LogFile); err != nil {
		fmt.Fprintf(os.Stderr, "日志初始化失败: %v\n", err)
	}
	defer logger.Close()

	sess, err := session.NewSession(cfg)
	if err != nil {
		color.Red("初始化失败: %v", err)
		os.Exit(1)
	}

	printer := cli.NewEventPrinter()
	sess.Bus().OnAll(printer.Handle)

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

	mode := "agent"
	if askFlag {
		mode = "ask"
	}

	if len(args) > 0 {
		runOnce(ctx, sess, args[0], mode)
	} else {
		runInteractive(ctx, sess, mode)
	}
}

func runOnce(ctx context.Context, sess *session.Session, message, mode string) {
	opts := &models.ProcessOptions{
		ForceQA:        mode == "ask",
		ForceAgentFlow: mode == "agent",
		AgentType:      agentFlag,
	}
	resp, err := sess.HandleWithOptions(ctx, message, opts)
	if err != nil {
		color.Red("处理出错: %v", err)
		os.Exit(1)
	}
	fmt.Println()
	fmt.Println(resp)
}

func runInteractive(ctx context.Context, sess *session.Session, mode string) {
	fmt.Print(banner)
	color.Cyan("模型: %s (%s)", sess.ModelInfo())
	fmt.Println("输入你的问题或任务，输入 exit/quit 退出，输入 /help 查看帮助。")
	fmt.Println()

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for {
		color.New(color.FgGreen, color.Bold).Print(">>> ")
		if !scanner.Scan() {
			break
		}

		input := strings.TrimSpace(scanner.Text())
		if input == "" {
			continue
		}

		if input == "exit" || input == "quit" || input == "/exit" || input == "/quit" {
			fmt.Println("再见！")
			break
		}

		if handleSlashCommand(input, sess) {
			continue
		}

		opts := &models.ProcessOptions{
			ForceQA:        mode == "ask",
			ForceAgentFlow: mode == "agent",
			AgentType:      agentFlag,
		}

		resp, err := sess.HandleWithOptions(ctx, input, opts)
		if err != nil {
			color.Red("处理出错: %v", err)
			continue
		}

		fmt.Println()
		fmt.Println(resp)
		fmt.Println()
	}
}

func handleSlashCommand(input string, sess *session.Session) bool {
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
	case input == "/model" || input == "model":
		color.Yellow("模型切换功能即将实现")
		return true
	case input == "/version":
		fmt.Printf("SecBot v%s (Go)\n", version)
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
  /model        切换推理后端/模型
  /clear        清屏
  /version      版本信息
  exit, quit    退出

使用示例:
  扫描 example.com 的开放端口
  检查 example.com 的 SSL 证书
  分析 example.com 的 HTTP 安全头
  查询 8.8.8.8 的地理位置

可用工具 (%d):
`, len(registry.Names()))
	for _, name := range registry.Names() {
		fmt.Printf("  - %s\n", name)
	}
	fmt.Println()
}

func modelCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "model",
		Short: "交互式选择推理后端与模型",
		Run: func(cmd *cobra.Command, args []string) {
			color.Yellow("模型切换功能即将实现")
		},
	}
}

func serverCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "server",
		Short: "启动 HTTP API 服务",
		Run: func(cmd *cobra.Command, args []string) {
			color.Yellow("HTTP API 服务即将实现")
		},
	}
	cmd.Flags().StringP("host", "H", "0.0.0.0", "监听地址")
	cmd.Flags().IntP("port", "p", 8000, "监听端口")
	return cmd
}

func versionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "显示版本信息",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("SecBot v%s (Go)\n", version)
		},
	}
}
