import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import {
  AddCommandRequestDto,
  AddFileTransferRequestDto,
  CreateSessionRequestDto,
} from './dto/sessions.dto';

@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  listSessions(@Query('status') status?: string) {
    const sessions = this.sessionsService.listSessions(status);
    return {
      sessions,
      total: sessions.length,
    };
  }

  @Get('target/:targetIp')
  listSessionsByTarget(@Param('targetIp') targetIp: string) {
    const sessions = this.sessionsService.getSessionsByTarget(targetIp);
    return {
      target_ip: targetIp,
      sessions,
      total: sessions.length,
    };
  }

  @Get(':sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    const session = this.sessionsService.getSession(sessionId);
    if (!session) {
      return { success: false, error: `Session not found: ${sessionId}` };
    }
    return { success: true, session };
  }

  @Post()
  createSession(@Body() body: CreateSessionRequestDto) {
    const sessionId = this.sessionsService.createSession(
      body.target_ip,
      body.connection_type,
      body.auth_info ?? {},
    );
    return { success: true, session_id: sessionId };
  }

  @Post(':sessionId/commands')
  addCommand(
    @Param('sessionId') sessionId: string,
    @Body() body: AddCommandRequestDto,
  ) {
    const ok = this.sessionsService.addCommand(sessionId, body.command, body.result ?? {});
    if (!ok) {
      return { success: false, error: `Session not found: ${sessionId}` };
    }
    return { success: true };
  }

  @Post(':sessionId/files')
  addFileTransfer(
    @Param('sessionId') sessionId: string,
    @Body() body: AddFileTransferRequestDto,
  ) {
    const ok = this.sessionsService.addFileTransfer(
      sessionId,
      body.transfer_type,
      body.local_path,
      body.remote_path,
      body.result ?? {},
    );
    if (!ok) {
      return { success: false, error: `Session not found: ${sessionId}` };
    }
    return { success: true };
  }

  @Post(':sessionId/close')
  closeSession(@Param('sessionId') sessionId: string) {
    const ok = this.sessionsService.closeSession(sessionId);
    if (!ok) {
      return { success: false, error: `Session not found: ${sessionId}` };
    }
    return { success: true };
  }
}
