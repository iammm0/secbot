package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"secbot/config"
	"secbot/internal/cli"
	"secbot/internal/models"
	"secbot/internal/session"
	"secbot/internal/tools"
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

	slashCommands = []string{
		"/help",
		"/h",
		"/tools",
		"/skill",
		"/doctor",
		"/env",
		"/model",
		"/clear",
		"/version",
		"/exit",
		"/quit",
	}

	pageStyle = lipgloss.NewStyle().Padding(0, 1)

	headerBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("40")).
			Padding(0, 1)
	historyBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.NormalBorder()).
			BorderForeground(lipgloss.Color("34")).
			Padding(0, 1)
	suggestionBoxStyle = lipgloss.NewStyle().
				Border(lipgloss.NormalBorder()).
				BorderForeground(lipgloss.Color("28")).
				Padding(0, 1)
	inputBoxStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color("34")).
			Padding(0, 1)

	brandStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("46")).
			Bold(true)
	accentStyle = lipgloss.NewStyle().
			Foreground(lipgloss.Color("84")).
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
	program := tea.NewProgram(newTUIModel(ctx, sess, mode), tea.WithAltScreen())
	if _, err := program.Run(); err != nil {
		color.Red("终端界面启动失败: %v", err)
		os.Exit(1)
	}
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
	suggestions []string
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
	height := m.height
	if height <= 0 {
		height = 30
	}

	containerWidth := max(width-2, 30)

	header := headerBoxStyle.Width(containerWidth).Render(
		strings.Join([]string{
			brandStyle.Render("SECBOT") + " " + accentStyle.Render("绿色全屏终端"),
			hintStyle.Render(fmt.Sprintf("模型: %s", m.sess.ModelInfo())),
			hintStyle.Render(fmt.Sprintf("skills: %d  (使用 /skill 管理)", len(m.skills))),
		}, "\n"),
	)

	suggestionBlock := m.renderSuggestions(containerWidth)
	statusLine := m.renderStatus()
	inputBlock := inputBoxStyle.Width(containerWidth).Render(m.input.View())

	usedHeight := lipgloss.Height(header) + lipgloss.Height(suggestionBlock) + lipgloss.Height(statusLine) + lipgloss.Height(inputBlock) + 4
	historyHeight := height - usedHeight
	if historyHeight < 8 {
		historyHeight = 8
	}

	historyLines := lastLines(m.history, historyHeight-2)
	historyBlock := historyBoxStyle.Width(containerWidth).Height(historyHeight).Render(strings.Join(historyLines, "\n"))

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
		"SecBot - AI 安全测试机器人 (Go)",
		"输入你的问题或任务，输入 / 查看命令，输入 /exit 退出。",
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
		for _, cmd := range m.suggestions[:limit] {
			lines = append(lines, suggestionStyle.Render("  "+cmd))
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
	return statusReadyStyle.Render("Enter 发送  |  Ctrl+C 退出")
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
	registry := tools.SecurityRegistry()
	names := append([]string(nil), registry.Names()...)
	sort.Strings(names)

	lines := []string{
		"SecBot 帮助",
		"===========",
		"",
		"命令:",
		"  /help, /h     显示此帮助",
		"  /tools        列出可用安全工具",
		"  /skill        新增/查看自定义技能（/skill help）",
		"  /doctor, /env 检查当前环境变量与模型配置",
		"  /model        切换推理后端/模型",
		"  /clear        清空会话输出",
		"  /version      版本信息",
		"  exit, quit    退出",
		"",
		"使用示例:",
		"  扫描 example.com 的开放端口",
		"  检查 example.com 的 SSL 证书",
		"  分析 example.com 的 HTTP 安全头",
		"  查询 8.8.8.8 的地理位置",
		"",
		fmt.Sprintf("可用工具 (%d):", len(names)),
	}
	for _, name := range names {
		lines = append(lines, "  - "+name)
	}
	lines = append(lines, "")
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
	for _, cmd := range matches {
		lines = append(lines, "  - "+cmd)
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

func matchSlashCommands(input string) []string {
	prefix := strings.TrimSpace(input)
	matches := make([]string, 0, len(slashCommands))
	for _, cmd := range slashCommands {
		if prefix == "" || prefix == "/" || strings.HasPrefix(cmd, prefix) {
			matches = append(matches, cmd)
		}
	}
	return matches
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
