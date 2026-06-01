package contextmgr

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"secbot/internal/database"
	"secbot/internal/memory"
	"secbot/internal/models"
)

type FocusKeyword struct {
	Keyword    string
	Weight     float64
	LastSeenAt time.Time
}

type ContextItem struct {
	ID             string
	Content        string
	Source         string
	Priority       float64
	TokensEstimate int
	CreatedAt      time.Time
}

type SessionState struct {
	Focus      []FocusKeyword
	Pinned     []ContextItem
	Unresolved []string
	ModelName  string
}

type DebugMeta struct {
	SessionMessages int      `json:"session_messages"`
	SQLiteTurns     int      `json:"sqlite_turns"`
	VectorHits      int      `json:"vector_hits"`
	MemoryLines     int      `json:"memory_lines"`
	Pinned          int      `json:"pinned"`
	Focus           []string `json:"focus"`
	PromptBudget    int      `json:"prompt_budget"`
	UsedTokens      int      `json:"used_tokens"`
	DroppedSections []string `json:"dropped_sections"`
	ModelName       string   `json:"model"`
	ContextWindow   int      `json:"context_window"`
	ReservedTokens  int      `json:"reserved_tokens"`
}

type AssembledContext struct {
	ContextBlock string
	Debug        DebugMeta
}

type Patch struct {
	Facts          []ContextItem
	Pinned         []ContextItem
	Unresolved     []string
	SuggestedFocus []string
	ExploreSummary string
}

type Store struct {
	sessions map[string]*SessionState
}

func NewStore() *Store {
	return &Store{sessions: make(map[string]*SessionState)}
}

func (s *Store) Get(sessionID string) *SessionState {
	if sessionID == "" {
		sessionID = "default"
	}
	state := s.sessions[sessionID]
	if state == nil {
		state = &SessionState{}
		s.sessions[sessionID] = state
	}
	return state
}

type Assembler struct {
	store *Store
	mem   *memory.Manager
	db    *database.Manager
}

func NewAssembler(mem *memory.Manager, db ...*database.Manager) *Assembler {
	var manager *database.Manager
	if len(db) > 0 {
		manager = db[0]
	}
	return &Assembler{store: NewStore(), mem: mem, db: manager}
}

func (a *Assembler) UpdateFocusFromInput(sessionID, input string) []string {
	keywords := ExtractFocusKeywords(input)
	if len(keywords) > 0 {
		a.mergeFocus(sessionID, keywords, 1.0)
	}
	return keywords
}

func (a *Assembler) MergeIntentFocus(sessionID string, keywords []string) {
	a.mergeFocus(sessionID, keywords, 1.5)
}

func (a *Assembler) ApplyPatch(sessionID string, patch Patch) {
	state := a.store.Get(sessionID)
	for _, item := range append(patch.Facts, patch.Pinned...) {
		if strings.TrimSpace(item.Content) == "" {
			continue
		}
		if item.Source == "" {
			item.Source = "explore"
		}
		if item.Priority == 0 {
			item.Priority = 0.9
		}
		if item.CreatedAt.IsZero() {
			item.CreatedAt = time.Now()
		}
		if item.TokensEstimate == 0 {
			item.TokensEstimate = ApproxTokens(item.Content)
		}
		state.Pinned = append(state.Pinned, item)
	}
	if len(patch.Unresolved) > 0 {
		state.Unresolved = append(state.Unresolved, normalizeStringList(patch.Unresolved, 12)...)
	}
	if len(patch.SuggestedFocus) > 0 {
		a.mergeFocus(sessionID, patch.SuggestedFocus, 1.25)
	}
	if len(state.Pinned) > 32 {
		state.Pinned = state.Pinned[len(state.Pinned)-32:]
	}
}

func (a *Assembler) Focus(sessionID string) []string {
	state := a.store.Get(sessionID)
	out := make([]string, 0, len(state.Focus))
	for _, item := range sortedFocus(state.Focus) {
		out = append(out, item.Keyword)
	}
	return out
}

func (a *Assembler) Unresolved(sessionID string) []string {
	state := a.store.Get(sessionID)
	return append([]string(nil), state.Unresolved...)
}

