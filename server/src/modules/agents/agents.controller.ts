import { Body, Controller, Get, Post } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { ClearMemoryRequestDto } from './dto/agents.dto';

@Controller('api/agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get()
  listAgents() {
    return this.agentsService.listAgents();
  }

  @Post('clear')
  clearMemory(@Body() body: ClearMemoryRequestDto) {
    return this.agentsService.clearMemory(body);
  }
}
