import { BaseTool, ToolResult } from '../core/base-tool';
import { SkillsService } from '../../skills/skills.service';

export class ListSkillsTool extends BaseTool {
  constructor(private readonly skillsService: SkillsService) {
    super('list_skills', 'List available Secbot skills.');
  }

  async run(): Promise<ToolResult> {
    try {
      const skills = await this.skillsService.listSkills();
      return {
        success: true,
        result: {
          total: skills.length,
          skills,
        },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: (error as Error).message,
      };
    }
  }
}
