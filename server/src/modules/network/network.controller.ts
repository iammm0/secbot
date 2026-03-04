import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { NetworkService } from './network.service';
import { AuthorizeRequestDto, DiscoverRequestDto } from './dto/network.dto';

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
    authorizedOnly = false,
  ) {
    return this.networkService.listTargets(authorizedOnly);
  }

  @Post('authorize')
  authorize(@Body() body: AuthorizeRequestDto) {
    return this.networkService.authorize(body);
  }

  @Get('authorizations')
  listAuthorizations() {
    return this.networkService.listAuthorizations();
  }

  @Delete('authorize/:targetIp')
  revokeAuthorization(@Param('targetIp') targetIp: string) {
    return this.networkService.revokeAuthorization(targetIp);
  }
}

