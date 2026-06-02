package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"secbot/config"
	"secbot/internal/cli"
	"secbot/internal/models"
	"secbot/internal/session"
	"secbot/pkg/event"
	"secbot/pkg/logger"

	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/fatih/color"
	"github.com/joho/godotenv"
	"github.com/spf13/cobra"
)

const version = "2.0.0"
const skillsFilePath = "data/skills.json"

const cliBanner = `
███████╗███████╗ ██████╗██████╗  ██████╗ ████████╗
██╔════╝██╔════╝██╔════╝██╔══██╗██╔═══██╗╚══██╔══╝
███████╗█████╗  ██║     ██████╔╝██║   ██║   ██║
╚════██║██╔══╝  ██║     ██╔══██╗██║   ██║   ██║
███████║███████╗╚██████╗██████╔╝╚██████╔╝   ██║
╚══════╝╚══════╝ ╚═════╝╚═════╝  ╚═════╝    ╚═╝
`

type slashCommandSpec struct {
	Command     string
	Description string
	Local       bool
}

var (
	agentFlag string
	askFlag   bool

	slashCommandSpecs = []slashCommandSpec{
		{Command: "/help", Description: "显示命令列表", Local: true},
		{Command: "/model", Description: "切换推理后端/模型（待实现）", Local: true},
		{Command: "/agent", Description: "切换智能体（default / super）", Local: false},
		{Command: "/ask", Description: "仅问答不执行工具（Ask 模式）", Local: false},
		{Command: "/plan", Description: "仅生成计划（不执行）", Local: false},
		{Command: "/start", Description: "执行计划", Local: false},
		{Command: "/accept", Description: "确认敏感操作（superhackbot）", Local: false},
		{Command: "/reject", Description: "拒绝敏感操作（superhackbot）", Local: false},
		{Command: "/tools", Description: "列出可用安全工具", Local: true},
		{Command: "/skill", Description: "新增/查看自定义技能", Local: true},
		{Command: "/doctor", Description: "检查环境变量与模型配置", Local: true},
		{Command: "/env", Description: "检查环境变量与模型配置", Local: true},
		{Command: "/clear", Description: "清空会话输出", Local: true},
		{Command: "/version", Description: "显示版本信息", Local: true},
		{Command: "/exit", Description: "退出（也可用 exit/quit）", Local: true},
	}

	pageStyle = lipgloss.NewStyle().Padding(0, 1)

	headerBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("33")).
			Padding(0, 1)
	historyBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.NormalBorder()).
			BorderForeground(lipgloss.Color("33")).
			Padding(0, 1)
	suggestionBoxStyle = lipgloss.NewStyle().
				Border(lipgloss.NormalBorder()).
				BorderForeground(lipgloss.Color("39")).
				Padding(0, 1)
	inputBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("34")).
			Padding(0, 1)

	brandStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("51")).
			Bold(true)
	accentStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("45")).
			Bold(true)
	promptStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("46")).
			Bold(true)
	inputTextStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("230"))
	placeholderStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("71"))
	suggestionTitleStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("118")).
				Bold(true)
	suggestionStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("120"))
	hintStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("72"))
	statusBusyStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("82")).
			Bold(true)
	statusReadyStyle = lipgloss.NewStyle().
				Foreground(lipgloss.Color("70"))
	badgeBlueStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("33")).
			Bold(true).
			Padding(0, 1)
	badgeGreenStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("34")).
			Bold(true).
			Padding(0, 1)
	badgeGrayStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("231")).
			Background(lipgloss.Color("59")).
			Bold(true).
			Padding(0, 1)
)

type serverSession struct {
	mu      sync.Mutex
	session *session.Session
}

type serverState struct {
	cfg      *config.Config
	mu       sync.Mutex
	sessions map[string]*serverSession
}

type chatRequest struct {
	Message     string         `json:"message"`
	SessionID   string         `json:"session_id"`
	Mode        string         `json:"mode"`
	Agent       string         `json:"agent"`
	Prompt      string         `json:"prompt"`
	Model       string         `json:"model"`
	ClientShell map[string]any `json:"client_shell"`
}

