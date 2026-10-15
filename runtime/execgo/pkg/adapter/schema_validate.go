package adapter

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

// ValidateActionRequest checks action.input against the machine-readable schema exposed by ToolManifest.
//
// The validator intentionally supports the JSON Schema subset used by this package's tool manifest. It is
// stdlib-only and is not meant to be a general-purpose JSON Schema implementation.
func (k *AdapterKernel) ValidateActionRequest(req AgentActionRequest) error {
	rawKind := strings.TrimSpace(req.Action.Kind)
	kind, err := NormalizeActionKind(rawKind)
	if err != nil {
		return err
	}
	schema, ok := k.inputSchemaForKind(kind)
	if !ok {
		return fmt.Errorf("invalid adapter action: no input schema registered for %q", kind)
	}
	rawInput := req.Action.Input
	if strings.HasPrefix(kind, "os.") {
		normalized, err := normalizeOSInput(rawInput, rawKind)
		if err != nil {
			return err
		}
		rawInput = normalized
	}
	var input any = map[string]any{}
	if len(rawInput) > 0 {
		if err := json.Unmarshal(rawInput, &input); err != nil {
			return fmt.Errorf("invalid adapter action: input must be valid JSON: %w", err)
		}
	}
	if err := validateAgainstSchema(input, schema, "action.input"); err != nil {
		return fmt.Errorf("invalid adapter action: %w", err)
	}
	return nil
}

func (k *AdapterKernel) inputSchemaForKind(kind string) (map[string]any, bool) {
	manifest := k.ToolManifest()
	for _, tool := range manifest.Tools {
		if tool.ActionKind == kind {
			return tool.InputSchema, true
		}
	}
	return nil, false
}

func validateAgainstSchema(value any, schema map[string]any, path string) error {
	if len(schema) == 0 {
		return nil
	}
	if err := validateType(value, schema, path); err != nil {
		return err
	}
	if err := validateEnum(value, schema, path); err != nil {
		return err
	}
	if err := validateNumberBounds(value, schema, path); err != nil {
		return err
	}
	if err := validateRequired(value, schema, path); err != nil {
		return err
	}
	if err := validateProperties(value, schema, path); err != nil {
		return err
	}
	if err := validateItems(value, schema, path); err != nil {
		return err
	}
	if err := validateAllOf(value, schema, path); err != nil {
		return err
	}
	if err := validateOneOf(value, schema, path); err != nil {
		return err
	}
	if err := validateConditional(value, schema, path); err != nil {
		return err
	}
	return nil
}

func validateType(value any, schema map[string]any, path string) error {
	want, ok := schema["type"].(string)
	if !ok || want == "" {
		return nil
	}
	if want == "integer" {
		if _, ok := integerValue(value); ok {
			return nil
		}
		return fmt.Errorf("%s must be integer", path)
	}
	if jsonType(value) != want {
		return fmt.Errorf("%s must be %s", path, want)
	}
	return nil
}

func validateEnum(value any, schema map[string]any, path string) error {
	values, ok := schema["enum"]
	if !ok {
		return nil
	}
	allowed, ok := values.([]string)
	if !ok {
		return nil
	}
	s, ok := value.(string)
	if !ok {
		return fmt.Errorf("%s must be one of: %s", path, strings.Join(allowed, ", "))
	}
	for _, item := range allowed {
		if s == item {
			return nil
		}
	}
	return fmt.Errorf("%s must be one of: %s", path, strings.Join(allowed, ", "))
}

func validateNumberBounds(value any, schema map[string]any, path string) error {
	v, ok := numberValue(value)
	if !ok {
		return nil
	}
	if min, ok := numberValue(schema["minimum"]); ok && v < min {
		return fmt.Errorf("%s must be >= %s", path, formatNumber(min))
	}
	if max, ok := numberValue(schema["maximum"]); ok && v > max {
		return fmt.Errorf("%s must be <= %s", path, formatNumber(max))
	}
	return nil
}

func validateRequired(value any, schema map[string]any, path string) error {
	required, ok := schema["required"].([]string)
	if !ok || len(required) == 0 {
		return nil
	}
	obj, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	for _, key := range required {
		if _, ok := obj[key]; !ok {
			return fmt.Errorf("%s.%s is required", path, key)
		}
	}
	return nil
}

