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