type chatResponse struct {
	Response string `json:"response"`
	Agent    string `json:"agent"`
}

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
		color.Yellow("配置提示: %v", err)
		color.Yellow("未检测到可用 API Key，已自动切换到 ollama 本地模式。")
		color.Yellow("你仍可先进入程序，之后再补充环境变量。")
		cfg.LLMProvider = "ollama"
		if cfg.ModelName == "" || strings.Contains(strings.ToLower(cfg.ModelName), "deepseek") {
			cfg.ModelName = "qwen2.5:7b"
		}
		cfg.APIKey = ""
		cfg.BaseURL = ""
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
	if skills, err := loadSkills(); err == nil && len(skills) > 0 {
		message = enrichInputWithSkills(message, skills)
	} else if err != nil {
		color.Yellow("读取 skills 失败，已跳过 skills 注入: %v", err)
	}

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
	skills, err := loadSkills()
	if err != nil {
		color.Yellow("读取 skills 失败: %v", err)
		skills = []skillEntry{}
	}

	printStartupScreen(sess, mode, skills)

	reader := bufio.NewReader(os.Stdin)
	for {
		fmt.Print(promptStyle.Render(">>> "))
		input, err := reader.ReadString('\n')
		if err != nil && strings.TrimSpace(input) == "" {
			fmt.Println()
			dimExit()
			return
		}

		input = strings.TrimSpace(input)
		if input == "" {
			continue
		}
		if input == "exit" || input == "quit" || input == "/exit" || input == "/quit" {
			dimExit()
			return
		}

		if lines, handled, clear := handleLineSlashCommand(input, sess, &skills); handled {
			if clear {
				clearTerminal()
				printStartupScreen(sess, mode, skills)
				continue
			}
			printLines(lines)
			continue
		}

		requestInput := enrichInputWithSkills(input, skills)
		opts := &models.ProcessOptions{
			ForceQA:        mode == "ask",
			ForceAgentFlow: mode == "agent",
			AgentType:      agentFlag,
		}
		if _, err := sess.HandleWithOptions(ctx, requestInput, opts); err != nil {
			color.Red("处理出错: %v", err)
		}
		fmt.Println()
	}
}

func printStartupScreen(sess *session.Session, mode string, skills []skillEntry) {
	fmt.Println()
	fmt.Println(brandStyle.Render("SECBOT"))
	fmt.Println(accentStyle.Render("Security Testing Agent"))
	fmt.Println()
	fmt.Printf(
		"%s  %s  %s  %s  %s  %s\n",
		badgeBlueStyle.Render("secbot"),
		badgeGreenStyle.Render(displayModeLabel(mode)),
		badgeGrayStyle.Render(displayAgentLabel(agentFlag)),
		hintStyle.Render(fmt.Sprintf("%d tools", len(sess.ToolNames()))),
		hintStyle.Render(fmt.Sprintf("模型: %s", sess.ModelInfo())),
		hintStyle.Render(fmt.Sprintf("skills: %d", len(skills))),
	)
	fmt.Println()
	fmt.Println(accentStyle.Render("Quick Start"))
	fmt.Printf("  %s  %s\n", suggestionStyle.Render("• 扫描当前主机所在内网环境"), hintStyle.Render("推荐首条，发现内网主机与端口"))
	fmt.Printf("  %s  %s\n", suggestionStyle.Render("• 你好 / 你能做什么"), hintStyle.Render("问候或了解能力（走问答）"))
	fmt.Printf("  %s  %s\n", suggestionStyle.Render("• Scan localhost for open ports"), hintStyle.Render("扫描本机开放端口"))
	fmt.Printf("  %s  %s\n", suggestionStyle.Render("• /plan 编写测试计划，/start 执行计划"), hintStyle.Render("命令一览：规划/执行/问答"))
	fmt.Println()
	fmt.Println(hintStyle.Render("模式 default（自动） | super（专家）；启动时 -a secbot-cli | -a superhackbot。"))
	fmt.Println(hintStyle.Render("输入 / 后回车可列出所有命令。exit 退出"))
	fmt.Println()
}

func handleLineSlashCommand(input string, sess *session.Session, skills *[]skillEntry) ([]string, bool, bool) {
	switch {
	case input == "/":
		return buildSlashSuggestionLines(""), true, false
	case input == "/help" || input == "/h":
		return buildHelpLines(), true, false
	case input == "/tools":
		names := append([]string(nil), sess.ToolNames()...)
		sort.Strings(names)
		lines := []string{"可用工具:"}
		for _, name := range names {
			lines = append(lines, "  - "+name)
		}
		lines = append(lines, "")
		return lines, true, false
	case input == "/skill" || strings.HasPrefix(input, "/skill "):
		return handleLineSkillCommand(input, skills), true, false
	case input == "/doctor" || input == "/env":
		return buildDoctorLines(sess), true, false
	case input == "/clear":
		return nil, true, true
	case input == "/model" || input == "model":
		return []string{"模型切换功能即将实现", ""}, true, false
	case input == "/version":
		return []string{fmt.Sprintf("SecBot v%s (Go)", version), ""}, true, false
	case strings.HasPrefix(input, "/"):
		if isPassthroughSlashCommand(input) {
			return nil, false, false
		}
		return buildSlashSuggestionLines(input), true, false
	default:
		return nil, false, false
	}
}

