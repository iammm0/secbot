import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class SetInstructionsDto {
  @IsString()
  instructions!: string;
}

export class AddMcpServerDto {
  @IsString()
  name!: string;

  @IsString()
  command!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  args?: string[];

  @IsOptional()
  @IsString()
  cwd?: string;
}

export class SetExecGoConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  auditActions?: boolean;

  @IsOptional()
  @IsBoolean()
  fallbackLocal?: boolean;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  runtimeUrl?: string;

  @IsOptional()
  @IsString()
  cliPath?: string;
}

export class SetJevConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  intent?: boolean;

  @IsOptional()
  @IsBoolean()
  qaLive?: boolean;

  @IsOptional()
  @IsBoolean()
  adaptive?: boolean;

  @IsOptional()
  @IsBoolean()
  reactStop?: boolean;

  @IsOptional()
  @IsBoolean()
  context?: boolean;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsNumber()
  confidenceMin?: number;

  @IsOptional()
  @IsNumber()
  reactStopMin?: number;
}
