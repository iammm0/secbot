package routing

import (
	"context"
	"fmt"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

// Handler processes a routed input and returns a response.
type Handler func(ctx context.Context, input string) (string, error)

// Category defines a routing target with its description and handler.
type Category struct {
	Name        string  // Category identifier (e.g., "technical", "creative", "math")
	Description string  // Used by the classifier to understand this category
	Handler     Handler // Function to handle inputs routed to this category
}

// Router uses an LLM to classify input and route it to the appropriate handler.
type Router struct {
	Classifier llms.Model
	Categories []Category
	Fallback   Handler // Called when no category matches
}

// NewRouter creates a new routing pattern instance.
func NewRouter(classifier llms.Model, categories []Category, fallback Handler) *Router {
	return &Router{
		Classifier: classifier,
		Categories: categories,
		Fallback:   fallback,
	}
}

// Route classifies the input and dispatches it to the matching handler.
func (r *Router) Route(ctx context.Context, input string) (string, error) {
	category, err := r.classify(ctx, input)
	if err != nil {
		return "", fmt.Errorf("classification failed: %w", err)
	}

	// Find the matching category handler
	for _, cat := range r.Categories {
		if strings.EqualFold(cat.Name, category) {
			return cat.Handler(ctx, input)
		}
	}

	// No match found, use fallback
	if r.Fallback != nil {
		return r.Fallback(ctx, input)
	}

	return "", fmt.Errorf("no handler found for category %q and no fallback configured", category)
}

// RouteResult holds the routing result with classification metadata.
type RouteResult struct {
	Category string
	Output   string
}

// RouteWithInfo routes and returns the classification info along with the result.
func (r *Router) RouteWithInfo(ctx context.Context, input string) (*RouteResult, error) {
	category, err := r.classify(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("classification failed: %w", err)
	}

	for _, cat := range r.Categories {
		if strings.EqualFold(cat.Name, category) {
			output, err := cat.Handler(ctx, input)
			if err != nil {
				return nil, err
			}
			return &RouteResult{Category: cat.Name, Output: output}, nil
		}
	}

	if r.Fallback != nil {
		output, err := r.Fallback(ctx, input)
		if err != nil {
			return nil, err
		}
		return &RouteResult{Category: "fallback", Output: output}, nil
	}

	return nil, fmt.Errorf("no handler for category %q", category)
}

func (r *Router) classify(ctx context.Context, input string) (string, error) {
	// Build category descriptions for the prompt
	var catList strings.Builder
	for _, cat := range r.Categories {
		fmt.Fprintf(&catList, "- %s: %s\n", cat.Name, cat.Description)
	}

	prompt := fmt.Sprintf(`You are a classifier. Classify the following input into exactly one of these categories:

%s
Input: %s

Respond with ONLY the category name, nothing else.`, catList.String(), input)

	response, err := llms.GenerateFromSinglePrompt(ctx, r.Classifier, prompt,
		llms.WithTemperature(0.0),
		llms.WithMaxTokens(50),
	)
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(response), nil
}

// LLMHandler creates a handler that uses an LLM with a system prompt.
func LLMHandler(llm llms.Model, systemPrompt string) Handler {
	return func(ctx context.Context, input string) (string, error) {
		messages := []llms.MessageContent{
			llms.TextParts(llms.ChatMessageTypeSystem, systemPrompt),
			llms.TextParts(llms.ChatMessageTypeHuman, input),
		}
		resp, err := llm.GenerateContent(ctx, messages)
		if err != nil {
			return "", err
		}
		if len(resp.Choices) == 0 {
			return "", fmt.Errorf("no response from LLM")
		}
		return resp.Choices[0].Content, nil
	}
}
