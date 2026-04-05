import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';

export type ChatMode = 'ask' | 'agent';

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

  @IsIn(['ask', 'agent'])
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
}

export class ChatResponseDto {
  @IsString()
  response!: string;

  @IsString()
  agent!: string;
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
