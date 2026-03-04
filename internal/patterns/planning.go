package patterns

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

type PlanStep struct {
	ID          string   `json:"id"`
	Description string   `json:"description"`
	Tool        string   `json:"tool,omitempty"`
	ToolInput   string   `json:"tool_input,omitempty"`
	DependsOn   []string `json:"depends_on,omitempty"`
}

type Plan struct {
	Goal  string     `json:"goal"`
	Steps []PlanStep `json:"steps"`
}

type StepResult struct {
	StepID  string `json:"step_id"`
	Output  string `json:"output"`
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

type PlanResult struct {
	Plan         *Plan        `json:"plan"`
	StepResults  []StepResult `json:"step_results"`
	FinalOutput  string       `json:"final_output"`
	AllSucceeded bool         `json:"all_succeeded"`
}

type Planner struct {
	LLM      llms.Model
	Tools    []tools.Tool
	MaxSteps int
}

func NewPlanner(llm llms.Model, toolList []tools.Tool, maxSteps int) *Planner {
	if maxSteps <= 0 {
		maxSteps = 10
	}
	return &Planner{LLM: llm, Tools: toolList, MaxSteps: maxSteps}
}

func (p *Planner) CreatePlan(ctx context.Context, goal string) (*Plan, error) {
	toolDescs := p.toolDescriptions()

	prompt := fmt.Sprintf(`你是一个任务规划器。将以下目标分解为可执行的步骤计划。

目标: %s

可用工具:
%s

以 JSON 格式回复:
{
  "goal": "原始目标",
  "steps": [
    {
      "id": "step_1",
      "description": "此步骤做什么",
      "tool": "工具名称（如果不需要工具则为空）",
      "tool_input": "工具输入参数",
      "depends_on": ["此步骤依赖的前置步骤ID"]
    }
  ]
}

规则:
- 最多 %d 步
- 每步应具体且可执行
- 合理使用工具
- 最后一步应总结/呈现结果
- 仅回复 JSON`, goal, toolDescs, p.MaxSteps)

	resp, err := llms.GenerateFromSinglePrompt(ctx, p.LLM, prompt,
		llms.WithTemperature(0.1),
	)
	if err != nil {
		return nil, fmt.Errorf("生成计划失败: %w", err)
	}

	resp = extractJSON(resp)
	var plan Plan
	if err := json.Unmarshal([]byte(resp), &plan); err != nil {
		return nil, fmt.Errorf("解析计划 JSON 失败: %w (response: %s)", err, resp)
	}
	if plan.Goal == "" {
		plan.Goal = goal
	}
	return &plan, nil
}

func (p *Planner) PlanAndExecute(ctx context.Context, goal string) (*PlanResult, error) {
	plan, err := p.CreatePlan(ctx, goal)
	if err != nil {
		return nil, err
	}
	return p.ExecutePlan(ctx, plan)
}

func (p *Planner) ExecutePlan(ctx context.Context, plan *Plan) (*PlanResult, error) {
	result := &PlanResult{
		Plan:         plan,
		StepResults:  make([]StepResult, 0, len(plan.Steps)),
		AllSucceeded: true,
	}

	completed := &sync.Map{}

	for _, step := range plan.Steps {
		// 检查依赖
		for _, dep := range step.DependsOn {
			if _, ok := completed.Load(dep); !ok {
				result.AllSucceeded = false
			}
		}

		sr := p.executeStep(ctx, step, completed)
		result.StepResults = append(result.StepResults, sr)
		if !sr.Success {
			result.AllSucceeded = false
		}
		completed.Store(step.ID, sr.Output)
	}

	// 综合所有结果
	var sb strings.Builder
	for _, sr := range result.StepResults {
		if sr.Success {
			sb.WriteString(fmt.Sprintf("[%s] %s\n", sr.StepID, sr.Output))
		}
	}
	result.FinalOutput = sb.String()

	return result, nil
}

func (p *Planner) executeStep(ctx context.Context, step PlanStep, _ *sync.Map) StepResult {
	if step.Tool == "" {
		output, err := llms.GenerateFromSinglePrompt(ctx, p.LLM, step.Description)
		if err != nil {
			return StepResult{StepID: step.ID, Success: false, Error: err.Error()}
		}
		return StepResult{StepID: step.ID, Output: output, Success: true}
	}

	for _, t := range p.Tools {
		if strings.EqualFold(t.Name(), step.Tool) {
			output, err := t.Call(ctx, step.ToolInput)
			if err != nil {
				return StepResult{StepID: step.ID, Success: false, Error: err.Error()}
			}
			return StepResult{StepID: step.ID, Output: output, Success: true}
		}
	}

	return StepResult{
		StepID:  step.ID,
		Success: false,
		Error:   fmt.Sprintf("工具 %q 未找到", step.Tool),
	}
}

func (p *Planner) toolDescriptions() string {
	var sb strings.Builder
	for _, t := range p.Tools {
		fmt.Fprintf(&sb, "- %s: %s\n", t.Name(), t.Description())
	}
	return sb.String()
}

func extractJSON(s string) string {
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return s
}
