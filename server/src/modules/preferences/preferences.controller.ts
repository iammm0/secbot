import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import {
  AddMcpServerDto,
  SetExecGoConfigDto,
  SetInstructionsDto,
  SetJevConfigDto,
} from './dto/preferences.dto';
import { McpBroker } from '../tools/mcp/mcp-broker';
import { PreferencesService } from './preferences.service';

@Controller('api/settings')
export class PreferencesController {
  constructor(
    private readonly preferences: PreferencesService,
    private readonly mcpBroker: McpBroker,
  ) {}

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
      sandboxProfile: body.sandboxProfile,
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
  async listMcp() {
    const loaded = await this.mcpBroker.refresh();
    return {
      servers: this.preferences.listMcpServers(),
      loaded_tools: loaded.loaded_tools,
      omitted: loaded.omitted,
      errors: loaded.errors,
      connections: loaded.servers,
    };
  }

  @Post('mcp')
  async addMcp(@Body() body: AddMcpServerDto) {
    const server = this.preferences.addMcpServer(body);
    const loaded = await this.mcpBroker.refresh();
    return { server, ...loaded };
  }

  @Delete('mcp/:id')
  async removeMcp(@Param('id') id: string) {
    const server = this.preferences.removeMcpServer(id);
    const loaded = await this.mcpBroker.refresh();
    return { server, ...loaded };
  }
}
