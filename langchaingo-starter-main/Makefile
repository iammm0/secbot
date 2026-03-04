.PHONY: help build test run-server tidy lint examples

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'

# ============ Build & Test ============

build: ## Build all packages
	go build ./...

tidy: ## Tidy go modules
	go mod tidy

test: ## Run all tests
	go test ./... -v

lint: ## Run go vet
	go vet ./...

# ============ Server ============

run-server: ## Start the HTTP API server (default port 8080)
	go run ./server/

# ============ Examples ============

examples: ## List all available examples
	@echo "Available examples (run with: go run ./examples/<name>/):"
	@echo ""
	@echo "  Part 1: Foundation Patterns"
	@echo "  01_simple_chain       - Simple LLM Chain"
	@echo "  02_sequential_chain   - Multi-step Sequential Pipeline"
	@echo "  03_routing            - Dynamic Routing"
	@echo "  04_parallel           - Parallel Fan-Out"
	@echo "  05_reflection         - Reflection Loop"
	@echo "  06_tool_react         - ReAct Agent"
	@echo "  07_tool_functions     - OpenAI Functions Agent"
	@echo "  08_prompting          - Advanced Prompting Techniques"
	@echo ""
	@echo "  Part 2: Complex Tasks"
	@echo "  09_planning           - Goal Decomposition & Execution"
	@echo "  10_multiagent         - Orchestrator-Worker Multi-Agent"
	@echo "  11_conversational     - Memory-Backed Conversation"
	@echo "  12_rag                - RAG Pipeline"
	@echo ""
	@echo "  Part 3: Engineering & Safety"
	@echo "  13_resilience         - Retry / Fallback / Degradation"
	@echo "  14_guardrails         - Input/Output Safety Guards"
	@echo ""
	@echo "  Part 4: Evaluation"
	@echo "  15_evaluation         - LLM-as-Judge"

run-01: ## Run Example 01: Simple Chain
	go run ./examples/01_simple_chain/

run-02: ## Run Example 02: Sequential Chain
	go run ./examples/02_sequential_chain/

run-03: ## Run Example 03: Routing
	go run ./examples/03_routing/

run-04: ## Run Example 04: Parallel
	go run ./examples/04_parallel/

run-05: ## Run Example 05: Reflection
	go run ./examples/05_reflection/

run-06: ## Run Example 06: ReAct Agent
	go run ./examples/06_tool_react/

run-07: ## Run Example 07: Functions Agent
	go run ./examples/07_tool_functions/

run-08: ## Run Example 08: Prompting
	go run ./examples/08_prompting/

run-09: ## Run Example 09: Planning
	go run ./examples/09_planning/

run-10: ## Run Example 10: Multi-Agent
	go run ./examples/10_multiagent/

run-11: ## Run Example 11: Conversational
	go run ./examples/11_conversational/

run-12: ## Run Example 12: RAG
	go run ./examples/12_rag/

run-13: ## Run Example 13: Resilience
	go run ./examples/13_resilience/

run-14: ## Run Example 14: Guardrails
	go run ./examples/14_guardrails/

run-15: ## Run Example 15: Evaluation
	go run ./examples/15_evaluation/
