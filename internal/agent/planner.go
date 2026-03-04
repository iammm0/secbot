package agent

import (
	"context"
	"fmt"
	"strings"

	"secbot/internal/memory"
	"secbot/internal/patterns"
	"secbot/pkg/event"
	"secbot/pkg/logger"

	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/tools"
)

// PlannerAgent 负责将复杂任务分解为步骤计划并执行
type PlannerAgent struct {
	BaseAgent
	llm   llms.Model
	tools []tools.Tool
	bus   *event.Bus
}

func NewPlannerAgent(llm llms.Model, toolList []tools.Tool, mem *memory.Manager, bus *event.Bus) *PlannerAgent {
	return &PlannerAgent{
		BaseAgent: BaseAgent{
			AgentName: "planner",
			Memory:    mem,
		},
		llm:   llm,
		tools: toolList,
		bus:   bus,
	}
}

func (p *PlannerAgent) Process(ctx context.Context, input string) (string, error) {
	logger.Infof("[PlannerAgent] 规划任务: %s", truncateStr(input, 100))

	p.bus.EmitSimple(event.PlanCreated, "message", "正在制定执行计划...")

	planner := patterns.NewPlanner(p.llm, p.tools, 8)
	result, err := planner.PlanAndExecute(ctx, input)
	if err != nil {
		return "", fmt.Errorf("任务规划执行失败: %w", err)
	}

	var sb strings.Builder
	sb.WriteString("## 执行计划\n\n")
	for i, step := range result.Plan.Steps {
		sb.WriteString(fmt.Sprintf("%d. %s", i+1, step.Description))
		if step.Tool != "" {
			sb.WriteString(fmt.Sprintf(" [工具: %s]", step.Tool))
		}
		sb.WriteString("\n")
	}

	sb.WriteString("\n## 执行结果\n\n")
	for _, sr := range result.StepResults {
		if sr.Success {
			sb.WriteString(fmt.Sprintf("✓ %s: %s\n\n", sr.StepID, truncateStr(sr.Output, 500)))
		} else {
			sb.WriteString(fmt.Sprintf("✗ %s: 失败 - %s\n\n", sr.StepID, sr.Error))
		}
	}

	output := sb.String()
	p.Memory.AddAssistantMessage(output)
	p.bus.EmitSimple(event.AgentResponse, "message", "计划执行完成")

	return output, nil
}
