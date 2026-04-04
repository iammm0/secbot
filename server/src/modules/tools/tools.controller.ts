import { Body, Controller, Get, Post } from '@nestjs/common';
import { ToolsService } from './tools.service';
import { ExecuteToolRequestDto } from './dto/tools.dto';

@Controller('api/tools')
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  @Get()
  listTools() {
    return this.toolsService.listTools();
  }

  @Post('execute')
  async executeTool(@Body() body: ExecuteToolRequestDto) {
    return await this.toolsService.executeTool(body.tool, body.params ?? {});
  }
}

