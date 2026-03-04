package tools

import (
	"context"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"strconv"
	"strings"
)

// CalculatorTool evaluates simple mathematical expressions.
type CalculatorTool struct{}

var _ interface {
	Name() string
	Description() string
	Call(ctx context.Context, input string) (string, error)
} = (*CalculatorTool)(nil)

func (c *CalculatorTool) Name() string {
	return "Calculator"
}

func (c *CalculatorTool) Description() string {
	return "Evaluate a mathematical expression. Input should be a math expression like '2 + 3 * 4' or '(10 - 3) / 2'. Supports +, -, *, /."
}

func (c *CalculatorTool) Call(_ context.Context, input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("empty expression")
	}

	result, err := evalExpr(input)
	if err != nil {
		return "", fmt.Errorf("failed to evaluate '%s': %w", input, err)
	}

	// Format: remove trailing zeros for clean output
	if result == float64(int64(result)) {
		return strconv.FormatInt(int64(result), 10), nil
	}
	return strconv.FormatFloat(result, 'f', -1, 64), nil
}

// evalExpr uses Go's AST parser to safely evaluate math expressions.
func evalExpr(expr string) (float64, error) {
	node, err := parser.ParseExpr(expr)
	if err != nil {
		return 0, fmt.Errorf("parse error: %w", err)
	}
	return evalNode(node)
}

func evalNode(node ast.Expr) (float64, error) {
	switch n := node.(type) {
	case *ast.BasicLit:
		if n.Kind == token.INT || n.Kind == token.FLOAT {
			return strconv.ParseFloat(n.Value, 64)
		}
		return 0, fmt.Errorf("unsupported literal: %s", n.Value)

	case *ast.BinaryExpr:
		left, err := evalNode(n.X)
		if err != nil {
			return 0, err
		}
		right, err := evalNode(n.Y)
		if err != nil {
			return 0, err
		}
		switch n.Op {
		case token.ADD:
			return left + right, nil
		case token.SUB:
			return left - right, nil
		case token.MUL:
			return left * right, nil
		case token.QUO:
			if right == 0 {
				return 0, fmt.Errorf("division by zero")
			}
			return left / right, nil
		default:
			return 0, fmt.Errorf("unsupported operator: %s", n.Op)
		}

	case *ast.ParenExpr:
		return evalNode(n.X)

	case *ast.UnaryExpr:
		val, err := evalNode(n.X)
		if err != nil {
			return 0, err
		}
		if n.Op == token.SUB {
			return -val, nil
		}
		return val, nil

	default:
		return 0, fmt.Errorf("unsupported expression type: %T", node)
	}
}
