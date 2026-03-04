package patterns

import (
	"context"
	"fmt"
	"strings"

	"github.com/tmc/langchaingo/llms"
)

type RouteHandler func(ctx context.Context, input string) (string, error)

type RouteCategory struct {
	Name        string
	Description string
	Handler     RouteHandler
}

type Router struct {
	Classifier llms.Model
	Categories []RouteCategory
	Fallback   RouteHandler
}

func NewRouter(classifier llms.Model, categories []RouteCategory, fallback RouteHandler) *Router {
	return &Router{
		Classifier: classifier,
		Categories: categories,
		Fallback:   fallback,
	}
}

type RouteResult struct {
	Category string
	Output   string
}

func (r *Router) Route(ctx context.Context, input string) (*RouteResult, error) {
	category, err := r.classify(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("分类失败: %w", err)
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

	return nil, fmt.Errorf("未找到分类 %q 对应的处理器", category)
}

func (r *Router) classify(ctx context.Context, input string) (string, error) {
	var catList strings.Builder
	for _, cat := range r.Categories {
		fmt.Fprintf(&catList, "- %s: %s\n", cat.Name, cat.Description)
	}

	prompt := fmt.Sprintf(`将以下输入分类到恰好一个类别中：

%s
输入: %s

仅回复类别名称，不要回复其他内容。`, catList.String(), input)

	response, err := llms.GenerateFromSinglePrompt(ctx, r.Classifier, prompt,
		llms.WithTemperature(0.0),
		llms.WithMaxTokens(50),
	)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(response), nil
}

func LLMHandler(llm llms.Model, systemPrompt string) RouteHandler {
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
			return "", fmt.Errorf("LLM 无响应")
		}
		return resp.Choices[0].Content, nil
	}
}