func handleLineSkillCommand(input string, skills *[]skillEntry) []string {
	trimmed := strings.TrimSpace(input)

	if trimmed == "/skill" || trimmed == "/skill help" {
		return buildSkillHelpLines()
	}
	if trimmed == "/skill list" {
		return buildSkillListLines(*skills)
	}
	if strings.HasPrefix(trimmed, "/skill add ") {
		name, description, err := parseSkillAddCommand(trimmed)
		if err != nil {
			return []string{fmt.Sprintf("新增 skill 失败: %v", err), "输入 /skill help 查看用法", ""}
		}
		for _, skill := range *skills {
			if strings.EqualFold(skill.Name, name) {
				return []string{
					fmt.Sprintf("新增 skill 失败: 名称 %q 已存在", name),
					"可改用其他名称，或先编辑 data/skills.json。",
					"",
				}
			}
		}

		*skills = append(*skills, skillEntry{
			Name:        name,
			Description: description,
			CreatedAt:   time.Now().Format(time.RFC3339),
		})
		sort.Slice(*skills, func(i, j int) bool {
			return strings.ToLower((*skills)[i].Name) < strings.ToLower((*skills)[j].Name)
		})
		if err := saveSkills(*skills); err != nil {
			return []string{
				fmt.Sprintf("新增 skill 失败: %v", err),
				"skill 已添加到当前会话，但写入文件失败。",
				"",
			}
		}
		return []string{
			fmt.Sprintf("已新增 skill: %s", name),
			fmt.Sprintf("描述: %s", description),
			"该 skill 已持久化并会自动注入后续请求上下文。",
			"",
		}
	}

	return []string{
		fmt.Sprintf("不支持的命令: %s", trimmed),
		"输入 /skill help 查看用法。",
		"",
	}
}

func printLines(lines []string) {
	for _, line := range lines {
		fmt.Println(line)
	}
}

func dimExit() {
	color.New(color.Faint).Println("再见！")
}

func clearTerminal() {
	fmt.Print("\033[2J\033[H")
}

type processResultMsg struct {
	response string
	err      error
}

type skillEntry struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
}

type tuiModel struct {
	ctx context.Context

	sess *session.Session
	mode string

	skills []skillEntry

	input       textinput.Model
	history     []string
	suggestions []slashCommandSpec
	processing  bool
	quitting    bool

	width  int
	height int
}

func newTUIModel(ctx context.Context, sess *session.Session, mode string) tuiModel {
	input := textinput.New()
	input.Focus()
	input.Prompt = ">>> "
	input.Placeholder = "输入任务，按 Enter 发送；输入 / 查看命令"
	input.CharLimit = 4096
	input.PromptStyle = promptStyle
	input.TextStyle = inputTextStyle
	input.PlaceholderStyle = placeholderStyle

	skills, err := loadSkills()
	initialHistory := []string{}
	if err != nil {
		initialHistory = append(initialHistory, fmt.Sprintf("读取 skills 失败: %v", err))
	}

	m := tuiModel{
		ctx:      ctx,
		sess:     sess,
		mode:     mode,
		skills:   skills,
		input:    input,
		history:  nil,
		width:    0,
		height:   0,
		quitting: false,
	}
	m.history = m.initialHistory()
	if len(initialHistory) > 0 {
		m.appendLines(initialHistory...)
	}
	if len(m.skills) > 0 {
		m.appendLines(fmt.Sprintf("已加载 %d 个 skills，输入 /skill list 查看。", len(m.skills)), "")
	}
	m.refreshSlashSuggestions()
	return m
}

func (m tuiModel) Init() tea.Cmd {
	return textinput.Blink
}

