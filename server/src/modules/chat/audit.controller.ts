import { Controller, Delete, Get, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DatabaseService } from '../database/database.service';

class AuditQueryDto {
  @IsOptional()
  @IsString()
  session_id?: string;

  @IsOptional()
  @IsString()
  agent?: string;

  @IsOptional()
  @IsString()
  step_type?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

class AuditClearQueryDto {
  @IsOptional()
  @IsString()
  session_id?: string;
}

@Controller('api/audit')
export class AuditController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  list(@Query() query: AuditQueryDto) {
    const { total, records } = this.database.listAuditRecords({
      sessionId: query.session_id,
      agent: query.agent,
      stepType: query.step_type,
      q: query.q,
      limit: query.limit,
      offset: query.offset,
    });
    return {
      total,
      records: records.map((rec) => ({
        id: rec.id,
        session_id: rec.sessionId,
        agent: rec.agent,
        step_type: rec.stepType,
        content: rec.content,
        metadata: safeParseJson(rec.metadata),
        timestamp: rec.timestamp,
      })),
    };
  }

  @Delete()
  clear(@Query() query: AuditClearQueryDto) {
    const deleted = this.database.deleteAuditTrail(query.session_id);
    return { deleted };
  }
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return { raw };
  }
}
