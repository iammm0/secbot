import { IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { MEMORY_TYPES } from '../memory.models';

export class RememberRequestDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsIn(MEMORY_TYPES)
  memory_type?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  importance?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class RecallQueryDto {
  @IsOptional()
  @IsString()
  query?: string;

  @IsOptional()
  @IsIn(MEMORY_TYPES)
  memory_type?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class ContextQueryDto {
  @IsOptional()
  @IsString()
  query?: string;
}

export class DistillConversationRequestDto {
  @IsArray()
  conversation!: Array<Record<string, unknown>>;

  @IsString()
  summary!: string;
}

export class AddEpisodeRequestDto {
  @IsString()
  event!: string;

  @IsString()
  outcome!: string;

  @IsOptional()
  @IsString()
  target?: string;
}

export class AddKnowledgeRequestDto {
  @IsString()
  fact!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  importance?: number;
}

export class ClearMemoryRequestDto {
  @IsOptional()
  @IsIn(MEMORY_TYPES)
  memory_type?: string;
}

export class AddVectorMemoryRequestDto {
  @IsString()
  content!: string;

  @IsArray()
  @IsNumber({}, { each: true })
  vector!: number[];

  @IsOptional()
  @IsIn(MEMORY_TYPES)
  memory_type?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class SearchVectorMemoryRequestDto {
  @IsArray()
  @IsNumber({}, { each: true })
  query_vector!: number[];

  @IsOptional()
  @IsIn(MEMORY_TYPES)
  memory_type?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(200)
  limit?: number;
}
