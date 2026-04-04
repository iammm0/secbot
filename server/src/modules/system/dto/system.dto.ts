import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class SystemInfoResponseDto {
  @IsString()
  osType!: string;

  @IsString()
  osName!: string;

  @IsString()
  osVersion!: string;

  @IsString()
  osRelease!: string;

  @IsString()
  architecture!: string;

  @IsString()
  processor!: string;

  @IsString()
  nodeVersion!: string;

  @IsString()
  hostname!: string;

  @IsString()
  username!: string;
}

export class SystemConfigResponseDto {
  @IsString()
  llmProvider!: string;

  @IsString()
  ollamaModel!: string;

  @IsString()
  ollamaBaseUrl!: string;

  @IsOptional()
  @IsString()
  deepseekModel?: string | null;

  @IsOptional()
  @IsString()
  deepseekBaseUrl?: string | null;
}

export class OllamaModelItemDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsNumber()
  size?: number | null;

  @IsOptional()
  @IsString()
  modifiedAt?: string | null;

  @IsOptional()
  @IsString()
  parameterSize?: string | null;

  @IsOptional()
  @IsString()
  family?: string | null;
}

export class OllamaModelsResponseDto {
  models: OllamaModelItemDto[] = [];

  @IsString()
  baseUrl!: string;

  @IsOptional()
  @IsString()
  error?: string | null;

  @IsOptional()
  @IsString()
  pullingModel?: string | null;
}

export class ProviderApiKeyStatusDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsBoolean()
  needsApiKey: boolean = true;

  @IsBoolean()
  configured: boolean = false;

  @IsBoolean()
  needsBaseUrl: boolean = false;

  @IsBoolean()
  hasBaseUrl: boolean = false;
}

export class ProviderListResponseDto {
  providers: ProviderApiKeyStatusDto[] = [];
}

export class SetApiKeyRequestDto {
  @IsString()
  provider!: string;

  @IsString()
  apiKey!: string;

  @IsOptional()
  @IsString()
  baseUrl?: string | null;
}

export class SetApiKeyResponseDto {
  @IsBoolean()
  success!: boolean;

  @IsString()
  message!: string;
}

export class CpuInfoDto {
  @IsOptional()
  @IsNumber()
  count?: number | null;

  @IsOptional()
  @IsNumber()
  percent?: number | null;

  @IsOptional()
  @IsNumber()
  freqCurrent?: number | null;
}

export class MemoryInfoDto {
  @IsNumber()
  totalGb!: number;

  @IsNumber()
  usedGb!: number;

  @IsNumber()
  availableGb!: number;

  @IsNumber()
  percent!: number;
}

export class DiskInfoDto {
  @IsString()
  device!: string;

  @IsString()
  mountpoint!: string;

  @IsNumber()
  totalGb!: number;

  @IsNumber()
  usedGb!: number;

  @IsNumber()
  percent!: number;
}

export class SystemStatusResponseDto {
  @IsOptional()
  cpu?: CpuInfoDto | null;

  @IsOptional()
  memory?: MemoryInfoDto | null;

  disks: DiskInfoDto[] = [];
}
