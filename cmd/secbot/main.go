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
		{Command: "/model", Description: "切换推理后端/模型", Local: true},
		{Command: "/agent", Description: "切换智能体（default / super）", Local: true},
		{Command: "/ask", Description: "仅问答不执行工具（Ask 模式）", Local: true},
		{Command: "/plan", Description: "仅生成计划（不执行）", Local: true},
		{Command: "/start", Description: "执行计划", Local: true},
		{Command: "/accept", Description: "确认敏感操作（superhackbot）", Local: true},
		{Command: "/reject", Description: "拒绝敏感操作（superhackbot）", Local: true},
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
		runOnce(ctx, sess, args[0], newCLIState(mode, agentFlag, nil))
	} else {
		runInteractive(ctx, sess, newCLIState(mode, agentFlag, nil))
	}
}

func runOnce(ctx context.Context, sess *session.Session, message string, state *cliRuntimeState) {
	if skills, err := loadSkills(); err == nil && len(skills) > 0 {
		message = enrichInputWithSkills(message, skills)
	} else if err != nil {
		color.Yellow("读取 skills 失败，已跳过 skills 注入: %v", err)
	}

	resp, err := sess.HandleWithOptions(ctx, message, state.processOptions())
	if err != nil {
		color.Red("处理出错: %v", err)
		os.Exit(1)
	}
	fmt.Println()
	fmt.Println(resp)
}

func runInteractive(ctx context.Context, sess *session.Session, state *cliRuntimeState) {
	skills, err := loadSkills()
	if err != nil {
		color.Yellow("读取 skills 失败: %v", err)
		skills = []skillEntry{}
	}
	state.skills = skills

	printStartupScreen(sess, state)

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

		if lines, handled, clear := handleLineSlashCommand(ctx, input, &sess, state, reader); handled {
			if clear {
				clearTerminal()
				printStartupScreen(sess, state)
				continue
			}
			printLines(lines)
			continue
		}

		requestInput := enrichInputWithSkills(input, state.skills)
		if _, err := sess.HandleWithOptions(ctx, requestInput, state.processOptions()); err != nil {
			color.Red("处理出错: %v", err)
		}
		fmt.Println()
	}
}