func validateProperties(value any, schema map[string]any, path string) error {
	obj, ok := value.(map[string]any)
	if !ok {
		return nil
	}
	props, ok := schema["properties"].(map[string]any)
	if !ok {
		props = nil
	}
	for key, item := range obj {
		propSchemaAny, known := props[key]
		if !known {
			if allowsAdditionalProperties(schema) {
				continue
			}
			return fmt.Errorf("%s.%s is not allowed", path, key)
		}
		propSchema, ok := propSchemaAny.(map[string]any)
		if !ok {
			continue
		}
		if err := validateAgainstSchema(item, propSchema, path+"."+key); err != nil {
			return err
		}
	}
	return nil
}

func validateItems(value any, schema map[string]any, path string) error {
	items, ok := schema["items"].(map[string]any)
	if !ok {
		return nil
	}
	arr, ok := value.([]any)
	if !ok {
		return nil
	}
	for i, item := range arr {
		if err := validateAgainstSchema(item, items, fmt.Sprintf("%s[%d]", path, i)); err != nil {
			return err
		}
	}
	return nil
}

func validateAllOf(value any, schema map[string]any, path string) error {
	schemas, ok := schema["allOf"].([]any)
	if !ok {
		return nil
	}
	for _, item := range schemas {
		sub, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if err := validateAgainstSchema(value, sub, path); err != nil {
			return err
		}
	}
	return nil
}

func validateOneOf(value any, schema map[string]any, path string) error {
	schemas, ok := schema["oneOf"].([]any)
	if !ok || len(schemas) == 0 {
		return nil
	}
	matches := 0
	var firstErr error
	var lastErr error
	for _, item := range schemas {
		sub, ok := item.(map[string]any)
		if !ok {
			continue
		}
		if err := validateAgainstSchema(value, sub, path); err != nil {
			if firstErr == nil {
				firstErr = err
			}
			lastErr = err
			continue
		}
		matches++
	}
	switch matches {
	case 1:
		return nil
	case 0:
		if firstErr != nil {
			return firstErr
		}
		_ = lastErr
		return fmt.Errorf("%s must match exactly one schema option", path)
	default:
		return fmt.Errorf("%s must match exactly one schema option, matched %d", path, matches)
	}
}

func validateConditional(value any, schema map[string]any, path string) error {
	ifSchema, ok := schema["if"].(map[string]any)
	if !ok {
		return nil
	}
	if err := validateAgainstSchema(value, ifSchema, path); err != nil {
		return nil
	}
	thenSchema, ok := schema["then"].(map[string]any)
	if !ok {
		return nil
	}
	return validateAgainstSchema(value, thenSchema, path)
}

func allowsAdditionalProperties(schema map[string]any) bool {
	v, ok := schema["additionalProperties"]
	if !ok {
		return true
	}
	b, ok := v.(bool)
	return ok && b
}

func jsonType(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case map[string]any:
		return "object"
	case []any:
		return "array"
	case string:
		return "string"
	case bool:
		return "boolean"
	case float64, float32, int, int64, int32, uint, uint64, uint32, json.Number:
		return "number"
	default:
		return "unknown"
	}
}

func integerValue(value any) (int64, bool) {
	switch v := value.(type) {
	case int:
		return int64(v), true
	case int64:
		return v, true
	case int32:
		return int64(v), true
	case uint:
		if uint64(v) > math.MaxInt64 {
			return 0, false
		}
		return int64(v), true
	case uint64:
		if v > math.MaxInt64 {
			return 0, false
		}
		return int64(v), true
	case uint32:
		return int64(v), true
	case float64:
		if math.Trunc(v) == v {
			return int64(v), true
		}
	case json.Number:
		i, err := v.Int64()
		return i, err == nil
	}
	return 0, false
}

func numberValue(value any) (float64, bool) {
	switch v := value.(type) {
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case int32:
		return float64(v), true
	case uint:
		return float64(v), true
	case uint64:
		return float64(v), true
	case uint32:
		return float64(v), true
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case json.Number:
		f, err := v.Float64()
		return f, err == nil
	default:
		return 0, false
	}
}

func formatNumber(v float64) string {
	if math.Trunc(v) == v {
		return fmt.Sprintf("%.0f", v)
	}
	return fmt.Sprintf("%g", v)
}