func (m tuiModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.resizeInput()
		return m, nil
	case processResultMsg:
		m.processing = false
		if msg.err != nil {
			m.appendLines(fmt.Sprintf("处理出错: %v", msg.err), "")
			return m, nil
		}

		response := strings.TrimSpace(msg.response)
		if response == "" {
			m.appendLines("(无输出)", "")
			return m, nil
		}
		m.appendLines(strings.Split(response, "\n")...)
		m.appendLines("")
		return m, nil
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c":
			m.quitting = true
			m.appendLines("再见！")
			return m, tea.Quit
		case "enter":
			if m.processing {
				return m, nil
			}

			input := strings.TrimSpace(m.input.Value())
			if input == "" {
				return m, nil
			}

			m.appendLines(fmt.Sprintf(">>> %s", input))
			m.input.SetValue("")
			m.refreshSlashSuggestions()

			if input == "exit" || input == "quit" || input == "/exit" || input == "/quit" {
				m.appendLines("再见！")
				m.quitting = true
				return m, tea.Quit
			}

			if lines, handled, clear := m.handleSlashCommand(input); handled {
				if clear {
					m.history = m.initialHistory()
				} else {
					m.appendLines(lines...)
				}
				return m, nil
			}

			m.processing = true
			requestInput := enrichInputWithSkills(input, m.skills)
			return m, processInputCmd(m.ctx, m.sess, m.mode, requestInput)
		}
	}

	if !m.processing {
		var cmd tea.Cmd
		m.input, cmd = m.input.Update(msg)
		m.refreshSlashSuggestions()
		return m, cmd
	}
	return m, nil
}

func (m tuiModel) View() string {
	if m.quitting {
		return ""
	}

	width := m.width
	if width <= 0 {
		width = 100
	}
	containerWidth := max(width-2, 30)

	header := m.renderStartupScreen(containerWidth)
	suggestionBlock := m.renderSuggestions(containerWidth)
	statusLine := m.renderStatus()
	inputBlock := inputBoxStyle.Width(containerWidth).Render(m.input.View())

	// 普通终端模式下保持紧凑，不占满整屏。
	historyLines := lastLines(m.history, 10)
	historyBlock := historyBoxStyle.Width(containerWidth).Render(strings.Join(historyLines, "\n"))

	return pageStyle.Width(width).Render(
		lipgloss.JoinVertical(
			lipgloss.Left,
			header,
			historyBlock,
			suggestionBlock,
			statusLine,
			inputBlock,
		),
	)
}

func (m tuiModel) renderStartupScreen(containerWidth int) string {
	innerWidth := max(containerWidth-4, 30)
	bannerText := strings.Trim(cliBanner, "\n")
	if innerWidth < 62 {
		bannerText = "SECBOT"
	}

	bannerBlock := lipgloss.NewStyle().
		Width(innerWidth).
		Align(lipgloss.Center).
		Render(brandStyle.Render(bannerText))
	subtitle := lipgloss.NewStyle().
		Width(innerWidth).
		Align(lipgloss.Center).
		Render(accentStyle.Render("Security Testing Agent"))

	badges := lipgloss.JoinHorizontal(
		lipgloss.Left,
		badgeBlueStyle.Render("secbot"),
		" ",
		badgeGreenStyle.Render(displayModeLabel(m.mode)),
		" ",
		badgeGrayStyle.Render(displayAgentLabel(agentFlag)),
		"  ",
		hintStyle.Render(fmt.Sprintf("%d tools", len(m.sess.ToolNames()))),
		"  ",
		hintStyle.Render(fmt.Sprintf("模型: %s", m.sess.ModelInfo())),
		"  ",
		hintStyle.Render(fmt.Sprintf("skills: %d", len(m.skills))),
	)

	body := lipgloss.JoinVertical(
		lipgloss.Left,
		bannerBlock,
		subtitle,
		"",
		badges,
		"",
		renderQuickStart(),
		"",
		hintStyle.Render("模式 default（自动） | super（专家）；启动时 -a secbot-cli | -a superhackbot。"),
		hintStyle.Render("输入 / 后回车可列出所有命令。exit 退出"),
	)
	return headerBoxStyle.Width(containerWidth).Render(body)
}

func renderQuickStart() string {
	rows := []string{
		accentStyle.Render("Quick Start"),
		"",
		fmt.Sprintf("%s  %s", suggestionStyle.Render("• 扫描当前主机所在内网环境"), hintStyle.Render("推荐首条，发现内网主机与端口")),
		fmt.Sprintf("%s  %s", suggestionStyle.Render("• 你好 / 你能做什么"), hintStyle.Render("问候或了解能力（走问答）")),
		fmt.Sprintf("%s  %s", suggestionStyle.Render("• Scan localhost for open ports"), hintStyle.Render("扫描本机开放端口")),
		fmt.Sprintf("%s  %s", suggestionStyle.Render("• /plan 编写测试计划，/start 执行计划"), hintStyle.Render("命令一览：规划/执行/问答")),
	}
	return strings.Join(rows, "\n")
}

func (m *tuiModel) appendLines(lines ...string) {
	m.history = append(m.history, lines...)
}

func (m *tuiModel) resizeInput() {
	inputWidth := m.width - 12
	if inputWidth < 24 {
		inputWidth = 24
	}
	m.input.Width = inputWidth
}

