import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { DefenseService } from './defense.service';
import { UnblockRequestDto } from './dto/defense.dto';

@Controller('api/defense')
export class DefenseController {
  constructor(private readonly defenseService: DefenseService) {}

  @Post('scan')
  scan() {
    return this.defenseService.scan();
  }

  @Get('status')
  status() {
    return this.defenseService.status();
  }

  @Get('blocked')
  blocked() {
    return this.defenseService.blocked();
  }

  @Post('unblock')
  unblock(@Body() body: UnblockRequestDto) {
    return this.defenseService.unblock(body);
  }

  @Get('report')
  report(
    @Query('type')
    type = 'vulnerability',
  ) {
    return this.defenseService.report(type);
  }
}

