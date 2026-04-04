import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateSessionRequestDto {
  @IsString()
  target_ip!: string;

  @IsString()
  connection_type!: string;

  @IsOptional()
  @IsObject()
  auth_info?: Record<string, unknown>;
}

export class AddCommandRequestDto {
  @IsString()
  command!: string;

  @IsOptional()
  result?: unknown;
}

export class AddFileTransferRequestDto {
  @IsString()
  @IsIn(['upload', 'download'])
  transfer_type!: 'upload' | 'download';

  @IsString()
  local_path!: string;

  @IsString()
  remote_path!: string;

  @IsOptional()
  result?: unknown;
}

export class SessionCommandRecordDto {
  @IsString()
  command!: string;

  result!: unknown;

  @IsString()
  timestamp!: string;
}

export class SessionFileTransferRecordDto {
  @IsString()
  type!: string;

  @IsString()
  local_path!: string;

  @IsString()
  remote_path!: string;

  result!: unknown;

  @IsString()
  timestamp!: string;
}

export class SessionRecordDto {
  @IsString()
  session_id!: string;

  @IsString()
  target_ip!: string;

  @IsString()
  connection_type!: string;

  auth_info!: Record<string, unknown>;

  @IsString()
  created_at!: string;

  @IsString()
  last_activity!: string;

  @IsString()
  status!: string;

  commands_executed: SessionCommandRecordDto[] = [];

  files_transferred: SessionFileTransferRecordDto[] = [];

  @IsOptional()
  @IsString()
  closed_at?: string;
}