func (m tuiModel) initialHistory() []string {
	return []string{
		"不知道做什么？试试 Quick Start，或输入 / 查看命令。",
		"输入 /skill add <名称> <描述> 可新增 skills。",
		"",
	}
}

func (m *tuiModel) handleSlashCommand(input string) ([]string, bool, bool) {
	switch {
	case input == "/":
		return buildSlashSuggestionLines(""), true, false
	case input == "/help" || input == "/h":
		return buildHelpLines(), true, false
	case input == "/tools":
		names := append([]string(nil), m.sess.ToolNames()...)
		sort.Strings(names)
		lines := []string{"可用工具:"}
		for _, name := range names {
			lines = append(lines, "  - "+name)
		}
		lines = append(lines, "")
		return lines, true, false
	case input == "/skill" || strings.HasPrefix(input, "/skill "):
		return m.handleSkillCommand(input), true, false
	case input == "/doctor" || input == "/env":
		return buildDoctorLines(m.sess), true, false
	case input == "/clear":
		return nil, true, true
	case input == "/model" || input == "model":
		return []string{"模型切换功能即将实现", ""}, true, false
	case input == "/version":
		return []string{fmt.Sprintf("SecBot v%s (Go)", version), ""}, true, false
	case strings.HasPrefix(input, "/"):
		if isPassthroughSlashCommand(input) {
			return nil, false, false
		}
		return buildSlashSuggestionLines(input), true, false
	default:
		return nil, false, false
	}
}

func (m *tuiModel) refreshSlashSuggestions() {
	input := strings.TrimSpace(m.input.Value())
	if !strings.HasPrefix(input, "/") {
		m.suggestions = nil
		return
	}
	m.suggestions = matchSlashCommands(input)
}

func (m tuiModel) renderSuggestions(containerWidth int) string {
	input := strings.TrimSpace(m.input.Value())
	if !strings.HasPrefix(input, "/") {
		return suggestionBoxStyle.Width(containerWidth).Render(hintStyle.Render("提示: 输入 / 可查看命令候选"))
	}

	lines := []string{suggestionTitleStyle.Render("命令候选:")}
	if len(m.suggestions) == 0 {
		lines = append(lines, hintStyle.Render("  未匹配命令，按 Enter 可查看建议"))
	} else {
		limit := len(m.suggestions)
		if limit > 8 {
			limit = 8
		}
		for _, spec := range m.suggestions[:limit] {
			lines = append(lines, fmt.Sprintf("  %s  %s", suggestionStyle.Render(spec.Command), hintStyle.Render(spec.Description)))
		}
		if len(m.suggestions) > limit {
			lines = append(lines, hintStyle.Render(fmt.Sprintf("  ... 还有 %d 个命令", len(m.suggestions)-limit)))
		}
	}
	return suggestionBoxStyle.Width(containerWidth).Render(strings.Join(lines, "\n"))
}

func (m tuiModel) renderStatus() string {
	if m.processing {
		return statusBusyStyle.Render("正在处理请求，请稍候...")
	}
	return statusReadyStyle.Render("普通终端模式 | Enter 发送  |  Ctrl+C 退出")
}

func processInputCmd(ctx context.Context, sess *session.Session, mode, input string) tea.Cmd {
	return func() tea.Msg {
		opts := &models.ProcessOptions{
			ForceQA:        mode == "ask",
			ForceAgentFlow: mode == "agent",
			AgentType:      agentFlag,
		}
		resp, err := sess.HandleWithOptions(ctx, input, opts)
		return processResultMsg{response: resp, err: err}
	}
}

func buildHelpLines() []string {
	lines := []string{
		"命令列表",
		"",
	}
	for _, spec := range slashCommandSpecs {
		lines = append(lines, fmt.Sprintf("  %-10s %s", spec.Command, spec.Description))
	}
	lines = append(lines,
		"",
		"Quick Start:",
		"  扫描当前主机所在内网环境",
		"  你好 / 你能做什么",
		"  Scan localhost for open ports",
		"  /plan 编写测试计划，/start 执行计划，/ask 仅提问不执行",
		"",
		"提示: /tools 查看完整工具列表；/skill help 管理自定义技能。",
		"",
	)
	return lines
}

