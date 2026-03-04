import { Injectable } from '@nestjs/common';
import {
  AuthorizeRequestDto,
  AuthorizeResponseDto,
  AuthorizationInfoDto,
  AuthorizationListResponseDto,
  DiscoverRequestDto,
  DiscoverResponseDto,
  HostInfoDto,
  RevokeResponseDto,
  TargetListResponseDto,
} from './dto/network.dto';

@Injectable()
export class NetworkService {
  async discover(_body: DiscoverRequestDto): Promise<DiscoverResponseDto> {
    // 占位：领域模块迁移时接入真正的网络发现逻辑
    const hosts: HostInfoDto[] = [];
    return { success: true, hosts };
  }

  async listTargets(_authorizedOnly: boolean): Promise<TargetListResponseDto> {
    // 占位：后续从 TS 版 MainController 读取
    return { targets: [] };
  }

  async authorize(body: AuthorizeRequestDto): Promise<AuthorizeResponseDto> {
    // 占位：后续接入授权与凭据管理
    return {
      success: true,
      message: `已记录对 ${body.targetIp} 的授权请求（TS 占位实现）`,
    };
  }

  async listAuthorizations(): Promise<AuthorizationListResponseDto> {
    return { authorizations: [] };
  }

  async revokeAuthorization(targetIp: string): Promise<RevokeResponseDto> {
    return {
      success: true,
      message: `已标记撤销授权: ${targetIp}（TS 占位实现）`,
    };
  }
}

