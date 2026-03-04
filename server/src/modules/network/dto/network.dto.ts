import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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

  @IsBoolean()
  authorized: boolean = false;
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

