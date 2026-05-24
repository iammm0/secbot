import { Module } from '@nestjs/common';
import { ToolsController } from './tools.controller';
import { ToolsService } from './tools.service';
import { VulnDbModule } from '../vuln-db/vuln-db.module';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [VulnDbModule, SkillsModule],
  controllers: [ToolsController],
  providers: [ToolsService],
  exports: [ToolsService],
})
export class ToolsModule {}
