import { BaseTool, ToolResult } from '../core/base-tool';
import { SkillsService } from '../../skills/skills.service';

export class GetSkillTool extends BaseTool {
  constructor(private readonly skillsService: SkillsService) {
    super('get_skill', 'Read metadata and body for a Secbot skill.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const name = String(params.name ?? params.slug ?? '').trim();
    if (!name) {
      return { success: false, result: null, error: 'Missing parameter: name' };
    }

    try {
      const skill = await this.skillsService.getSkill(name);
      return { success: true, result: skill };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: (error as Error).message,
      };
    }
  }
}
