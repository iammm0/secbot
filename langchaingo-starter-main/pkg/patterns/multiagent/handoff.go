package multiagent

import (
	"context"
	"fmt"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

// Handoff represents a context transfer between two agents.
type Handoff struct {
	FromAgent string `json:"from_agent"`
	ToAgent   string `json:"to_agent"`
	Context   string `json:"context"`
	Reason    string `json:"reason"`
}

// ConversationEntry is a single turn in a multi-agent conversation.
type ConversationEntry struct {
	Agent  string `json:"agent"`
	Input  string `json:"input"`
	Output string `json:"output"`
}

// HandoffResult holds the complete handoff chain result.
type HandoffResult struct {
	Handoffs     []Handoff           `json:"handoffs"`
	Conversation []ConversationEntry `json:"conversation"`
	FinalOutput  string              `json:"final_output"`
	FinalAgent   string              `json:"final_agent"`
}

// HandoffChain manages sequential agent handoffs where each agent can
// decide to handle the task or pass it to another agent.
type HandoffChain struct {
	Agents    map[string]*WorkerAgent
	StartAgent string
	MaxHandoffs int
}

// NewHandoffChain creates a new handoff chain starting with the specified agent.
func NewHandoffChain(startAgent string, maxHandoffs int, agents ...*WorkerAgent) *HandoffChain {
	agentMap := make(map[string]*WorkerAgent)
	for _, a := range agents {
		agentMap[a.Name] = a
	}
	return &HandoffChain{
		Agents:      agentMap,
		StartAgent:  startAgent,
		MaxHandoffs: maxHandoffs,
	}
}

// Execute runs the handoff chain. Each agent either produces a final answer
// or hands off to another agent with context.
func (h *HandoffChain) Execute(ctx context.Context, input string) (*HandoffResult, error) {
	result := &HandoffResult{
		Handoffs:     make([]Handoff, 0),
		Conversation: make([]ConversationEntry, 0),
	}

	currentAgent := h.StartAgent
	currentInput := input
	var contextSoFar strings.Builder

	agentNames := h.agentNames()

	for i := 0; i <= h.MaxHandoffs; i++ {
		agent, ok := h.Agents[currentAgent]
		if !ok {
			return nil, fmt.Errorf("agent %q not found", currentAgent)
		}

		// Build prompt with handoff awareness
		prompt := h.buildHandoffPrompt(agent, currentInput, contextSoFar.String(), agentNames)

		messages := []llms.MessageContent{
			llms.TextParts(llms.ChatMessageTypeSystem, agent.SystemPrompt),
			llms.TextParts(llms.ChatMessageTypeHuman, prompt),
		}

		resp, err := agent.LLM.GenerateContent(ctx, messages)
		if err != nil {
			return nil, fmt.Errorf("agent %q failed: %w", currentAgent, err)
		}
		if len(resp.Choices) == 0 {
			return nil, fmt.Errorf("no response from agent %q", currentAgent)
		}

		output := resp.Choices[0].Content
		result.Conversation = append(result.Conversation, ConversationEntry{
			Agent:  currentAgent,
			Input:  currentInput,
			Output: output,
		})

		// Check if agent wants to hand off
		handoffTarget, reason, remaining := parseHandoff(output, agentNames)
		if handoffTarget != "" && i < h.MaxHandoffs {
			handoff := Handoff{
				FromAgent: currentAgent,
				ToAgent:   handoffTarget,
				Context:   remaining,
				Reason:    reason,
			}
			result.Handoffs = append(result.Handoffs, handoff)
			contextSoFar.WriteString(fmt.Sprintf("[%s]: %s\n", currentAgent, remaining))
			currentAgent = handoffTarget
			currentInput = fmt.Sprintf("%s\n\nContext from %s: %s", input, handoff.FromAgent, remaining)
		} else {
			// Final answer
			result.FinalOutput = output
			result.FinalAgent = currentAgent
			return result, nil
		}
	}

	// Max handoffs reached
	result.FinalOutput = result.Conversation[len(result.Conversation)-1].Output
	result.FinalAgent = currentAgent
	return result, nil
}

func (h *HandoffChain) buildHandoffPrompt(agent *WorkerAgent, input, context string, agentNames []string) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Task: %s\n", input)
	if context != "" {
		fmt.Fprintf(&sb, "\nPrevious context:\n%s\n", context)
	}
	fmt.Fprintf(&sb, "\nYou can either:\n1. Provide a direct final answer\n2. Hand off to another agent by starting your response with 'HANDOFF TO <agent_name>: <reason>'\n\nAvailable agents to hand off to: %s\n",
		strings.Join(agentNames, ", "))
	return sb.String()
}

func (h *HandoffChain) agentNames() []string {
	names := make([]string, 0, len(h.Agents))
	for name := range h.Agents {
		names = append(names, name)
	}
	return names
}

// parseHandoff checks if the output contains a handoff instruction.
func parseHandoff(output string, validAgents []string) (target, reason, remaining string) {
	upper := strings.ToUpper(output)
	if !strings.HasPrefix(upper, "HANDOFF TO ") {
		return "", "", ""
	}

	rest := output[len("HANDOFF TO "):]
	// Find the colon separator
	colonIdx := strings.Index(rest, ":")
	if colonIdx < 0 {
		return "", "", ""
	}

	targetName := strings.TrimSpace(rest[:colonIdx])
	afterColon := strings.TrimSpace(rest[colonIdx+1:])

	// Validate target agent
	for _, name := range validAgents {
		if strings.EqualFold(name, targetName) {
			// Split reason from remaining context
			lines := strings.SplitN(afterColon, "\n", 2)
			reason = strings.TrimSpace(lines[0])
			if len(lines) > 1 {
				remaining = strings.TrimSpace(lines[1])
			} else {
				remaining = reason
			}
			return name, reason, remaining
		}
	}

	return "", "", ""
}
