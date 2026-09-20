import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

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
