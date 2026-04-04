import { Injectable } from '@nestjs/common';
import {
  SessionCommandRecordDto,
  SessionFileTransferRecordDto,
  SessionRecordDto,
} from './dto/sessions.dto';

@Injectable()
export class SessionsService {
  private readonly sessions = new Map<string, SessionRecordDto>();

  createSession(
    targetIp: string,
    connectionType: string,
    authInfo: Record<string, unknown> = {},
  ): string {
    const sessionId = `${targetIp}_${connectionType}_${this.timestampForId()}`;
    const now = new Date().toISOString();
    const session: SessionRecordDto = {
      session_id: sessionId,
      target_ip: targetIp,
      connection_type: connectionType,
      auth_info: authInfo,
      created_at: now,
      last_activity: now,
      status: 'active',
      commands_executed: [],
      files_transferred: [],
    };
    this.sessions.set(sessionId, session);
    return sessionId;
  }

  getSession(sessionId: string): SessionRecordDto | null {
    return this.sessions.get(sessionId) ?? null;
  }

  updateSessionActivity(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.last_activity = new Date().toISOString();
    return true;
  }

  addCommand(sessionId: string, command: string, result: unknown): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const record: SessionCommandRecordDto = {
      command,
      result,
      timestamp: new Date().toISOString(),
    };
    session.commands_executed.push(record);
    this.updateSessionActivity(sessionId);
    return true;
  }

  addFileTransfer(
    sessionId: string,
    transferType: string,
    localPath: string,
    remotePath: string,
    result: unknown,
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    const record: SessionFileTransferRecordDto = {
      type: transferType,
      local_path: localPath,
      remote_path: remotePath,
      result,
      timestamp: new Date().toISOString(),
    };
    session.files_transferred.push(record);
    this.updateSessionActivity(sessionId);
    return true;
  }

  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.status = 'closed';
    session.closed_at = new Date().toISOString();
    this.updateSessionActivity(sessionId);
    return true;
  }

  listSessions(status?: string): SessionRecordDto[] {
    const list = [...this.sessions.values()];
    if (!status) return list;
    return list.filter((session) => session.status === status);
  }

  getSessionsByTarget(targetIp: string): SessionRecordDto[] {
    return [...this.sessions.values()].filter(
      (session) => session.target_ip === targetIp && session.status === 'active',
    );
  }

  private timestampForId(): string {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
  }
}
