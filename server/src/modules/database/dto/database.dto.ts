import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class DbStatsResponseDto {
  conversations = 0;

  promptChains = 0;

  userConfigs = 0;

  crawlerTasks = 0;

  crawlerTasksByStatus: Record<string, number> = {};
}

export class DbHistoryQueryDto {
  @IsOptional()
  @IsString()
  agent?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  limit = 10;

  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class ConversationRecordDto {
  timestamp: string = 'N/A';

  agentType: string = '';

  userMessage: string = '';

  assistantMessage: string = '';
}

export class DbHistoryResponseDto {
  conversations: ConversationRecordDto[] = [];
}

export class DbClearQueryDto {
  @IsOptional()
  @IsString()
  agent?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class DbClearResponseDto {
  @IsInt()
  deletedCount!: number;

  @IsString()
  message!: string;

  @IsInt()
  // 保留字段名，使前端兼容
  success = 1;
}
