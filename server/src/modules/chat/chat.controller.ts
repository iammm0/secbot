import { Body, Controller, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { ChatService } from './chat.service';
import { ChatRequestDto, RootResponseRequestDto } from './dto/chat.dto';

@Controller('api/chat')
export class ChatController {
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
      send('error', {
        error: err instanceof Error ? err.message : String(err),
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
