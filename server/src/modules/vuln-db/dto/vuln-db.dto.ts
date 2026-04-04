import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchNaturalLanguageRequestDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class SearchByScanResultRequestDto {
  @IsObject()
  scan_result!: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class SyncFromSourcesRequestDto {
  @IsArray()
  @IsString({ each: true })
  keywords!: string[];

  @IsOptional()
  @IsArray()
  @IsIn(['cve', 'nvd', 'exploit_db', 'mitre_attack'], { each: true })
  sources?: string[];

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  limit_per_source?: number;
}
