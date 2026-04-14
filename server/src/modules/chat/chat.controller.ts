import { Body, Controller, HttpException, Logger, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { mapExceptionToClientBody } from '../../common/errors/map-exception-to-client';
import { ChatService } from './chat.service';
import { ChatRequestDto, RootResponseRequestDto } from './dto/chat.dto';

@Controller('api/chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chatStream(@Body() body: ChatRequestDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const send = (event: string, data: Record<string, unknown>) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await this.chatService.handleMessage(body, send);
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
    }
    res.end();
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
