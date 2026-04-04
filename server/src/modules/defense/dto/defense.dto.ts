import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class DefenseScanResponseDto {
  @IsBoolean()
  success!: boolean;

  report: Record<string, unknown> = {};
}

export class DefenseStatusResponseDto {
  @IsBoolean()
  monitoring!: boolean;

  @IsBoolean()
  autoResponse!: boolean;

  blockedIps!: number;

  vulnerabilities!: number;

  detectedAttacks!: number;

  maliciousIps!: number;

  statistics: Record<string, unknown> = {};
}

export class BlockedIpsResponseDto {
  blockedIps!: string[];
}

export class UnblockRequestDto {
  @IsString()
  ip!: string;
}

export class UnblockResponseDto {
  @IsBoolean()
  success!: boolean;

  @IsString()
  message!: string;
}

export class DefenseReportResponseDto {
  @IsBoolean()
  success!: boolean;

  report: Record<string, unknown> = {};
}

export class DefenseReportQueryDto {
  @IsOptional()
  @IsString()
  type?: string;
}
