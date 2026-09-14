import { IsArray, IsOptional, IsString } from 'class-validator';

export class SetInstructionsDto {
  @IsString()
  instructions!: string;
}

export class AddMcpServerDto {
  @IsString()
  name!: string;

  @IsString()
  command!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  args?: string[];

  @IsOptional()
  @IsString()
  cwd?: string;
}
