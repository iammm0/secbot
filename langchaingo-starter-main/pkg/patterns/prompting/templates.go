package prompting

import (
	"fmt"
	"strings"
)

// Example represents a few-shot example with input and output.
type Example struct {
	Input  string
	Output string
}

// ZeroShot generates a zero-shot prompt (direct instruction, no examples).
func ZeroShot(task string) string {
	return fmt.Sprintf("Complete the following task:\n\n%s", task)
}

// ZeroShotWithRole generates a zero-shot prompt with a role assignment.
func ZeroShotWithRole(role, task string) string {
	return fmt.Sprintf("You are %s.\n\n%s", role, task)
}

// OneShotPrompt generates a one-shot prompt with a single example.
func OneShotPrompt(task string, example Example) string {
	return fmt.Sprintf(`Complete the following task. Here is an example:

Input: %s
Output: %s

Now complete this:
Input: %s
Output:`, example.Input, example.Output, task)
}

// FewShot generates a few-shot prompt with multiple examples.
func FewShot(task string, examples []Example) string {
	var sb strings.Builder
	sb.WriteString("Complete the following task based on these examples:\n\n")
	for i, ex := range examples {
		fmt.Fprintf(&sb, "Example %d:\nInput: %s\nOutput: %s\n\n", i+1, ex.Input, ex.Output)
	}
	fmt.Fprintf(&sb, "Now complete this:\nInput: %s\nOutput:", task)
	return sb.String()
}

// ChainOfThought generates a Chain-of-Thought (CoT) prompt.
func ChainOfThought(task string) string {
	return fmt.Sprintf(`%s

Let's think step by step:`, task)
}

// ChainOfThoughtWithExamples generates a CoT prompt with reasoning examples.
func ChainOfThoughtWithExamples(task string, examples []CoTExample) string {
	var sb strings.Builder
	sb.WriteString("Solve the following problem step by step.\n\n")
	for i, ex := range examples {
		fmt.Fprintf(&sb, "Example %d:\nQuestion: %s\nReasoning: %s\nAnswer: %s\n\n", i+1, ex.Question, ex.Reasoning, ex.Answer)
	}
	fmt.Fprintf(&sb, "Now solve this:\nQuestion: %s\nReasoning:", task)
	return sb.String()
}

// CoTExample is a chain-of-thought example with reasoning steps.
type CoTExample struct {
	Question  string
	Reasoning string
	Answer    string
}

// ReActFormat generates a ReAct-style prompt with tool descriptions.
func ReActFormat(task string, toolDescriptions []ToolDescription) string {
	var sb strings.Builder
	sb.WriteString("Answer the following question using the available tools.\n\n")
	sb.WriteString("Available tools:\n")
	for _, t := range toolDescriptions {
		fmt.Fprintf(&sb, "- %s: %s\n", t.Name, t.Description)
	}
	sb.WriteString(fmt.Sprintf(`
Use the following format:

Question: the input question
Thought: think about what to do
Action: the action to take (one of: %s)
Action Input: the input for the action
Observation: the result of the action
... (repeat Thought/Action/Action Input/Observation as needed)
Thought: I now know the final answer
Final Answer: the final answer

Question: %s
Thought:`, toolNames(toolDescriptions), task))
	return sb.String()
}

// ToolDescription describes a tool for prompt generation.
type ToolDescription struct {
	Name        string
	Description string
}

func toolNames(tools []ToolDescription) string {
	names := make([]string, len(tools))
	for i, t := range tools {
		names[i] = t.Name
	}
	return strings.Join(names, ", ")
}

// SelfConsistency generates a prompt that asks for multiple reasoning paths.
func SelfConsistency(task string, numPaths int) string {
	return fmt.Sprintf(`%s

Please provide %d different approaches to solve this problem, then determine the most consistent answer.

Approach 1:`, task, numPaths)
}

// StepBack generates a step-back prompting format.
func StepBack(task string) string {
	return fmt.Sprintf(`Before answering the specific question, first consider the broader principles and concepts involved.

Question: %s

Step 1 - What are the general principles or concepts relevant to this question?
Step 2 - Now, apply these principles to answer the specific question.

General Principles:`, task)
}

// StructuredOutput generates a prompt requesting structured JSON output.
func StructuredOutput(task string, schema string) string {
	return fmt.Sprintf(`%s

You must respond in the following JSON format:
%s

Respond with valid JSON only, no additional text.`, task, schema)
}
