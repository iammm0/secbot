import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateCrawlTaskRequestDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsString()
  crawler_type?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class ExecuteBatchRequestDto {
  urls: string[] = [];

  @IsOptional()
  @IsString()
  crawler_type?: string;
}

export class AddMonitorRequestDto {
  @IsString()
  url!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(86400)
  interval?: number;

  @IsOptional()
  extractor_config?: Record<string, unknown>;
}

export class CrawlerTaskDto {
  @IsString()
  id!: string;

  @IsString()
  url!: string;

  @IsString()
  crawler_type!: string;

  @IsString()
  status!: string;

  @IsOptional()
  result?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  error?: string;

  @IsString()
  created_at!: string;

  @IsOptional()
  @IsString()
  completed_at?: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
