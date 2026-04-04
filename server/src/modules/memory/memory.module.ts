import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MemoryController } from './memory.controller';
import { MemoryService } from './memory.service';
import { VectorStoreManagerService } from './vector-store.service';

@Module({
  imports: [ConfigModule],
  controllers: [MemoryController],
  providers: [MemoryService, VectorStoreManagerService],
  exports: [MemoryService, VectorStoreManagerService],
})
export class MemoryModule {}

