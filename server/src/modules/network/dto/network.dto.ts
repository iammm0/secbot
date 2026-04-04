import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class DiscoverRequestDto {
  @IsOptional()
  @IsString()
  network?: string;
}

export class HostInfoDto {
  @IsString()
  ip!: string;

  @IsString()
  hostname: string = 'Unknown';

  @IsString()
  macAddress: string = 'Unknown';

  openPorts: number[] = [];

  services: Record<number, string> = {};

  @IsBoolean()
  authorized: boolean = false;

  @IsOptional()
  @IsString()
  osType?: string;

  @IsOptional()
  @IsString()
  discoveredAt?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class DiscoverResponseDto {
  @IsBoolean()
  success!: boolean;

  hosts: HostInfoDto[] = [];
}

export class TargetListResponseDto {
  targets: HostInfoDto[] = [];
}

export class AuthorizeRequestDto {
  @IsString()
  targetIp!: string;

  @IsString()
  username!: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  keyFile?: string;

  @IsString()
  authType: string = 'full';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class AuthorizeResponseDto {
  @IsBoolean()
  success!: boolean;

  @IsString()
  message!: string;
}

export class AuthorizationInfoDto {
  @IsString()
  targetIp!: string;

  @IsString()
  authType: string = 'N/A';

  @IsString()
  username: string = 'N/A';

  @IsString()
  createdAt: string = 'N/A';

  @IsString()
  description: string = 'N/A';

  @IsString()
  status: string = 'active';

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class AuthorizationListResponseDto {
  authorizations: AuthorizationInfoDto[] = [];
}

export class RevokeResponseDto {
  @IsBoolean()
  success!: boolean;

  @IsString()
  message!: string;
}

export class ConnectTargetRequestDto {
  @IsString()
  targetIp!: string;

  @IsOptional()
  @IsString()
  connectionType?: string;
}

export class ExecuteTargetRequestDto {
  @IsString()
  targetIp!: string;

  @IsString()
  command!: string;

  @IsOptional()
  @IsString()
  connectionType?: string;
}

export class UploadFileRequestDto {
  @IsString()
  targetIp!: string;

  @IsString()
  localPath!: string;

  @IsString()
  remotePath!: string;

  @IsOptional()
  @IsString()
  connectionType?: string;
}

export class DownloadFileRequestDto {
  @IsString()
  targetIp!: string;

  @IsString()
  remotePath!: string;

  @IsString()
  localPath!: string;

  @IsOptional()
  @IsString()
  connectionType?: string;
}

export class DisconnectTargetRequestDto {
  @IsString()
  targetIp!: string;

  @IsOptional()
  @IsString()
  connectionType?: string;
}
