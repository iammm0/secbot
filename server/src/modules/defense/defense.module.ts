import { Module } from '@nestjs/common';
import { DefenseController } from './defense.controller';
import { DefenseService } from './defense.service';

@Module({
  controllers: [DefenseController],
  providers: [DefenseService],
  exports: [DefenseService],
})
export class DefenseModule {}