func (a *Assembler) Build(query string, session *models.Session, sessionID, agentType, modelName string) AssembledContext {
	state := a.store.Get(sessionID)
	state.ModelName = modelName
	window, reserved := modelWindow(modelName)
	budget := computePromptBudget(window, reserved)

	candidates := make([]ContextItem, 0)
	candidates = append(candidates, state.Pinned...)

	recent := session.Messages
	if len(recent) > 24 {
		recent = recent[len(recent)-24:]
	}
	for i, msg := range recent {
		content := fmt.Sprintf("%s: %s", msg.Role, msg.Content)
		priority := 0.5
		if len(recent) > 1 {
			priority = 0.5 + (float64(i)/float64(len(recent)-1))*0.3
		}
		candidates = append(candidates, ContextItem{
			ID:             fmt.Sprintf("recent-%d-%d", i, msg.Timestamp.UnixNano()),
			Content:        content,
			Source:         "recent",
			Priority:       priority,
			TokensEstimate: ApproxTokens(content),
			CreatedAt:      msg.Timestamp,
		})
	}

	sqliteTurns := 0
	if a.db != nil {
		history, err := a.db.GetConversations(sessionID, 16)
		if err == nil && len(history) > 0 {
			reverseConversations(history)
			pendingUser := ""
			for idx, turn := range history {
				role := strings.ToLower(strings.TrimSpace(turn.Role))
				switch role {
				case string(models.RoleUser), "human":
					pendingUser = strings.TrimSpace(turn.Content)
				case string(models.RoleAssistant), "ai":
					assistant := strings.TrimSpace(turn.Content)
					if pendingUser == "" && assistant == "" {
						continue
					}
					content := fmt.Sprintf("用户: %s\n助手: %s", pendingUser, assistant)
					candidates = append(candidates, ContextItem{
						ID:             fmt.Sprintf("sqlite-%d-%d", idx, turn.ID),
						Content:        content,
						Source:         "sqlite",
						Priority:       0.45 + focusBoost(content, a.Focus(sessionID)),
						TokensEstimate: ApproxTokens(content),
						CreatedAt:      nonZeroTime(turn.Timestamp),
					})
					sqliteTurns++
					pendingUser = ""
				}
			}
			if pendingUser != "" {
				content := fmt.Sprintf("用户: %s", pendingUser)
				candidates = append(candidates, ContextItem{
					ID:             "sqlite-pending-user",
					Content:        content,
					Source:         "sqlite",
					Priority:       0.4 + focusBoost(content, a.Focus(sessionID)),
					TokensEstimate: ApproxTokens(content),
					CreatedAt:      time.Now(),
				})
				sqliteTurns++
			}
		}
	}

	focus := a.Focus(sessionID)
	vectorHits := 0
	if a.mem != nil {
		vectorQuery := strings.TrimSpace(query + " " + strings.Join(focus, " "))
		for _, hit := range a.mem.SearchEpisodic(vectorQuery, 8) {
			content := strings.TrimSpace(hit.Content)
			if content == "" {
				continue
			}
			rendered := fmt.Sprintf("%s\n来源: %s / 相似度: %.3f", content, hit.Key, hit.Similarity)
			candidates = append(candidates, ContextItem{
				ID:             fmt.Sprintf("vec-%d", vectorHits),
				Content:        rendered,
				Source:         "vector",
				Priority:       minFloat(0.85, 0.35+hit.Similarity*0.4+focusBoost(content, focus)),
				TokensEstimate: ApproxTokens(rendered),
				CreatedAt:      nonZeroTime(hit.Timestamp),
			})
			vectorHits++
		}
	}

	memoryLines := 0
	if a.mem != nil {
		summary := strings.TrimSpace(a.mem.GetContextSummary())
		if summary != "" {
			memoryLines = len(strings.Split(summary, "\n"))
			candidates = append(candidates, ContextItem{
				ID:             "memory-summary",
				Content:        summary,
				Source:         "memory",
				Priority:       0.45 + focusBoost(summary, focus),
				TokensEstimate: ApproxTokens(summary),
				CreatedAt:      time.Now(),
			})
		}
	}

	selected, dropped, used := packByBudget(candidates, budget)
	block := renderSections(selected)

	meta := fmt.Sprintf("【RequestMeta】\nsession_id: %s\nagent: %s\nmodel: %s\ncontext_window: %d\nprompt_budget: %d\nused_tokens(approx): %d\nfocus: %s\nunresolved: %s",
		sessionID,
		agentType,
		emptyDefault(modelName, "(default)"),
		window,
		budget,
		used,
		listOrNone(focus, ", "),
		listOrNone(state.Unresolved, "; "),
	)
	contextBlock := meta
	if block != "" {
		contextBlock = block + "\n\n" + meta
	}

	return AssembledContext{
		ContextBlock: contextBlock,
		Debug: DebugMeta{
			SessionMessages: len(recent),
			SQLiteTurns:     sqliteTurns,
			VectorHits:      vectorHits,
			MemoryLines:     memoryLines,
			Pinned:          len(state.Pinned),
			Focus:           focus,
			PromptBudget:    budget,
			UsedTokens:      used,
			DroppedSections: droppedSources(dropped),
			ModelName:       modelName,
			ContextWindow:   window,
			ReservedTokens:  reserved,
		},
	}
}

