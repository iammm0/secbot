import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export type ChatMode = 'agent';

/** 客户端内置终端环境（可选），用于提示 LLM 生成与用户侧一致的命令 */
export class ClientShellDto {
  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  shell?: string;

  @IsOptional()
  @IsString()
  comspec?: string;

  /** 如 “Windows Terminal · PowerShell” */
  @IsOptional()
  @IsString()
  terminal_profile?: string;
}

export class ChatRequestDto {
  @IsString()
  message!: string;

  @IsOptional()
  @IsString()
  session_id?: string;

  @IsOptional()
  @IsIn(['agent'])
  mode: ChatMode = 'agent';

  @IsString()
  agent: string = 'hackbot';

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ClientShellDto)
  client_shell?: ClientShellDto;

  /** 客户端声明：从暂停的原任务继续，而不是新开任务 */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  resume?: boolean;

  /** 原任务文本（服务端内存丢失时由客户端带回） */
  @IsOptional()
  @IsString()
  resume_from?: string;

  /** 把本轮对话归入指定工作空间 */
  @IsOptional()
  @IsString()
  workspace_id?: string;

  /** 选中的工作空间节点；未传则用会话绑定或工作空间默认节点 */
  @IsOptional()
  @IsString()
  node_id?: string;
}

export class ChatResponseDto {
  @IsString()
  response!: string;

  @IsString()
  agent!: string;
}

export class ChatSessionsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

export class ChatSessionHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 100;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;
}

export class PatchChatSessionDto {
  @IsOptional()
  @IsString()
  title?: string;
}

export type RootAction = 'run_once' | 'always_allow' | 'deny';

export class RootResponseRequestDto {
  @IsString()
  requestId!: string;

  @IsIn(['run_once', 'always_allow', 'deny'])
  action!: RootAction;

  @IsOptional()
  @IsString()
  password?: string;
}
