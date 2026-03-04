package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// SearchTool is a simulated web search tool.
type SearchTool struct{}

var _ interface {
	Name() string
	Description() string
	Call(ctx context.Context, input string) (string, error)
} = (*SearchTool)(nil)

func (s *SearchTool) Name() string {
	return "Search"
}

func (s *SearchTool) Description() string {
	return "Search the web for information. Input should be a search query string."
}

func (s *SearchTool) Call(_ context.Context, input string) (string, error) {
	query := strings.TrimSpace(strings.ToLower(input))
	if query == "" {
		return "", fmt.Errorf("empty search query")
	}

	// Simulated search results for common topics
	results := simulateSearch(query)
	output, err := json.Marshal(results)
	if err != nil {
		return "", fmt.Errorf("failed to marshal search results: %w", err)
	}
	return string(output), nil
}

type searchResult struct {
	Title   string `json:"title"`
	Snippet string `json:"snippet"`
	URL     string `json:"url"`
}

func simulateSearch(query string) []searchResult {
	knowledgeBase := []struct {
		keywords []string
		results  []searchResult
	}{
		{
			keywords: []string{"go", "golang", "programming"},
			results: []searchResult{
				{Title: "The Go Programming Language", Snippet: "Go is an open-source programming language designed for simplicity and efficiency. It features built-in concurrency with goroutines and channels.", URL: "https://go.dev"},
				{Title: "Go by Example", Snippet: "Go by Example is a hands-on introduction to Go using annotated example programs.", URL: "https://gobyexample.com"},
			},
		},
		{
			keywords: []string{"langchain", "llm", "ai agent"},
			results: []searchResult{
				{Title: "LangChain Documentation", Snippet: "LangChain is a framework for developing applications powered by large language models (LLMs).", URL: "https://docs.langchain.com"},
				{Title: "LangChainGo", Snippet: "LangChainGo is the Go language implementation of LangChain for building LLM-powered applications.", URL: "https://github.com/tmc/langchaingo"},
			},
		},
		{
			keywords: []string{"weather", "climate", "temperature"},
			results: []searchResult{
				{Title: "Weather.com - Global Weather", Snippet: "Get accurate weather forecasts for any location worldwide.", URL: "https://weather.com"},
			},
		},
		{
			keywords: []string{"python", "machine learning", "deep learning"},
			results: []searchResult{
				{Title: "Python.org", Snippet: "Python is a versatile programming language widely used in AI and machine learning.", URL: "https://python.org"},
				{Title: "scikit-learn", Snippet: "Simple and efficient tools for predictive data analysis built on NumPy, SciPy, and matplotlib.", URL: "https://scikit-learn.org"},
			},
		},
	}

	for _, entry := range knowledgeBase {
		for _, kw := range entry.keywords {
			if strings.Contains(query, kw) {
				return entry.results
			}
		}
	}

	// Default fallback
	return []searchResult{
		{
			Title:   fmt.Sprintf("Search results for: %s", query),
			Snippet: fmt.Sprintf("Multiple results found for '%s'. Please refine your query for more specific information.", query),
			URL:     fmt.Sprintf("https://search.example.com/?q=%s", strings.ReplaceAll(query, " ", "+")),
		},
	}
}
