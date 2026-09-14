import { Module } from '@nestjs/common';
import { CommandsController } from './commands.controller';
import { CommandsService } from './commands.service';

@Module({
  controllers: [CommandsController],
  providers: [CommandsService],
  exports: [CommandsService],
})
export class CommandsModule {}
