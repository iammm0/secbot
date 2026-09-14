import { Controller, Get, Query } from '@nestjs/common';
import { CommandsService } from './commands.service';

@Controller('api/commands')
export class CommandsController {
  constructor(private readonly commands: CommandsService) {}

  @Get()
  list(@Query('client') client?: string) {
    return this.commands.list(client);
  }
}
