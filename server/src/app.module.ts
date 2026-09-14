import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { HealthModule } from './modules/health/health.module';
import configuration from './config/configuration';
import { SessionsModule } from './modules/sessions/sessions.module';
import { ToolsModule } from './modules/tools/tools.module';
import { AgentsModule } from './modules/agents/agents.module';
import { NetworkModule } from './modules/network/network.module';
import { DefenseModule } from './modules/defense/defense.module';
import { DatabaseModule } from './modules/database/database.module';
import { SystemModule } from './modules/system/system.module';
import { ChatModule } from './modules/chat/chat.module';
import { CrawlerModule } from './modules/crawler/crawler.module';
import { MemoryModule } from './modules/memory/memory.module';
import { VulnDbModule } from './modules/vuln-db/vuln-db.module';
import { SkillsModule } from './modules/skills/skills.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { PreferencesModule } from './modules/preferences/preferences.module';
import { CommandsModule } from './modules/commands/commands.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/{*path}'],
    }),
    HealthModule,
    SessionsModule,
    ToolsModule,
    AgentsModule,
    NetworkModule,
    DefenseModule,
    DatabaseModule,
    SystemModule,
    ChatModule,
    CrawlerModule,
    MemoryModule,
    VulnDbModule,
    SkillsModule,
    WorkspacesModule,
    PreferencesModule,
    CommandsModule,
  ],
})
export class AppModule {}
