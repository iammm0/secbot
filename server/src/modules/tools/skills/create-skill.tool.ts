import { BaseTool, ToolResult } from '../core/base-tool';
import { SkillsService } from '../../skills/skills.service';

export class CreateSkillTool extends BaseTool {
  constructor(private readonly skillsService: SkillsService) {
    super('create_skill', 'Create a new Secbot skill in the local workspace.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const name = String(params.name ?? '').trim();
    if (!name) {
      return { success: false, result: null, error: 'Missing parameter: name' };
    }

    try {
      const skill = await this.skillsService.createSkill({
        name,
        description: typeof params.description === 'string' ? params.description : undefined,
        version: typeof params.version === 'string' ? params.version : undefined,
        author: typeof params.author === 'string' ? params.author : undefined,
        tags: Array.isArray(params.tags) ? params.tags.map(String) : undefined,
        triggers: Array.isArray(params.triggers) ? params.triggers.map(String) : undefined,
        prerequisites: Array.isArray(params.prerequisites)
          ? params.prerequisites.map(String)
          : undefined,
        body: typeof params.body === 'string' ? params.body : undefined,
      });
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
