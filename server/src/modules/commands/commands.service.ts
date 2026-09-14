import { Injectable } from '@nestjs/common';
import { COMMAND_CATALOG, HELP_TOOLS_TEXT } from './commands.catalog';

@Injectable()
export class CommandsService {
  list(client?: string) {
    const filter = (client ?? '').trim().toLowerCase();
    const commands = filter
      ? COMMAND_CATALOG.filter((item) => item.clients.includes(filter as 'tui' | 'web' | 'desktop'))
      : COMMAND_CATALOG;
    return {
      commands,
      help_tools_text: HELP_TOOLS_TEXT,
    };
  }
}
