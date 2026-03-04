import { Controller, Get } from '@nestjs/common';

@Controller('api/sessions')
export class SessionsController {
  @Get()
  listSessions() {
    return {
      sessions: [],
      note: '当前 TS 后端为无状态，会话仍由前端/TUI 本地管理。',
    };
  }
}

