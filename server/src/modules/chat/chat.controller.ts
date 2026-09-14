import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { mapExceptionToClientBody } from '../../common/errors/map-exception-to-client';
import { ChatService } from './chat.service';
import {
  ChatRequestDto,
  ChatSessionHistoryQueryDto,
  ChatSessionsQueryDto,
  PatchChatSessionDto,
  RootResponseRequestDto,
} from './dto/chat.dto';

@Controller('api/chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Get('sessions')
  sessions(@Query() query: ChatSessionsQueryDto) {
    return this.chatService.listPersistedSessions(query);
  }

  @Get('sessions/:sessionId/history')
  sessionHistory(
    @Param('sessionId') sessionId: string,
    @Query() query: ChatSessionHistoryQueryDto,
  ) {
    return this.chatService.getPersistedSessionHistory(sessionId, query);
  }

  @Patch('sessions/:sessionId')
  patchSession(@Param('sessionId') sessionId: string, @Body() body: PatchChatSessionDto) {
    return this.chatService.patchPersistedSession(sessionId, body);
  }

  @Delete('sessions/:sessionId')
  deleteSession(@Param('sessionId') sessionId: string) {
    return this.chatService.deletePersistedSession(sessionId);
  }

  @Post()
  async chatStream(@Body() body: ChatRequestDto, @Req() req: Request, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const abort = new AbortController();
    const onDisconnect = () => {
      if (!res.writableEnded) abort.abort();
    };
    req.on('close', onDisconnect);
    req.on('aborted', onDisconnect);

    const send = (event: string, data: Record<string, unknown>) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await this.chatService.handleMessage(body, send, abort.signal);
    } catch (err) {
      const mapped = mapExceptionToClientBody(err);
      if (!(err instanceof HttpException)) {
        const logText = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
        this.logger.error(`SSE chat failed: ${logText}`);
      }
      send('error', {
        error: mapped.message,
        code: mapped.code,
        statusCode: mapped.statusCode,
      });
      send('done', {});
    } finally {
      req.off('close', onDisconnect);
      req.off('aborted', onDisconnect);
    }
    if (!res.writableEnded) res.end();
  }

  @Post('root-response')
  rootResponse(@Body() body: RootResponseRequestDto) {
    return this.chatService.rootResponse(body);
  }

  @Post('sync')
  chatSync(@Body() body: ChatRequestDto) {
    return this.chatService.chatSync(body);
  }
}
