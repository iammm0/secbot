import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { NetworkService } from './network.service';
import {
  AuthorizeRequestDto,
  ConnectTargetRequestDto,
  DiscoverRequestDto,
  DisconnectTargetRequestDto,
  DownloadFileRequestDto,
  ExecuteTargetRequestDto,
  UploadFileRequestDto,
} from './dto/network.dto';

@Controller('api/network')
export class NetworkController {
  constructor(private readonly networkService: NetworkService) {}

  @Post('discover')
  discover(@Body() body: DiscoverRequestDto) {
    return this.networkService.discover(body);
  }

  @Get('targets')
  listTargets(
    @Query('authorized_only')
    authorizedOnly: string | boolean = false,
  ) {
    const enabled =
      typeof authorizedOnly === 'boolean'
        ? authorizedOnly
        : ['1', 'true', 'yes', 'on'].includes(String(authorizedOnly).toLowerCase());
    return this.networkService.listTargets(enabled);
  }

  @Post('authorize')
  authorize(@Body() body: AuthorizeRequestDto) {
    return this.networkService.authorize(body);
  }

  @Get('authorizations')
  listAuthorizations() {
    return this.networkService.listAuthorizations();
  }

  @Get('authorized-targets')
  getAuthorizedTargets() {
    return this.networkService.getAuthorizedTargets();
  }

  @Delete('authorize/:targetIp')
  revokeAuthorization(@Param('targetIp') targetIp: string) {
    return this.networkService.revokeAuthorization(targetIp);
  }

  @Post('connect')
  connectTarget(@Body() body: ConnectTargetRequestDto) {
    return this.networkService.connectTarget(body);
  }

  @Post('execute')
  executeOnTarget(@Body() body: ExecuteTargetRequestDto) {
    return this.networkService.executeOnTarget(body);
  }

  @Post('upload')
  uploadToTarget(@Body() body: UploadFileRequestDto) {
    return this.networkService.uploadToTarget(body);
  }

  @Post('download')
  downloadFromTarget(@Body() body: DownloadFileRequestDto) {
    return this.networkService.downloadFromTarget(body);
  }

  @Post('disconnect')
  disconnectTarget(@Body() body: DisconnectTargetRequestDto) {
    return this.networkService.disconnectTarget(body);
  }

  @Get('control/sessions')
  listControlSessions() {
    return this.networkService.listActiveControlSessions();
  }
}

