import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { AuditController } from './audit.controller';
import { ChatService } from './chat.service';
import { ToolsModule } from '../tools/tools.module';
import { DatabaseModule } from '../database/database.module';
import { MemoryModule } from '../memory/memory.module';
import { PreferencesModule } from '../preferences/preferences.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ContextAssemblerService } from './context-assembler.service';
import { ContextStoreService } from './context-store.service';
import { AgentFactoryService } from './agent-factory.service';

@Module({
  imports: [ToolsModule, DatabaseModule, MemoryModule, PreferencesModule, WorkspacesModule],
  controllers: [ChatController, AuditController],
  providers: [ChatService, ContextAssemblerService, ContextStoreService, AgentFactoryService],
  exports: [ChatService],
})
export class ChatModule {}
