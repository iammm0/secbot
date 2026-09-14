import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const WORKSPACE_NODE_KINDS = ['secbot', 'ssh'] as const;
export type WorkspaceNodeKind = 'local' | (typeof WORKSPACE_NODE_KINDS)[number];

export class CreateWorkspaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;
}

export class RenameWorkspaceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;
}

export class AddWorkspaceNodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsIn(WORKSPACE_NODE_KINDS)
  kind!: Exclude<WorkspaceNodeKind, 'local'>;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  keyFile?: string;
}

export class BindWorkspaceSessionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  sessionId!: string;

  @IsOptional()
  @IsString()
  nodeId?: string;
}
