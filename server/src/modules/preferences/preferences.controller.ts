import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import {
  AddMcpServerDto,
  SetExecGoConfigDto,
  SetInstructionsDto,
  SetJevConfigDto,
} from './dto/preferences.dto';
import { PreferencesService } from './preferences.service';

@Controller('api/settings')
export class PreferencesController {
  constructor(private readonly preferences: PreferencesService) {}

  @Get()
  getAll() {
    return {
      custom_instructions: this.preferences.getCustomInstructions(),
      mcp_servers: this.preferences.listMcpServers(),
      execgo: this.preferences.getExecGoConfig(),
      jev: this.preferences.getJevPublicConfig(),
    };
  }

  @Put('instructions')
  setInstructions(@Body() body: SetInstructionsDto) {
    return { custom_instructions: this.preferences.setCustomInstructions(body.instructions ?? '') };
  }

  @Get('execgo')
  getExecGo() {
    return this.preferences.probeExecGo();
  }

  @Put('execgo')
  async setExecGo(@Body() body: SetExecGoConfigDto) {
    return this.preferences.setExecGoConfig({
      enabled: body.enabled,
      auditActions: body.auditActions,
      fallbackLocal: body.fallbackLocal,
      url: body.url,
      runtimeUrl: body.runtimeUrl,
      cliPath: body.cliPath,
    });
  }

  @Post('execgo/probe')
  probeExecGo() {
    return this.preferences.probeExecGo();
  }

  @Post('execgo/start')
  async startExecGo() {
    return this.preferences.setExecGoConfig({ enabled: true });
  }

  @Post('execgo/stop')
  async stopExecGo() {
    return this.preferences.setExecGoConfig({ enabled: false });
  }

  @Get('jev')
  getJev() {
    return this.preferences.getJevSettings();
  }

  @Put('jev')
  setJev(@Body() body: SetJevConfigDto) {
    return this.preferences.setJevConfig(body);
  }

  @Post('jev/probe')
  probeJev() {
    return this.preferences.probeJev();
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
