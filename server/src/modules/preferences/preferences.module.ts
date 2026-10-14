import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { McpBroker } from '../tools/mcp/mcp-broker';
import { StdioMcpSessionFactory } from '../tools/mcp/mcp-session';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

@Module({
  imports: [DatabaseModule],
  controllers: [PreferencesController],
  providers: [PreferencesService, StdioMcpSessionFactory, McpBroker],
  exports: [PreferencesService, McpBroker],
})
export class PreferencesModule {}