func (m *tuiModel) handleSkillCommand(input string) []string {
	trimmed := strings.TrimSpace(input)

	if trimmed == "/skill" || trimmed == "/skill help" {
		return buildSkillHelpLines()
	}

	if trimmed == "/skill list" {
		return buildSkillListLines(m.skills)
	}

	if strings.HasPrefix(trimmed, "/skill add ") {
		name, description, err := parseSkillAddCommand(trimmed)
		if err != nil {
			return []string{fmt.Sprintf("新增 skill 失败: %v", err), "输入 /skill help 查看用法", ""}
		}
		for _, skill := range m.skills {
			if strings.EqualFold(skill.Name, name) {
				return []string{
					fmt.Sprintf("新增 skill 失败: 名称 %q 已存在", name),
					"可改用其他名称，或先编辑 data/skills.json。",
					"",
				}
			}
		}

		m.skills = append(m.skills, skillEntry{
			Name:        name,
			Description: description,
			CreatedAt:   time.Now().Format(time.RFC3339),
		})
		sort.Slice(m.skills, func(i, j int) bool {
			return strings.ToLower(m.skills[i].Name) < strings.ToLower(m.skills[j].Name)
		})
		if err := saveSkills(m.skills); err != nil {
			return []string{
				fmt.Sprintf("新增 skill 失败: %v", err),
				"skill 已添加到当前会话，但写入文件失败。",
				"",
			}
		}
		return []string{
			fmt.Sprintf("已新增 skill: %s", name),
			fmt.Sprintf("描述: %s", description),
			"该 skill 已持久化并会自动注入后续请求上下文。",
			"",
		}
	}

	return []string{
		fmt.Sprintf("不支持的命令: %s", trimmed),
		"输入 /skill help 查看用法。",
		"",
	}
}

func buildSkillHelpLines() []string {
	return []string{
		"Skill 命令帮助",
		"=============",
		"  /skill help",
		"    显示此帮助",
		"  /skill list",
		"    查看当前已配置 skills",
		"  /skill add <名称> <描述>",
		"    新增一个 skill，写入 data/skills.json",
		"",
		"示例:",
		"  /skill add web-check 优先检查 HTTP 安全头并给出修复建议",
		"",
	}
}

func buildSkillListLines(skills []skillEntry) []string {
	lines := []string{"当前 skills:"}
	if len(skills) == 0 {
		lines = append(lines, "  - 暂无技能，使用 /skill add <名称> <描述> 新增。", "")
		return lines
	}

	for _, skill := range skills {
		lines = append(lines, fmt.Sprintf("  - %s: %s", skill.Name, skill.Description))
	}
	lines = append(lines, "")
	return lines
}

func parseSkillAddCommand(input string) (string, string, error) {
	const prefix = "/skill add "
	if !strings.HasPrefix(input, prefix) {
		return "", "", fmt.Errorf("命令格式应为 /skill add <名称> <描述>")
	}
	body := strings.TrimSpace(strings.TrimPrefix(input, prefix))
	if body == "" {
		return "", "", fmt.Errorf("请提供 skill 名称和描述")
	}

	parts := strings.Fields(body)
	if len(parts) < 2 {
		return "", "", fmt.Errorf("描述不能为空，例如 /skill add web-check 检查 HTTP 安全头")
	}

	name := strings.TrimSpace(parts[0])
	if name == "" {
		return "", "", fmt.Errorf("skill 名称不能为空")
	}

	namePos := strings.Index(body, name)
	description := strings.TrimSpace(body[namePos+len(name):])
	if description == "" {
		return "", "", fmt.Errorf("skill 描述不能为空")
	}

	return name, description, nil
}

func loadSkills() ([]skillEntry, error) {
	data, err := os.ReadFile(skillsFilePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return []skillEntry{}, nil
		}
		return nil, err
	}
	if len(strings.TrimSpace(string(data))) == 0 {
		return []skillEntry{}, nil
	}

	var skills []skillEntry
	if err := json.Unmarshal(data, &skills); err != nil {
		return nil, err
	}
	return skills, nil
}

func saveSkills(skills []skillEntry) error {
	if err := os.MkdirAll(filepath.Dir(skillsFilePath), 0o755); err != nil {
		return err
	}
	content, err := json.MarshalIndent(skills, "", "  ")
	if err != nil {
		return err
	}
	content = append(content, '\n')
	return os.WriteFile(skillsFilePath, content, 0o644)
}

func enrichInputWithSkills(input string, skills []skillEntry) string {
	if len(skills) == 0 {
		return input
	}

	lines := make([]string, 0, len(skills)+6)
	lines = append(lines, "【自定义技能上下文】")
	for _, skill := range skills {
		lines = append(lines, fmt.Sprintf("- %s: %s", skill.Name, skill.Description))
	}
	lines = append(lines, "", "【用户请求】", input)
	return strings.Join(lines, "\n")
}

