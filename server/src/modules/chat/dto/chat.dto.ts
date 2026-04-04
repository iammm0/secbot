import { IsIn, IsOptional, IsString } from 'class-validator';

export type ChatMode = 'ask' | 'agent';

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