func (a *Assembler) RememberTurn(sessionID, agentType, userMessage, assistantMessage string) {
	if a.db != nil {
		metadata := "{}"
		if raw, err := json.Marshal(map[string]string{
			"agentType": agentType,
			"createdAt": time.Now().Format(time.RFC3339),
		}); err == nil {
			metadata = string(raw)
		}
		_ = a.db.SaveConversation(sessionID, agentType, string(models.RoleUser), userMessage, metadata)
		_ = a.db.SaveConversation(sessionID, agentType, string(models.RoleAssistant), assistantMessage, metadata)
	}
	if a.mem == nil {
		return
	}
	merged := fmt.Sprintf("用户: %s\n助手: %s", userMessage, assistantMessage)
	a.mem.AddSystemContext(merged)
	a.mem.Remember(sessionID+":"+agentType+":"+time.Now().Format(time.RFC3339Nano), merged, 0.75)
}

func (a *Assembler) mergeFocus(sessionID string, keywords []string, boost float64) {
	state := a.store.Get(sessionID)
	now := time.Now()
	for _, raw := range keywords {
		kw := strings.TrimSpace(strings.ToLower(raw))
		if kw == "" {
			continue
		}
		found := false
		for i := range state.Focus {
			if state.Focus[i].Keyword == kw {
				state.Focus[i].Weight += boost
				state.Focus[i].LastSeenAt = now
				found = true
				break
			}
		}
		if !found {
			state.Focus = append(state.Focus, FocusKeyword{Keyword: kw, Weight: boost, LastSeenAt: now})
		}
	}
	if len(state.Focus) > 24 {
		state.Focus = sortedFocus(state.Focus)[:24]
	}
}

func ExtractFocusKeywords(text string) []string {
	patterns := []string{
		`\b\d{1,3}(?:\.\d{1,3}){3}\b`,
		`\bcve-\d{4}-\d{4,7}\b`,
		`\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b`,
		`https?://[^\s)>"']+`,
		`\bport\s*\d{1,5}\b`,
		`\b(?:http|https|ftp|ssh|smb|smtp|imap|pop3|ldap|rdp|mysql|redis|mongo|mssql|postgres)\b`,
	}
	seen := make(map[string]bool)
	out := make([]string, 0, 12)
	for _, pat := range patterns {
		re := regexp.MustCompile("(?i)" + pat)
		for _, match := range re.FindAllString(text, -1) {
			item := strings.ToLower(match)
			if !seen[item] {
				seen[item] = true
				out = append(out, item)
				if len(out) >= 12 {
					return out
				}
			}
		}
	}
	return out
}

func ApproxTokens(text string) int {
	n := utf8.RuneCountInString(text)
	if n == 0 {
		return 0
	}
	tokens := n / 4
	if tokens < 1 {
		return 1
	}
	return tokens
}