func buildDoctorLines(sess *session.Session) []string {
	cfg := config.Load()
	provider := strings.ToLower(cfg.LLMProvider)
	requiredKey := strings.ToUpper(provider) + "_API_KEY"

	lines := []string{
		"环境诊断:",
		fmt.Sprintf("  - 当前 Provider: %s", cfg.LLMProvider),
		fmt.Sprintf("  - 当前模型: %s", cfg.ModelName),
		fmt.Sprintf("  - 会话模型: %s", sess.ModelInfo()),
	}

	if provider == "ollama" {
		lines = append(lines,
			fmt.Sprintf("  - OLLAMA_URL: %s", cfg.OllamaURL),
			"  - 结论: 本地模式无需 API Key，可直接使用。",
			"",
		)
		return lines
	}

	apiKey := cfg.APIKey
	if apiKey == "" {
		apiKey = os.Getenv(requiredKey)
	}
	if apiKey == "" {
		lines = append(lines,
			fmt.Sprintf("  - %s: 未设置", requiredKey),
			fmt.Sprintf("  - 建议: 在 .env 中添加 %s=你的密钥", requiredKey),
			"  - 提示: 配置后重启 secbot 生效。",
			"",
		)
		return lines
	}

	masked := "***"
	if len(apiKey) > 8 {
		masked = apiKey[:4] + "..." + apiKey[len(apiKey)-4:]
	}
	lines = append(lines,
		fmt.Sprintf("  - %s: 已设置 (%s)", requiredKey, masked),
		"  - 结论: 环境变量看起来正常。",
		"",
	)
	return lines
}

func buildSlashSuggestionLines(input string) []string {
	lines := []string{"可用斜杠命令:"}
	matches := matchSlashCommands(input)

	hasMatch := false
	for _, spec := range matches {
		lines = append(lines, fmt.Sprintf("  - %-10s %s", spec.Command, spec.Description))
		hasMatch = true
	}

	if input != "" && input != "/" && !hasMatch {
		lines = append(lines,
			fmt.Sprintf("  - 未找到与 %q 匹配的命令", input),
			"  - 输入 / 查看全部命令，或输入 /help 查看说明",
		)
	}
	lines = append(lines, "")
	return lines
}

func matchSlashCommands(input string) []slashCommandSpec {
	prefix := strings.TrimSpace(input)
	matches := make([]slashCommandSpec, 0, len(slashCommandSpecs))
	for _, spec := range slashCommandSpecs {
		if prefix == "" || prefix == "/" || strings.HasPrefix(spec.Command, prefix) {
			matches = append(matches, spec)
		}
	}
	return matches
}

func isPassthroughSlashCommand(input string) bool {
	token := slashCommandToken(input)
	for _, spec := range slashCommandSpecs {
		if spec.Command == token {
			return !spec.Local
		}
	}
	return false
}

func slashCommandToken(input string) string {
	parts := strings.Fields(strings.TrimSpace(input))
	if len(parts) == 0 {
		return ""
	}
	return strings.ToLower(parts[0])
}

func displayModeLabel(mode string) string {
	if mode == "ask" {
		return "ask"
	}
	return "default"
}

func displayAgentLabel(agent string) string {
	switch strings.ToLower(strings.TrimSpace(agent)) {
	case "superhackbot", "super":
		return "super"
	default:
		return "auto"
	}
}

func lastLines(lines []string, limit int) []string {
	if limit <= 0 || len(lines) <= limit {
		return lines
	}
	return lines[len(lines)-limit:]
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func modelCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "model",
		Short: "切换推理后端与模型（待实现）",
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
			host, _ := cmd.Flags().GetString("host")
			port, _ := cmd.Flags().GetInt("port")
			runHTTPServer(host, port)
		},
	}
	cmd.Flags().StringP("host", "H", "0.0.0.0", "监听地址")
	cmd.Flags().IntP("port", "p", 8000, "监听端口")
	return cmd
}

func runHTTPServer(host string, port int) {
	_ = godotenv.Load()
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		color.Yellow("配置提示: %v", err)
		color.Yellow("未检测到可用 API Key，已自动切换到 ollama 本地模式。")
		cfg.LLMProvider = "ollama"
		if cfg.ModelName == "" || strings.Contains(strings.ToLower(cfg.ModelName), "deepseek") {
			cfg.ModelName = "qwen2.5:7b"
		}
		cfg.APIKey = ""
		cfg.BaseURL = ""
	}
	if err := logger.Init(cfg.LogLevel, cfg.LogFile); err != nil {
		fmt.Fprintf(os.Stderr, "日志初始化失败: %v\n", err)
	}
	defer logger.Close()

	state := &serverState{cfg: cfg, sessions: make(map[string]*serverSession)}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/api/chat", state.handleChatStream)
	mux.HandleFunc("/api/chat/sync", state.handleChatSync)
	mux.HandleFunc("/api/chat/root-response", handleRootResponse)

	addr := fmt.Sprintf("%s:%d", host, port)
	srv := &http.Server{
		Addr:              addr,
		Handler:           withCORS(mux),
		ReadHeaderTimeout: 15 * time.Second,
	}

	color.Green("SecBot Go HTTP API listening on http://%s", addr)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		color.Red("HTTP API 服务失败: %v", err)
		os.Exit(1)
	}
}

