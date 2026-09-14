import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { AddMcpServerDto, SetInstructionsDto } from './dto/preferences.dto';
import { PreferencesService } from './preferences.service';

@Controller('api/settings')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  getAll() {
    return {
      custom_instructions: this.preferences.getCustomInstructions(),
      mcp_servers: this.preferences.listMcpServers(),
    };
  }

  @Put('instructions')
  setInstructions(@Body() body: SetInstructionsDto) {
    return { custom_instructions: this.preferences.setCustomInstructions(body.instructions ?? '') };
  }

  @Get('mcp')
  listMcp() {
    return { servers: this.preferences.listMcpServers() };
  }

  @Post('mcp')
  addMcp(@Body() body: AddMcpServerDto) {
    return { server: this.preferences.addMcpServer(body) };
  }

  @Delete('mcp/:id')
  removeMcp(@Param('id') id: string) {
    return { server: this.preferences.removeMcpServer(id) };
  }
}
