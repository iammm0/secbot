import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateSkillRequestDto } from './dto/skills.dto';
import { SkillsService } from './skills.service';

@Controller('api/skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get()
  async listSkills() {
    const skills = await this.skillsService.listSkills();
    return { skills };
  }

  @Get(':name')
  async getSkill(@Param('name') name: string) {
    return await this.skillsService.getSkill(name);
  }

  @Post()
  async createSkill(@Body() body: CreateSkillRequestDto) {
    return await this.skillsService.createSkill(body);
  }
}
