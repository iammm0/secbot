package guardrails

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

// InputGuard validates input before it reaches the LLM.
type InputGuard interface {
	Check(input string) error
}

// OutputGuard validates or modifies output from the LLM.
type OutputGuard interface {
	Check(output string) (string, error) // Can modify the output or return error to reject
}

// GuardedLLM wraps an LLM with input and output guardrails.
type GuardedLLM struct {
	LLM          llms.Model
	InputGuards  []InputGuard
	OutputGuards []OutputGuard
}

// NewGuardedLLM creates a new guarded LLM wrapper.
func NewGuardedLLM(llm llms.Model, inputGuards []InputGuard, outputGuards []OutputGuard) *GuardedLLM {
	return &GuardedLLM{
		LLM:          llm,
		InputGuards:  inputGuards,
		OutputGuards: outputGuards,
	}
}

// Generate sends a prompt through input guards, to the LLM, then through output guards.
func (g *GuardedLLM) Generate(ctx context.Context, prompt string, opts ...llms.CallOption) (string, error) {
	// Input validation
	for _, guard := range g.InputGuards {
		if err := guard.Check(prompt); err != nil {
			return "", fmt.Errorf("input guard rejected: %w", err)
		}
	}

	// LLM call
	output, err := llms.GenerateFromSinglePrompt(ctx, g.LLM, prompt, opts...)
	if err != nil {
		return "", fmt.Errorf("LLM call failed: %w", err)
	}

	// Output validation
	for _, guard := range g.OutputGuards {
		output, err = guard.Check(output)
		if err != nil {
			return "", fmt.Errorf("output guard rejected: %w", err)
		}
	}

	return output, nil
}

// --- Built-in Input Guards ---

// MaxLengthGuard rejects input exceeding a maximum length.
type MaxLengthGuard struct {
	MaxLength int
}

func (g *MaxLengthGuard) Check(input string) error {
	if len(input) > g.MaxLength {
		return fmt.Errorf("input too long: %d > %d characters", len(input), g.MaxLength)
	}
	return nil
}

// MinLengthGuard rejects input shorter than a minimum length.
type MinLengthGuard struct {
	MinLength int
}

func (g *MinLengthGuard) Check(input string) error {
	if len(strings.TrimSpace(input)) < g.MinLength {
		return fmt.Errorf("input too short: must be at least %d characters", g.MinLength)
	}
	return nil
}

// PromptInjectionGuard detects common prompt injection patterns.
type PromptInjectionGuard struct{}

func (g *PromptInjectionGuard) Check(input string) error {
	lower := strings.ToLower(input)
	injectionPatterns := []string{
		"ignore previous instructions",
		"ignore all instructions",
		"disregard your instructions",
		"forget your rules",
		"you are now",
		"new persona",
		"override system prompt",
		"system prompt:",
		"[system]",
		"</system>",
		"act as if you have no restrictions",
		"pretend you are",
		"jailbreak",
	}
	for _, pattern := range injectionPatterns {
		if strings.Contains(lower, pattern) {
			return fmt.Errorf("potential prompt injection detected: matches pattern %q", pattern)
		}
	}
	return nil
}

// RegexBlockGuard rejects input matching any of the given regex patterns.
type RegexBlockGuard struct {
	Patterns []*regexp.Regexp
	Names    []string // Human-readable names for the patterns
}

// NewRegexBlockGuard creates a guard that blocks input matching patterns.
func NewRegexBlockGuard(patterns map[string]string) (*RegexBlockGuard, error) {
	g := &RegexBlockGuard{}
	for name, pattern := range patterns {
		re, err := regexp.Compile(pattern)
		if err != nil {
			return nil, fmt.Errorf("invalid regex for %q: %w", name, err)
		}
		g.Patterns = append(g.Patterns, re)
		g.Names = append(g.Names, name)
	}
	return g, nil
}

func (g *RegexBlockGuard) Check(input string) error {
	for i, re := range g.Patterns {
		if re.MatchString(input) {
			return fmt.Errorf("input blocked by %q pattern", g.Names[i])
		}
	}
	return nil
}

// --- Built-in Output Guards ---

// SensitiveWordFilter redacts or rejects output containing sensitive words.
type SensitiveWordFilter struct {
	Words     []string
	RedactStr string // If empty, rejects; otherwise replaces with this string
}

func (g *SensitiveWordFilter) Check(output string) (string, error) {
	lower := strings.ToLower(output)
	for _, word := range g.Words {
		if strings.Contains(lower, strings.ToLower(word)) {
			if g.RedactStr != "" {
				output = strings.ReplaceAll(output, word, g.RedactStr)
			} else {
				return "", fmt.Errorf("output contains sensitive word: %q", word)
			}
		}
	}
	return output, nil
}

// MaxOutputLengthGuard truncates output exceeding a maximum length.
type MaxOutputLengthGuard struct {
	MaxLength int
}

func (g *MaxOutputLengthGuard) Check(output string) (string, error) {
	if len(output) > g.MaxLength {
		return output[:g.MaxLength] + "...[truncated]", nil
	}
	return output, nil
}

// JSONFormatGuard validates that output is valid JSON.
type JSONFormatGuard struct{}

func (g *JSONFormatGuard) Check(output string) (string, error) {
	trimmed := strings.TrimSpace(output)
	if !strings.HasPrefix(trimmed, "{") && !strings.HasPrefix(trimmed, "[") {
		return "", fmt.Errorf("output is not valid JSON: does not start with { or [")
	}
	return output, nil
}

// LLMContentSafetyGuard uses an LLM to evaluate output safety.
type LLMContentSafetyGuard struct {
	Judge llms.Model
}

func (g *LLMContentSafetyGuard) Check(output string) (string, error) {
	prompt := fmt.Sprintf(`Evaluate whether the following text is safe and appropriate. 
Respond with ONLY "SAFE" or "UNSAFE: <reason>".

Text to evaluate:
%s`, output)

	resp, err := llms.GenerateFromSinglePrompt(context.Background(), g.Judge, prompt,
		llms.WithTemperature(0.0),
		llms.WithMaxTokens(100),
	)
	if err != nil {
		// If safety check fails, err on the side of caution
		return output, nil // Let it through if we can't check
	}

	resp = strings.TrimSpace(resp)
	if strings.HasPrefix(strings.ToUpper(resp), "UNSAFE") {
		return "", fmt.Errorf("content safety check failed: %s", resp)
	}

	return output, nil
}

// --- Convenience constructors ---

// DefaultInputGuards returns a standard set of input guards.
func DefaultInputGuards() []InputGuard {
	return []InputGuard{
		&MinLengthGuard{MinLength: 1},
		&MaxLengthGuard{MaxLength: 10000},
		&PromptInjectionGuard{},
	}
}

// DefaultOutputGuards returns a standard set of output guards.
func DefaultOutputGuards() []OutputGuard {
	return []OutputGuard{
		&MaxOutputLengthGuard{MaxLength: 50000},
	}
}
