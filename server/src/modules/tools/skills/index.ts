export { CreateSkillTool } from './create-skill.tool';
export { GetSkillTool } from './get-skill.tool';
export { ListSkillsTool } from './list-skills.tool';

import { BaseTool } from '../core/base-tool';
import { SkillsService } from '../../skills/skills.service';
import { CreateSkillTool } from './create-skill.tool';
import { GetSkillTool } from './get-skill.tool';
import { ListSkillsTool } from './list-skills.tool';

export function createSkillsTools(skillsService: SkillsService): BaseTool[] {
  return [
    new ListSkillsTool(skillsService),
    new GetSkillTool(skillsService),
    new CreateSkillTool(skillsService),
  ];
}