func (s *serverState) getSession(sessionID, agentType string) (*serverSession, error) {
	if strings.TrimSpace(sessionID) == "" {
		sessionID = "default"
	}
	if strings.TrimSpace(agentType) == "" {
		agentType = "secbot-cli"
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if existing := s.sessions[sessionID]; existing != nil {
		existing.session.SetSessionID(sessionID, agentType)
		return existing, nil
	}

	sess, err := session.NewSession(s.cfg)
	if err != nil {
		return nil, err
	}
	sess.SetSessionID(sessionID, agentType)
	wrapped := &serverSession{session: sess}
	s.sessions[sessionID] = wrapped
	return wrapped, nil
}

func (s *serverState) handleChatStream(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req chatRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		writeSSE(w, nil, "error", map[string]any{"error": err.Error(), "statusCode": http.StatusBadRequest})
		writeSSE(w, nil, "done", map[string]any{})
		return
	}
	if strings.TrimSpace(req.Message) == "" {
		writeSSE(w, nil, "error", map[string]any{"error": "message is required", "statusCode": http.StatusBadRequest})
		writeSSE(w, nil, "done", map[string]any{})
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	agentType := emptyDefault(req.Agent, "secbot-cli")
	wrapped, err := s.getSession(req.SessionID, agentType)
	if err != nil {
		writeSSE(w, flusher, "error", map[string]any{"error": err.Error(), "statusCode": http.StatusInternalServerError})
		writeSSE(w, flusher, "done", map[string]any{})
		return
	}

	wrapped.mu.Lock()
	defer wrapped.mu.Unlock()

	unsubscribe := wrapped.session.SubscribeEvents(func(e event.Event) {
		writeSSE(w, flusher, mapServerEventName(e.Type), e.Payload)
	})
	defer unsubscribe()

	response, err := wrapped.session.HandleWithOptions(r.Context(), req.Message, &models.ProcessOptions{
		ForceQA:        strings.EqualFold(req.Mode, "ask"),
		AgentType:      agentType,
		ForceAgentFlow: strings.EqualFold(req.Mode, "force_agent"),
	})
	if err != nil {
		writeSSE(w, flusher, "error", map[string]any{"error": err.Error(), "statusCode": http.StatusInternalServerError})
		writeSSE(w, flusher, "done", map[string]any{})
		return
	}
	writeSSE(w, flusher, "response", map[string]any{"content": response, "agent": agentType})
	writeSSE(w, flusher, "done", map[string]any{})
}

func (s *serverState) handleChatSync(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req chatRequest
	if err := decodeJSONBody(w, r, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": err.Error()})
		return
	}
	if strings.TrimSpace(req.Message) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "message is required"})
		return
	}

	agentType := emptyDefault(req.Agent, "secbot-cli")
	wrapped, err := s.getSession(req.SessionID, agentType)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}

	wrapped.mu.Lock()
	defer wrapped.mu.Unlock()
	response, err := wrapped.session.HandleWithOptions(r.Context(), req.Message, &models.ProcessOptions{
		ForceQA:        strings.EqualFold(req.Mode, "ask"),
		AgentType:      agentType,
		ForceAgentFlow: strings.EqualFold(req.Mode, "force_agent"),
	})
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]any{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, chatResponse{Response: response, Agent: agentType})
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "secbot-go", "version": version})
}

func handleRootResponse(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{})
}

func decodeJSONBody(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	return nil
}

func writeSSE(w http.ResponseWriter, flusher http.Flusher, name string, data map[string]any) {
	if data == nil {
		data = map[string]any{}
	}
	payload, err := json.Marshal(data)
	if err != nil {
		payload = []byte(`{"error":"failed to encode event"}`)
	}
	fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, payload)
	if flusher != nil {
		flusher.Flush()
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		next.ServeHTTP(w, r)
	})
}

func mapServerEventName(t event.Type) string {
	switch t {
	case event.TaskPhase:
		return "phase"
	case event.PlanStart:
		return "planning"
	case event.ReportEnd:
		return "report"
	case event.ErrorOccurred:
		return "error"
	default:
		return string(t)
	}
}

func emptyDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
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
