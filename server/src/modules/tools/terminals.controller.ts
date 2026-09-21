import { Controller, Delete, Get, NotFoundException, Param } from '@nestjs/common';
import {
  closeTerminalSession,
  getTerminalSnapshot,
  listTerminalSnapshots,
} from './control/terminal-session.tool';

/** Read-only inspector for terminals Secbot itself opened via terminal_session. */
@Controller('api/terminals')
export class TerminalsController {
  @Get()
  list() {
    return { sessions: listTerminalSnapshots() };
  }

  @Get(':id')
  one(@Param('id') id: string) {
    const snapshot = getTerminalSnapshot(id);
    if (!snapshot) throw new NotFoundException('终端会话不存在');
    return snapshot;
  }

  @Delete(':id')
  async close(@Param('id') id: string) {
    const ok = await closeTerminalSession(id);
    if (!ok) throw new NotFoundException('终端会话不存在');
    return { ok: true };
  }
}
