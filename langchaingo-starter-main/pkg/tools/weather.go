package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// WeatherTool is a simulated weather lookup tool.
type WeatherTool struct{}

var _ interface {
	Name() string
	Description() string
	Call(ctx context.Context, input string) (string, error)
} = (*WeatherTool)(nil)

func (w *WeatherTool) Name() string {
	return "Weather"
}

func (w *WeatherTool) Description() string {
	return "Get the current weather for a given city. Input should be a city name like 'Beijing' or 'New York'."
}

func (w *WeatherTool) Call(_ context.Context, input string) (string, error) {
	city := strings.TrimSpace(strings.ToLower(input))

	// Simulated weather data
	weatherDB := map[string]weatherInfo{
		"beijing":       {City: "Beijing", Temp: 22, Condition: "Sunny", Humidity: 45},
		"shanghai":      {City: "Shanghai", Temp: 26, Condition: "Cloudy", Humidity: 72},
		"new york":      {City: "New York", Temp: 18, Condition: "Partly Cloudy", Humidity: 58},
		"london":        {City: "London", Temp: 14, Condition: "Rainy", Humidity: 85},
		"tokyo":         {City: "Tokyo", Temp: 20, Condition: "Clear", Humidity: 52},
		"san francisco": {City: "San Francisco", Temp: 16, Condition: "Foggy", Humidity: 78},
		"paris":         {City: "Paris", Temp: 17, Condition: "Overcast", Humidity: 65},
	}

	info, ok := weatherDB[city]
	if !ok {
		return fmt.Sprintf("Weather data not available for '%s'. Available cities: Beijing, Shanghai, New York, London, Tokyo, San Francisco, Paris.", input), nil
	}

	result, err := json.Marshal(info)
	if err != nil {
		return "", fmt.Errorf("failed to marshal weather info: %w", err)
	}
	return string(result), nil
}

type weatherInfo struct {
	City      string `json:"city"`
	Temp      int    `json:"temperature_celsius"`
	Condition string `json:"condition"`
	Humidity  int    `json:"humidity_percent"`
}