func printStartupScreen(sess *session.Session, state *cliRuntimeState) {
	fmt.Println()
	fmt.Println(brandStyle.Render("SECBOT"))
	fmt.Println(accentStyle.Render("Security Testing Agent"))
	fmt.Println()
	fmt.Printf(
		"%s  %s  %s  %s  %s  %s\n",
		badgeBlueStyle.Render("secbot"),
		badgeGreenStyle.Render(displayModeLabel(state.mode)),
		badgeGrayStyle.Render(displayAgentLabel(state.agentType)),
		hintStyle.Render(fmt.Sprintf("%d tools", len(sess.ToolNames()))),
		hintStyle.Render(fmt.Sprintf("模型: %s", sess.ModelInfo())),
		hintStyle.Render(fmt.Sprintf("skills: %d", len(state.skills))),
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

func handleLineSlashCommand(ctx context.Context, input string, sess **session.Session, state *cliRuntimeState, reader *bufio.Reader) ([]string, bool, bool) {
	switch {
	case input == "/":
		return buildSlashSuggestionLines(""), true, false
	case input == "/help" || input == "/h":
		return buildHelpLines(), true, false
	case input == "/tools":
		names := append([]string(nil), (*sess).ToolNames()...)
		sort.Strings(names)
		lines := []string{"可用工具:"}
		for _, name := range names {
			lines = append(lines, "  - "+name)
		}
		lines = append(lines, "")
		return lines, true, false
	case input == "/skill" || strings.HasPrefix(input, "/skill "):
		return handleLineSkillCommand(input, &state.skills), true, false
	case input == "/doctor" || input == "/env":
		return buildDoctorLines(*sess), true, false
	case input == "/clear":
		return nil, true, true
	case input == "/model" || input == "model":
		result, err := runModelSelector(config.Load(), reader, os.Stdout)
		if err != nil {
			return []string{fmt.Sprintf("模型切换失败: %v", err), ""}, true, false
		}
		if result == nil || !result.Saved {
			return []string{""}, true, false
		}
		newSess, err := rebuildSessionAfterModelSwitch(*sess)
		if err != nil {
			return []string{fmt.Sprintf("模型已保存，但重建 Session 失败: %v", err), "请重启 secbot 后继续。", ""}, true, false
		}
		*sess = newSess
		state.pendingPlan = nil
		return []string{"已使用新模型配置重建当前会话。", ""}, true, false
	case input == "/agent" || strings.HasPrefix(input, "/agent "):
		return handleAgentCommand(input, state), true, false
	case input == "/ask" || strings.HasPrefix(input, "/ask "):
		return handleAskCommand(ctx, input, *sess, state), true, false
	case input == "/plan" || strings.HasPrefix(input, "/plan "):
		return handlePlanCommand(ctx, input, *sess, state), true, false
	case input == "/start" || strings.HasPrefix(input, "/start "):
		return handleStartCommand(ctx, input, *sess, state), true, false
	case input == "/accept" || input == "/reject":
		return []string{"当前没有待确认操作。", ""}, true, false
	case input == "/version":
		return []string{fmt.Sprintf("SecBot v%s (Go)", version), ""}, true, false
	case strings.HasPrefix(input, "/"):
		return buildSlashSuggestionLines(input), true, false
	default:
		return nil, false, false
	}
}

func rebuildSessionAfterModelSwitch(old *session.Session) (*session.Session, error) {
	if old != nil {
		_ = old.Close()
	}
	cfg := config.Load()
	if err := cfg.Validate(); err != nil {
		return nil, err
	}
	newSess, err := session.NewSession(cfg)
	if err != nil {
		return nil, err
	}
	printer := cli.NewEventPrinter()
	newSess.Bus().OnAll(printer.Handle)
	return newSess, nil
}

func handleAgentCommand(input string, state *cliRuntimeState) []string {
	parts := strings.Fields(input)
	if len(parts) == 1 {
		return []string{
			fmt.Sprintf("当前智能体: %s", state.agentType),
			"可选: default / auto / secbot-cli / hackbot / super / superhackbot",
			"",
		}
	}
	if len(parts) > 2 {
		return []string{"用法: /agent [default|super]", ""}
	}
	agent := normalizeAgentType(parts[1])
	switch agent {
	case "secbot-cli", "superhackbot":
		state.agentType = agent
		state.mode = "agent"
		agentFlag = agent
		return []string{fmt.Sprintf("已切换智能体: %s", displayAgentLabel(agent)), "当前模式: default", ""}
	default:
		return []string{"不支持的智能体。可选: default / auto / secbot-cli / hackbot / super / superhackbot", ""}
	}
}

func handleAskCommand(ctx context.Context, input string, sess *session.Session, state *cliRuntimeState) []string {
	body := strings.TrimSpace(strings.TrimPrefix(input, "/ask"))
	switch strings.ToLower(body) {
	case "":
		state.mode = "ask"
		return []string{"已切换到 Ask 模式：后续输入仅问答，不执行工具。", ""}
	case "off", "agent":
		state.mode = "agent"
		return []string{"已切换到 default 模式：后续输入按任务自动规划/执行。", ""}
	}

	state.mode = "ask"
	requestInput := enrichInputWithSkills(body, state.skills)
	resp, err := sess.HandleWithOptions(ctx, requestInput, &models.ProcessOptions{
		ForceQA:   true,
		AgentType: state.agentType,
	})
	if err != nil {
		return []string{fmt.Sprintf("Ask 处理出错: %v", err), ""}
	}
	return append(strings.Split(strings.TrimSpace(resp), "\n"), "")
}

func handlePlanCommand(ctx context.Context, input string, sess *session.Session, state *cliRuntimeState) []string {
	body := strings.TrimSpace(strings.TrimPrefix(input, "/plan"))
	if body == "" {
		lines := []string{"用法: /plan <任务>", "生成计划后输入 /start 执行。"}
		if state.pendingPlan != nil && state.pendingPlan.PlanResult != nil {
			lines = append(lines, "", "当前缓存计划:")
			lines = append(lines, formatPreparedPlan(state.pendingPlan)...)
		}
		lines = append(lines, "")
		return lines
	}

	requestInput := enrichInputWithSkills(body, state.skills)
	prepared, err := sess.PreparePlan(ctx, requestInput, &models.ProcessOptions{
		ForceAgentFlow: true,
		AgentType:      state.agentType,
	})
	if err != nil {
		return []string{fmt.Sprintf("生成计划失败: %v", err), ""}
	}
	if prepared.PlanResult == nil || len(prepared.PlanResult.Todos) == 0 {
		state.pendingPlan = nil
		if prepared.PlanResult != nil && strings.TrimSpace(prepared.PlanResult.DirectResponse) != "" {
			return []string{prepared.PlanResult.DirectResponse, ""}
		}
		return []string{"未生成可执行计划。", ""}
	}
	state.pendingPlan = prepared
	return append([]string{"已生成计划（未执行）。", ""}, append(formatPreparedPlan(prepared), "")...)
}

func handleStartCommand(ctx context.Context, input string, sess *session.Session, state *cliRuntimeState) []string {
	body := strings.TrimSpace(strings.TrimPrefix(input, "/start"))
	if body != "" {
		return []string{"/start 只执行最近一次 /plan 生成的缓存计划；新的任务请先使用 /plan <任务>。", ""}
	}
	if state.pendingPlan == nil {
		return []string{"当前没有缓存计划。请先输入 /plan <任务>。", ""}
	}

	resp, err := sess.ExecutePreparedPlan(ctx, state.pendingPlan, &models.ProcessOptions{
		AgentType: state.agentType,
	})
	if err != nil {
		return []string{fmt.Sprintf("执行计划失败: %v", err), "缓存计划已保留，可修正环境后再次 /start。", ""}
	}
	state.pendingPlan = nil
	if strings.TrimSpace(resp) == "" {
		return []string{"计划执行完成。", ""}
	}
	return append([]string{"计划执行完成。", ""}, append(strings.Split(strings.TrimSpace(resp), "\n"), "")...)
}

func formatPreparedPlan(prepared *models.PreparedPlan) []string {
	if prepared == nil || prepared.PlanResult == nil {
		return []string{"  - 无计划"}
	}
	plan := prepared.PlanResult
	lines := []string{}
	if strings.TrimSpace(plan.PlanSummary) != "" {
		lines = append(lines, "摘要: "+plan.PlanSummary)
	}
	for _, todo := range plan.Todos {
		tool := todo.ToolHint
		if tool == "" {
			tool = "未指定工具"
		}
		lines = append(lines, fmt.Sprintf("  - [%s] %s (%s)", todo.ID, todo.Content, tool))
	}
	return lines
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

type planPreparedMsg struct {
	prepared *models.PreparedPlan
	err      error
}

type planExecutedMsg struct {
	response string
	err      error
}

type cliRuntimeState struct {
	mode        string
	agentType   string
	pendingPlan *models.PreparedPlan
	skills      []skillEntry
}

func newCLIState(mode, agent string, skills []skillEntry) *cliRuntimeState {
	if strings.TrimSpace(mode) == "" {
		mode = "agent"
	}
	state := &cliRuntimeState{
		mode:      mode,
		agentType: normalizeAgentType(agent),
		skills:    skills,
	}
	if state.agentType == "" {
		state.agentType = "secbot-cli"
	}
	return state
}

func (s *cliRuntimeState) processOptions() *models.ProcessOptions {
	return &models.ProcessOptions{
		ForceQA:        s.mode == "ask",
		ForceAgentFlow: s.mode == "agent",
		AgentType:      s.agentType,
	}
}

func normalizeAgentType(agent string) string {
	switch strings.ToLower(strings.TrimSpace(agent)) {
	case "", "default", "auto", "hackbot", "secbot", "secbot-cli":
		return "secbot-cli"
	case "super", "superhackbot":
		return "superhackbot"
	default:
		return strings.TrimSpace(agent)
	}
}

type skillEntry struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
}

type tuiModel struct {
	ctx context.Context

	sess  *session.Session
	state *cliRuntimeState

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
		state:    newCLIState(mode, agentFlag, skills),
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
	if len(m.state.skills) > 0 {
		m.appendLines(fmt.Sprintf("已加载 %d 个 skills，输入 /skill list 查看。", len(m.state.skills)), "")
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
	case planPreparedMsg:
		m.processing = false
		if msg.err != nil {
			m.appendLines(fmt.Sprintf("生成计划失败: %v", msg.err), "")
			return m, nil
		}
		if msg.prepared == nil || msg.prepared.PlanResult == nil || len(msg.prepared.PlanResult.Todos) == 0 {
			m.state.pendingPlan = nil
			m.appendLines("未生成可执行计划。", "")
			return m, nil
		}
		m.state.pendingPlan = msg.prepared
		m.appendLines("已生成计划（未执行）。", "")
		m.appendLines(formatPreparedPlan(msg.prepared)...)
		m.appendLines("")
		return m, nil
	case planExecutedMsg:
		m.processing = false
		if msg.err != nil {
			m.appendLines(fmt.Sprintf("执行计划失败: %v", msg.err), "缓存计划已保留，可修正环境后再次 /start。", "")
			return m, nil
		}
		m.state.pendingPlan = nil
		m.appendLines("计划执行完成。", "")
		response := strings.TrimSpace(msg.response)
		if response != "" {
			m.appendLines(strings.Split(response, "\n")...)
			m.appendLines("")
		}
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

			if strings.HasPrefix(input, "/plan ") {
				m.processing = true
				return m, preparePlanCmd(m.ctx, m.sess, m.state, input)
			}
			if input == "/start" {
				if m.state.pendingPlan == nil {
					m.appendLines("当前没有缓存计划。请先输入 /plan <任务>。", "")
					return m, nil
				}
				m.processing = true
				return m, executePlanCmd(m.ctx, m.sess, m.state)
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
			requestInput := enrichInputWithSkills(input, m.state.skills)
			return m, processInputCmd(m.ctx, m.sess, m.state, requestInput)
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
		badgeGreenStyle.Render(displayModeLabel(m.state.mode)),
		" ",
		badgeGrayStyle.Render(displayAgentLabel(m.state.agentType)),
		"  ",
		hintStyle.Render(fmt.Sprintf("%d tools", len(m.sess.ToolNames()))),
		"  ",
		hintStyle.Render(fmt.Sprintf("模型: %s", m.sess.ModelInfo())),
		"  ",
		hintStyle.Render(fmt.Sprintf("skills: %d", len(m.state.skills))),
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
		return []string{"TUI 模式下请使用普通终端输入 /model，或运行 secbot model。", ""}, true, false
	case input == "/agent" || strings.HasPrefix(input, "/agent "):
		return handleAgentCommand(input, m.state), true, false
	case input == "/ask" || strings.HasPrefix(input, "/ask "):
		body := strings.TrimSpace(strings.TrimPrefix(input, "/ask"))
		if body == "" {
			m.state.mode = "ask"
			return []string{"已切换到 Ask 模式：后续输入仅问答，不执行工具。", ""}, true, false
		}
		if strings.EqualFold(body, "off") || strings.EqualFold(body, "agent") {
			m.state.mode = "agent"
			return []string{"已切换到 default 模式：后续输入按任务自动规划/执行。", ""}, true, false
		}
		return nil, false, false
	case input == "/plan" || strings.HasPrefix(input, "/plan ") || input == "/start" || strings.HasPrefix(input, "/start "):
		if input == "/plan" {
			lines := []string{"用法: /plan <任务>", "生成计划后输入 /start 执行。"}
			if m.state.pendingPlan != nil && m.state.pendingPlan.PlanResult != nil {
				lines = append(lines, "", "当前缓存计划:")
				lines = append(lines, formatPreparedPlan(m.state.pendingPlan)...)
			}
			lines = append(lines, "")
			return lines, true, false
		}
		return []string{"/start 只执行最近一次 /plan 生成的缓存计划；新的任务请先使用 /plan <任务>。", ""}, true, false
	case input == "/accept" || input == "/reject":
		return []string{"当前没有待确认操作。", ""}, true, false
	case input == "/version":
		return []string{fmt.Sprintf("SecBot v%s (Go)", version), ""}, true, false
	case strings.HasPrefix(input, "/"):
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

func processInputCmd(ctx context.Context, sess *session.Session, state *cliRuntimeState, input string) tea.Cmd {
	return func() tea.Msg {
		resp, err := sess.HandleWithOptions(ctx, input, state.processOptions())
		return processResultMsg{response: resp, err: err}
	}
}

func preparePlanCmd(ctx context.Context, sess *session.Session, state *cliRuntimeState, input string) tea.Cmd {
	return func() tea.Msg {
		body := strings.TrimSpace(strings.TrimPrefix(input, "/plan"))
		requestInput := enrichInputWithSkills(body, state.skills)
		prepared, err := sess.PreparePlan(ctx, requestInput, &models.ProcessOptions{
			ForceAgentFlow: true,
			AgentType:      state.agentType,
		})
		return planPreparedMsg{prepared: prepared, err: err}
	}
}

func executePlanCmd(ctx context.Context, sess *session.Session, state *cliRuntimeState) tea.Cmd {
	return func() tea.Msg {
		resp, err := sess.ExecutePreparedPlan(ctx, state.pendingPlan, &models.ProcessOptions{
			AgentType: state.agentType,
		})
		return planExecutedMsg{response: resp, err: err}
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
		return buildSkillListLines(m.state.skills)
	}

	if strings.HasPrefix(trimmed, "/skill add ") {
		name, description, err := parseSkillAddCommand(trimmed)
		if err != nil {
			return []string{fmt.Sprintf("新增 skill 失败: %v", err), "输入 /skill help 查看用法", ""}
		}
		for _, skill := range m.state.skills {
			if strings.EqualFold(skill.Name, name) {
				return []string{
					fmt.Sprintf("新增 skill 失败: 名称 %q 已存在", name),
					"可改用其他名称，或先编辑 data/skills.json。",
					"",
				}
			}
		}

		m.state.skills = append(m.state.skills, skillEntry{
			Name:        name,
			Description: description,
			CreatedAt:   time.Now().Format(time.RFC3339),
		})
		sort.Slice(m.state.skills, func(i, j int) bool {
			return strings.ToLower(m.state.skills[i].Name) < strings.ToLower(m.state.skills[j].Name)
		})
		if err := saveSkills(m.state.skills); err != nil {
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
		Short: "切换推理后端与模型",
		Run: func(cmd *cobra.Command, args []string) {
			_ = godotenv.Load()
			if _, err := runModelSelector(config.Load(), os.Stdin, os.Stdout); err != nil {
				color.Red("模型切换失败: %v", err)
				os.Exit(1)
			}
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
