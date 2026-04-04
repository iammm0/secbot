import { IsOptional, IsString } from 'class-validator';

export class AgentInfoDto {
  @IsString()
  type!: string;

  @IsString()
  name!: string;

  @IsString()
  description!: string;
}

export class AgentListResponseDto {
  agents!: AgentInfoDto[];
}

export class ClearMemoryRequestDto {
  @IsOptional()
  @IsString()
  agent?: string;
}

export class ClearMemoryResponseDto {
  success!: boolean;

  message!: string;
}
