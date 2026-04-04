import { Injectable } from '@nestjs/common';
import {
  AgentInfoDto,
  AgentListResponseDto,
  ClearMemoryRequestDto,
  ClearMemoryResponseDto,
} from './dto/agents.dto';
import { HackbotAgent } from './core/hackbot-agent';
import { SuperHackbotAgent } from './core/superhackbot-agent';
import { SecurityReActAgent } from './core/security-react-agent';

@Injectable()
export class AgentsService {
  private readonly agentsMap: Record<string, SecurityReActAgent>;

  constructor() {
    this.agentsMap = {
      hackbot: new HackbotAgent([]),
      superhackbot: new SuperHackbotAgent([]),
    };
  }

  private readonly agentDescriptions: Record<string, [string, string]> = {
    hackbot: ['Hackbot', '自动模式（ReAct，基础扫描，全自动）'],
    superhackbot: ['SuperHackbot', '专家模式（ReAct，全工具，敏感操作需确认）'],
  };

  listAgents(): AgentListResponseDto {
    const agents: AgentInfoDto[] = Object.entries(this.agentDescriptions).map(
      ([type, [name, description]]) => ({ type, name, description }),
    );
    return { agents };
  }

  clearMemory(body: ClearMemoryRequestDto): ClearMemoryResponseDto {
    if (body.agent) {
      const agent = this.agentsMap[body.agent];
      if (!agent) {
        return {
          success: false,
          message: `未知的智能体类型 '${body.agent}'，可选: ${Object.keys(this.agentsMap).join(', ')}`,
        };
      }
      agent.clearMemory();
      return { success: true, message: `已清空智能体 '${body.agent}' 的记忆` };
    }
    for (const agent of Object.values(this.agentsMap)) {
      agent.clearMemory();
    }
    return { success: true, message: '已清空所有智能体的记忆' };
  }

  getAgent(agentType: string): SecurityReActAgent | undefined {
    return this.agentsMap[agentType];
  }
}
