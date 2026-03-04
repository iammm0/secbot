import { Injectable } from '@nestjs/common';
import { ALL_SECURITY_TOOLS } from './security';
import { ListToolsResponseDto } from './dto/tools.dto';

@Injectable()
export class ToolsService {
  listTools(): ListToolsResponseDto {
    return {
      tools: ALL_SECURITY_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
      })),
    };
  }
}
