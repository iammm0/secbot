import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NetworkModule } from '../network/network.module';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';
import { ExecutionRouter } from './execution-router';

@Module({
  imports: [DatabaseModule, NetworkModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, ExecutionRouter],
  exports: [WorkspacesService, ExecutionRouter],
})
export class WorkspacesModule {}
