import { IsArray, IsOptional, IsString } from 'class-validator';

export class SkillSummaryDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsString()
  version!: string;

  @IsString()
  author!: string;

  @IsArray()
  tags: string[] = [];

  @IsArray()
  triggers: string[] = [];

  @IsArray()
  prerequisites: string[] = [];

  @IsString()
  slug!: string;

  @IsString()
  scope!: string;

  @IsString()
  relativeDir!: string;
}

export class SkillDetailDto extends SkillSummaryDto {
  @IsString()
  body!: string;
}

export class ListSkillsResponseDto {
  skills: SkillSummaryDto[] = [];
}

export class CreateSkillRequestDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  version?: string;

  @IsOptional()
  @IsString()
  author?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  triggers?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];

  @IsOptional()
  @IsString()
  body?: string;
}
