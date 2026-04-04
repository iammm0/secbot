import { Injectable } from '@nestjs/common';
import { ALL_SECURITY_TOOLS } from './security';
import { DEFENSE_TOOLS } from './defense';
import { UTILITY_TOOLS } from './utility';
import { PROTOCOL_TOOLS } from './protocol';
import { OSINT_TOOLS } from './osint';
import { CLOUD_TOOLS } from './cloud';
import { REPORTING_TOOLS } from './reporting';
import { CONTROL_TOOLS } from './control';
import { WEB_RESEARCH_TOOLS } from './web-research';
import { CRAWLER_TOOLS } from './crawler';
import { BaseTool, ToolResult } from './core/base-tool';
import { ListToolsResponseDto } from './dto/tools.dto';

@Injectable()
export class ToolsService {
  private readonly categories: Array<{ id: string; name: string; tools: BaseTool[] }> = [
    { id: 'security', name: 'Core Security', tools: ALL_SECURITY_TOOLS },
    { id: 'defense', name: 'Defense', tools: DEFENSE_TOOLS },
    { id: 'utility', name: 'Utility', tools: UTILITY_TOOLS },
    { id: 'protocol', name: 'Protocol Probes', tools: PROTOCOL_TOOLS },
    { id: 'osint', name: 'OSINT', tools: OSINT_TOOLS },
    { id: 'cloud', name: 'Cloud', tools: CLOUD_TOOLS },
    { id: 'reporting', name: 'Reporting', tools: REPORTING_TOOLS },
    { id: 'control', name: 'Control', tools: CONTROL_TOOLS },
    { id: 'crawler', name: 'Crawler', tools: CRAWLER_TOOLS },
    { id: 'web_research', name: 'Web Research', tools: WEB_RESEARCH_TOOLS },
  ];

  private readonly allTools: BaseTool[] = this.uniqueTools(
    this.categories.flatMap((c) => c.tools),
  );

  private readonly toolsMap = new Map(this.allTools.map((t) => [t.name, t]));

  listTools(): ListToolsResponseDto {
    const categories = this.categories.map((category) => ({
      id: category.id,
      name: category.name,
      count: category.tools.length,
      tools: category.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        category: category.id,
      })),
    }));

    return {
      total: this.allTools.length,
      basic_count: this.allTools.length,
      advanced_count: 0,
      categories,
      tools: categories.flatMap((c) => c.tools),
    };
  }

  getBasicTools(): BaseTool[] {
    return this.allTools;
  }

  getAdvancedTools(): BaseTool[] {
    return [];
  }

  getAllTools(): BaseTool[] {
    return this.allTools;
  }

  async executeTool(name: string, params: Record<string, unknown> = {}): Promise<ToolResult> {
    const tool = this.toolsMap.get(name);
    if (!tool) {
      return {
        success: false,
        result: null,
        error: `Tool not found: ${name}`,
      };
    }
    return await tool.run(params);
  }

  private uniqueTools(tools: BaseTool[]): BaseTool[] {
    const map = new Map<string, BaseTool>();
    for (const tool of tools) {
      if (!map.has(tool.name)) {
        map.set(tool.name, tool);
      }
    }
    return [...map.values()];
  }
}