func packByBudget(items []ContextItem, budget int) ([]ContextItem, []ContextItem, int) {
	dedupe := make(map[string]ContextItem)
	for _, item := range items {
		key := strings.TrimSpace(item.Content)
		if key == "" {
			continue
		}
		if existing, ok := dedupe[key]; !ok || existing.Priority < item.Priority {
			dedupe[key] = item
		}
	}
	unique := make([]ContextItem, 0, len(dedupe))
	for _, item := range dedupe {
		unique = append(unique, item)
	}
	sort.Slice(unique, func(i, j int) bool {
		if unique[i].Priority == unique[j].Priority {
			return unique[i].CreatedAt.After(unique[j].CreatedAt)
		}
		return unique[i].Priority > unique[j].Priority
	})
	selected := make([]ContextItem, 0)
	dropped := make([]ContextItem, 0)
	used := 0
	for _, item := range unique {
		if used+item.TokensEstimate > budget {
			dropped = append(dropped, item)
			continue
		}
		selected = append(selected, item)
		used += item.TokensEstimate
	}
	return selected, dropped, used
}

func renderSections(items []ContextItem) string {
	groups := map[string][]string{
		"Pinned":        {},
		"RecentSession": {},
		"SQLiteHistory": {},
		"VectorMemory":  {},
		"Memory":        {},
	}
	for _, item := range items {
		switch item.Source {
		case "explore", "user_pinned":
			groups["Pinned"] = append(groups["Pinned"], item.Content)
		case "recent":
			groups["RecentSession"] = append(groups["RecentSession"], item.Content)
		case "sqlite":
			groups["SQLiteHistory"] = append(groups["SQLiteHistory"], item.Content)
		case "vector":
			groups["VectorMemory"] = append(groups["VectorMemory"], item.Content)
		default:
			groups["Memory"] = append(groups["Memory"], item.Content)
		}
	}
	sections := make([]string, 0)
	for _, name := range []string{"Pinned", "RecentSession", "SQLiteHistory", "VectorMemory", "Memory"} {
		if len(groups[name]) > 0 {
			sections = append(sections, fmt.Sprintf("【%s】\n%s", name, strings.Join(groups[name], "\n\n")))
		}
	}
	return strings.Join(sections, "\n\n")
}

func sortedFocus(items []FocusKeyword) []FocusKeyword {
	out := append([]FocusKeyword(nil), items...)
	sort.Slice(out, func(i, j int) bool {
		if out[i].Weight == out[j].Weight {
			return out[i].LastSeenAt.After(out[j].LastSeenAt)
		}
		return out[i].Weight > out[j].Weight
	})
	return out
}

func focusBoost(content string, focus []string) float64 {
	lower := strings.ToLower(content)
	hits := 0
	for _, kw := range focus {
		if kw != "" && strings.Contains(lower, strings.ToLower(kw)) {
			hits++
		}
	}
	if hits > 4 {
		hits = 4
	}
	return float64(hits) * 0.05
}

func droppedSources(items []ContextItem) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.Source)
	}
	return out
}

func modelWindow(modelName string) (int, int) {
	lower := strings.ToLower(modelName)
	switch {
	case strings.Contains(lower, "gpt-4o"), strings.Contains(lower, "gpt-5"), strings.Contains(lower, "deepseek"), strings.Contains(lower, "qwen"):
		return 128000, 12000
	case strings.Contains(lower, "claude"):
		return 200000, 12000
	case strings.Contains(lower, "gpt-4"):
		return 8192, 3000
	default:
		return 32768, 6000
	}
}

func computePromptBudget(window, reserved int) int {
	budget := int(float64(window-reserved) * 0.45)
	if budget < 2000 {
		return 2000
	}
	if budget > 24000 {
		return 24000
	}
	return budget
}

func listOrNone(items []string, sep string) string {
	if len(items) == 0 {
		return "(无)"
	}
	return strings.Join(items, sep)
}

func normalizeStringList(items []string, limit int) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(items))
	for _, raw := range items {
		item := strings.TrimSpace(strings.ToLower(raw))
		if item == "" || seen[item] {
			continue
		}
		seen[item] = true
		out = append(out, item)
		if len(out) >= limit {
			break
		}
	}
	return out
}

func emptyDefault(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func reverseConversations(items []database.Conversation) {
	for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
		items[i], items[j] = items[j], items[i]
	}
}

func nonZeroTime(value time.Time) time.Time {
	if value.IsZero() {
		return time.Now()
	}
	return value
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
