import { Module } from '@nestjs/common';
import { NetworkController } from './network.controller';
import { NetworkService } from './network.service';
import { RemoteControlService } from './remote-control.service';
import { SessionsModule } from '../sessions/sessions.module';

@Module({
  imports: [SessionsModule],
  controllers: [NetworkController],
  providers: [NetworkService, RemoteControlService],
  exports: [NetworkService],
})
export class NetworkModule {}

