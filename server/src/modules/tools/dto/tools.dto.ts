export interface SecurityToolDto {
  name: string;
  description: string;
  category?: string;
}

export interface ListToolsResponseDto {
  total?: number;
  basic_count?: number;
  advanced_count?: number;
  categories?: Array<{
    id: string;
    name: string;
    count: number;
    tools: SecurityToolDto[];
  }>;
  tools: SecurityToolDto[];
}

export interface ExecuteToolRequestDto {
  tool: string;
  params?: Record<string, unknown>;
}

export interface ExecuteToolResponseDto {
  success: boolean;
  result: unknown;
  error?: string;
}

