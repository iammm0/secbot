import { Controller, Delete, Get, Query } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { DbClearQueryDto, DbHistoryQueryDto } from './dto/database.dto';

@Controller('api/db')
export class DatabaseController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get('stats')
  stats() {
    return this.databaseService.stats();
  }

  @Get('history')
  history(@Query() query: DbHistoryQueryDto) {
    return this.databaseService.history(query);
  }

  @Delete('history')
  clear(@Query() query: DbClearQueryDto) {
    return this.databaseService.clear(query);
  }
}

