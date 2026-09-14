import { Injectable } from '@nestjs/common';
import { ALL_SECURITY_TOOLS, VulnScannerTool } from './security';
import { DEFENSE_TOOLS } from './defense';
import { UTILITY_TOOLS } from './utility';
import { PROTOCOL_TOOLS } from './protocol';
import { OSINT_TOOLS } from './osint';
import { CLOUD_TOOLS } from './cloud';
import { REPORTING_TOOLS } from './reporting';
import { CONTROL_TOOLS } from './control';
import { BROWSER_SESSION_TOOL, BrowserSessionTool, WEB_RESEARCH_TOOLS } from './web-research';
import { CRAWLER_TOOLS } from './crawler';
import { VulnDbQueryTool } from './vuln-db';
import { VulnDbService } from '../vuln-db/vuln-db.service';
import { BaseTool, ToolResult } from './core/base-tool';
import { ListToolsResponseDto } from './dto/tools.dto';
import { SkillsService } from '../skills/skills.service';
import { createSkillsTools } from './skills';
import { createMcpTools } from './mcp';
import { PreferencesService } from '../preferences/preferences.service';

@Injectable()
export class ToolsService {
  private readonly browserSessionTool: BrowserSessionTool = BROWSER_SESSION_TOOL;
  private readonly vulnDbQueryTool: VulnDbQueryTool;
  private readonly categories: Array<{ id: string; name: string; tools: BaseTool[] }>;
  private readonly allTools: BaseTool[];
  private readonly toolsMap: Map<string, BaseTool>;

  constructor(
    private readonly vulnDbService: VulnDbService,
    private readonly skillsService: SkillsService,
    private readonly preferences: PreferencesService,
  ) {
    this.vulnDbQueryTool = new VulnDbQueryTool(this.vulnDbService);

    const securityTools = ALL_SECURITY_TOOLS.map((t) =>
      t.name === 'vuln_scan' ? new VulnScannerTool(this.vulnDbService) : t,
    );
    const skillsTools = createSkillsTools(this.skillsService);
    const mcpTools = createMcpTools(this.preferences);

    this.categories = [
      { id: 'security', name: 'Core Security', tools: securityTools },
      { id: 'defense', name: 'Defense', tools: DEFENSE_TOOLS },
      { id: 'utility', name: 'Utility', tools: UTILITY_TOOLS },
      { id: 'protocol', name: 'Protocol Probes', tools: PROTOCOL_TOOLS },
      { id: 'osint', name: 'OSINT', tools: OSINT_TOOLS },
      { id: 'cloud', name: 'Cloud', tools: CLOUD_TOOLS },
      { id: 'reporting', name: 'Reporting', tools: REPORTING_TOOLS },
      { id: 'control', name: 'Control', tools: CONTROL_TOOLS },
      { id: 'crawler', name: 'Crawler', tools: CRAWLER_TOOLS },
      { id: 'web_research', name: 'Web Research', tools: WEB_RESEARCH_TOOLS },
      { id: 'skills', name: 'Skills', tools: skillsTools },
      { id: 'mcp', name: 'MCP', tools: mcpTools },
      { id: 'vuln_db', name: 'Vulnerability DB', tools: [this.vulnDbQueryTool] },
    ];
    this.allTools = this.uniqueTools(this.categories.flatMap((c) => c.tools));
    this.toolsMap = new Map(this.allTools.map((t) => [t.name, t]));
  }

  getBrowserSessionTool(): BrowserSessionTool {
    return this.browserSessionTool;
  }

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

  /** 给 IntentRouter 用的短目录：类别 + 工具名，避免把描述全文塞进分类 prompt */
  describeCatalogCompact(maxChars = 1800): string {
    const lines = this.categories.map(
      (category) =>
        `${category.name}(${category.tools.length}): ${category.tools.map((tool) => tool.name).join(', ')}`,
    );
    const text = `共 ${this.allTools.length} 个工具\n${lines.join('\n')}`;
    if (text.length <= maxChars) return text;
    return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
  }

  listCatalogEntries(): Array<{ id: string; tools: Array<{ name: string; description: string }> }> {
    return this.categories.map((category) => ({
      id: category.id,
      tools: category.tools.map((tool) => ({ name: tool.name, description: tool.description })),
    }));
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
