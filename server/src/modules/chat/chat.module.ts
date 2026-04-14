import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ToolsModule } from '../tools/tools.module';
import { DatabaseModule } from '../database/database.module';
import { MemoryModule } from '../memory/memory.module';
import { ContextAssemblerService } from './context-assembler.service';

@Module({
  imports: [ToolsModule, DatabaseModule, MemoryModule],
  controllers: [ChatController],
  providers: [ChatService, ContextAssemblerService],
  exports: [ChatService],
})
export class ChatModule { }
