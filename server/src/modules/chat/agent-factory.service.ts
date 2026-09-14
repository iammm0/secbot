import { Injectable } from '@nestjs/common';
import { ToolsService } from '../tools/tools.service';
import { QAAgent } from '../agents/core/qa-agent';
import { PlannerAgent } from '../agents/core/planner-agent';
import { SummaryAgent } from '../agents/core/summary-agent';
import { IntentRouter } from '../agents/core/intent-router';
import { ExploreAgent } from '../agents/core/explore-agent';
import { HackbotAgent } from '../agents/core/hackbot-agent';
import { SuperHackbotAgent } from '../agents/core/superhackbot-agent';
import { SecurityReActAgent } from '../agents/core/security-react-agent';
import type { ContextUsagePart } from './context-usage';
import { usagePart } from './context-usage';
import { approxTokens } from './model-context-window';

@Injectable()
export class AgentFactoryService {
  constructor(private readonly toolsService: ToolsService) {}

  createQAAgent(): QAAgent {
    return new QAAgent();
  }

  createPlannerAgent(): PlannerAgent {
    return new PlannerAgent();
  }

  createSummaryAgent(): SummaryAgent {
    return new SummaryAgent();
  }

  createIntentRouter(): IntentRouter {
    return new IntentRouter();
  }

  getToolCatalogCompact(): string {
    return this.toolsService.describeCatalogCompact();
  }

  getDefinitionUsageParts(): ContextUsagePart[] {
    let tools = 0;
    let skills = 0;
    let mcp = 0;
    for (const category of this.toolsService.listCatalogEntries()) {
      const text = category.tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n');
      const tokens = text ? approxTokens(text) : 0;
      if (category.id === 'skills') skills += tokens;
      else if (category.id === 'mcp') mcp += tokens;
      else tools += tokens;
    }
    return [usagePart('tools', tools), usagePart('skills', skills), usagePart('mcp', mcp)].filter(
      (part): part is ContextUsagePart => part != null,
    );
  }

  createExploreAgent(): ExploreAgent {
    return new ExploreAgent(
      this.toolsService.getBasicTools(),
      this.toolsService.getBrowserSessionTool(),
    );
  }

  createHackbot(): HackbotAgent {
    return new HackbotAgent(this.toolsService.getBasicTools());
  }

  createSuperhackbot(): SuperHackbotAgent {
    return new SuperHackbotAgent(this.toolsService.getAllTools());
  }

  createAgentByType(type: string): SecurityReActAgent {
    return type === 'superhackbot' ? this.createSuperhackbot() : this.createHackbot();
  }
}
