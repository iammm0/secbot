import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { loadYamlConfig } from '../../config/yaml-config-loader.js';
import type {
  Conversation,
  PromptChain,
  UserConfig,
  CrawlerTask,
  AuditRecord,
  ScanResult,
} from './entities';
import { setActionAuditWriter } from '../chat/action-audit';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private db!: Database.Database;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dbPath = this.config.get<string>('app.databasePath', 'data/opencomsagent.db');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initDatabase();
    this.syncYamlToSqlite();
    setActionAuditWriter((rec) => {
      this.saveAuditRecord(rec);
    });
  }

  onModuleDestroy() {
    setActionAuditWriter(null);
    try {
      this.db?.close();
    } catch {
      /* already closed */
    }
  }

  /**
   * 启动时将 config.yaml 中的值同步到 SQLite（仅当 SQLite 中不存在时写入）。
   * 这样 SQLite 始终是“运行中状态”，YAML 是“默认值模板”。
   */
  private syncYamlToSqlite() {
    const rootDir = process.cwd();
    const { flat } = loadYamlConfig(rootDir);

    // YAML dot-notation key 转 SQLite key（小写 + 下划线）
    const toSqliteKey = (dotKey: string) => dotKey.toLowerCase().replace(/\./g, '_');

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO user_configs (key, value, category, description, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);

    // 只同步 LLM 和基础设施相关配置
    const syncPrefixes = ['llm.', 'database.', 'log.', 'server.'];

    for (const [dotKey, value] of Object.entries(flat)) {
      if (!syncPrefixes.some((p) => dotKey.startsWith(p))) continue;
      if (value === '' || value === undefined) continue;

      const sqliteKey = toSqliteKey(dotKey);
      // 只有 SQLite 中不存在时才写入
      const existing = this.db.prepare('SELECT id FROM user_configs WHERE key = ?').get(sqliteKey);
      if (!existing) {
        const category = dotKey.split('.')[0];
        insertStmt.run(sqliteKey, value, category, `YAML default: ${dotKey}`);
      }
    }
  }

  private initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_type TEXT NOT NULL DEFAULT '',
        user_message TEXT NOT NULL DEFAULT '',
        assistant_message TEXT NOT NULL DEFAULT '',
        session_id TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        metadata TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_conv_agent ON conversations(agent_type);
      CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id);

      CREATE TABLE IF NOT EXISTS prompt_chains (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        content TEXT NOT NULL DEFAULT '{}',
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS user_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL DEFAULT '',
        category TEXT NOT NULL DEFAULT 'general',
        description TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS crawler_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL DEFAULT '',
        task_type TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS attack_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL DEFAULT '',
        target TEXT NOT NULL DEFAULT '',
        attack_type TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT NOT NULL DEFAULT '{}',
        schedule TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_run TEXT NOT NULL DEFAULT '',
        run_count INTEGER NOT NULL DEFAULT 0,
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS scan_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target TEXT NOT NULL DEFAULT '',
        scan_type TEXT NOT NULL DEFAULT '',
        result TEXT NOT NULL DEFAULT '{}',
        vulnerabilities TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        metadata TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS audit_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL DEFAULT '',
        agent TEXT NOT NULL DEFAULT '',
        step_type TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL DEFAULT '',
        metadata TEXT NOT NULL DEFAULT '{}',
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_records(session_id);

      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS workspace_nodes (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'secbot',
        address TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'unknown',
        meta TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_workspace_nodes_ws ON workspace_nodes(workspace_id);
      CREATE TABLE IF NOT EXISTS workspace_sessions (
        session_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        node_id TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_workspace_sessions_ws ON workspace_sessions(workspace_id);
    `);
  }

  /* ---- Conversations ---- */

  saveConversation(c: Omit<Conversation, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO conversations (agent_type, user_message, assistant_message, session_id, timestamp, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      c.agentType,
      c.userMessage,
      c.assistantMessage,
      c.sessionId,
      c.timestamp || new Date().toISOString(),
      c.metadata || '{}',
    );
    return info.lastInsertRowid as number;
  }

  getConversations(
    opts: {
      agentType?: string;
      sessionId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): Conversation[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (opts.agentType) {
      clauses.push('agent_type = ?');
      params.push(opts.agentType);
    }
    if (opts.sessionId) {
      clauses.push('session_id = ?');
      params.push(opts.sessionId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = opts.limit ? `LIMIT ${opts.limit}` : '';
    const offset = opts.offset ? `OFFSET ${opts.offset}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM conversations ${where} ORDER BY id DESC ${limit} ${offset}`)
      .all(...params) as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapConversation(r));
  }

  listConversationSessions(opts: { limit?: number; offset?: number } = {}): {
    sessions: Array<{
      sessionId: string;
      title: string;
      agentType: string;
      turnCount: number;
      createdAt: string;
      updatedAt: string;
    }>;
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  } {
    const limit = Math.min(Math.max(Number(opts.limit ?? 50), 1), 100);
    const offset = Math.max(Number(opts.offset ?? 0), 0);
    const totalRow = this.db
      .prepare(
        'SELECT COUNT(*) as c FROM (SELECT session_id FROM conversations GROUP BY session_id)',
      )
      .get() as { c: number };
    const rows = this.db
      .prepare(
        `
        SELECT
          c.session_id as session_id,
          COUNT(*) as turn_count,
          MIN(c.timestamp) as created_at,
          MAX(c.timestamp) as updated_at,
          MAX(c.id) as last_id,
          COALESCE(
            (
              SELECT json_extract(c4.metadata, '$.title')
              FROM conversations c4
              WHERE c4.session_id = c.session_id
                AND json_extract(c4.metadata, '$.title') IS NOT NULL
                AND TRIM(json_extract(c4.metadata, '$.title')) != ''
              ORDER BY c4.id DESC
              LIMIT 1
            ),
            (
              SELECT c2.user_message
              FROM conversations c2
              WHERE c2.session_id = c.session_id
              ORDER BY c2.id ASC
              LIMIT 1
            )
          ) as title,
          (
            SELECT c3.agent_type
            FROM conversations c3
            WHERE c3.session_id = c.session_id
            ORDER BY c3.id DESC
            LIMIT 1
          ) as agent_type
        FROM conversations c
        GROUP BY c.session_id
        ORDER BY last_id DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(limit, offset) as Array<Record<string, unknown>>;

    return {
      sessions: rows.map((r) => {
        const sessionId = String(r['session_id'] ?? '').trim() || 'default';
        const title = String(r['title'] ?? '').trim() || sessionId;
        return {
          sessionId,
          title,
          agentType: String(r['agent_type'] ?? ''),
          turnCount: Number(r['turn_count'] ?? 0),
          createdAt: String(r['created_at'] ?? ''),
          updatedAt: String(r['updated_at'] ?? ''),
        };
      }),
      total: Number(totalRow.c ?? 0),
      limit,
      offset,
      hasMore: offset + rows.length < Number(totalRow.c ?? 0),
    };
  }

  getConversationHistoryPage(
    sessionId: string,
    opts: { limit?: number; offset?: number } = {},
  ): {
    sessionId: string;
    conversations: Array<{
      id: number;
      timestamp: string;
      agentType: string;
      userMessage: string;
      assistantMessage: string;
      sessionId: string;
    }>;
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  } {
    const normalizedSessionId = sessionId.trim() || 'default';
    const limit = Math.min(Math.max(Number(opts.limit ?? 100), 1), 200);
    const offset = Math.max(Number(opts.offset ?? 0), 0);
    const includeEmptyDefault = normalizedSessionId === 'default';
    const where = includeEmptyDefault ? '(session_id = ? OR session_id = ?)' : 'session_id = ?';
    const params = includeEmptyDefault ? [normalizedSessionId, ''] : [normalizedSessionId];
    const totalRow = this.db
      .prepare(`SELECT COUNT(*) as c FROM conversations WHERE ${where}`)
      .get(...params) as { c: number };
    const rows = this.db
      .prepare(
        `
        SELECT *
        FROM conversations
        WHERE ${where}
        ORDER BY id DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(...params, limit, offset) as Array<Record<string, unknown>>;
    const conversations = rows
      .map((r) => this.mapConversation(r))
      .reverse()
      .map((c) => ({
        id: Number(c.id ?? 0),
        timestamp: c.timestamp,
        agentType: c.agentType,
        userMessage: c.userMessage,
        assistantMessage: c.assistantMessage,
        sessionId: c.sessionId || 'default',
        metadata: c.metadata || '{}',
      }));

    return {
      sessionId: normalizedSessionId,
      conversations,
      total: Number(totalRow.c ?? 0),
      limit,
      offset,
      hasMore: offset + rows.length < Number(totalRow.c ?? 0),
    };
  }

  deleteConversations(
    opts: {
      agentType?: string;
      sessionId?: string;
    } = {},
  ): number {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (opts.agentType) {
      clauses.push('agent_type = ?');
      params.push(opts.agentType);
    }
    if (opts.sessionId) {
      clauses.push('session_id = ?');
      params.push(opts.sessionId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const info = this.db.prepare(`DELETE FROM conversations ${where}`).run(...params);
    return info.changes;
  }

  getLatestConversation(sessionId: string): Conversation | null {
    const row = this.db
      .prepare('SELECT * FROM conversations WHERE session_id = ? ORDER BY id DESC LIMIT 1')
      .get(sessionId) as Record<string, unknown> | undefined;
    return row ? this.mapConversation(row) : null;
  }

  updateConversationMetadata(id: number, metadata: string): boolean {
    const info = this.db.prepare('UPDATE conversations SET metadata = ? WHERE id = ?').run(metadata, id);
    return info.changes > 0;
  }

  updateSessionTitle(sessionId: string, title: string): boolean {
    const trimmed = title.trim().slice(0, 80);
    const latest = this.getLatestConversation(sessionId);
    if (!latest?.id) {
      this.saveConversation({
        agentType: 'hackbot',
        userMessage: trimmed,
        assistantMessage: '',
        sessionId,
        timestamp: new Date().toISOString(),
        metadata: JSON.stringify({ title: trimmed, paused: null, timeline: [] }),
      });
      return true;
    }
    let meta: Record<string, unknown> = {};
    try {
      meta = JSON.parse(latest.metadata || '{}') as Record<string, unknown>;
    } catch {
      meta = {};
    }
    meta.title = trimmed;
    return this.updateConversationMetadata(latest.id, JSON.stringify(meta));
  }

  deleteChatSession(sessionId: string): number {
    const deleted = this.deleteConversations({ sessionId });
    this.unbindWorkspaceSession(sessionId);
    return deleted;
  }

  /* ---- UserConfig ---- */

  saveConfig(key: string, value: string, category = 'general', description = ''): number {
    const stmt = this.db.prepare(`
      INSERT INTO user_configs (key, value, category, description, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, category=excluded.category,
        description=excluded.description, updated_at=datetime('now')
    `);
    const info = stmt.run(key, value, category, description);
    return info.lastInsertRowid as number;
  }

  getConfig(key: string): UserConfig | null {
    const row = this.db.prepare('SELECT * FROM user_configs WHERE key = ?').get(key) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapUserConfig(row) : null;
  }

  listConfigs(category?: string): UserConfig[] {
    if (category) {
      return (
        this.db.prepare('SELECT * FROM user_configs WHERE category = ?').all(category) as Array<
          Record<string, unknown>
        >
      ).map((r) => this.mapUserConfig(r));
    }
    return (
      this.db.prepare('SELECT * FROM user_configs').all() as Array<Record<string, unknown>>
    ).map((r) => this.mapUserConfig(r));
  }

  deleteConfig(key: string): boolean {
    return this.db.prepare('DELETE FROM user_configs WHERE key = ?').run(key).changes > 0;
  }

  /* ---- PromptChain ---- */

  savePromptChain(chain: Omit<PromptChain, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO prompt_chains (name, content, description, created_at, updated_at, metadata)
      VALUES (?, ?, ?, datetime('now'), datetime('now'), ?)
      ON CONFLICT(name) DO UPDATE SET content=excluded.content, description=excluded.description,
        updated_at=datetime('now'), metadata=excluded.metadata
    `);
    const info = stmt.run(chain.name, chain.content, chain.description, chain.metadata || '{}');
    return info.lastInsertRowid as number;
  }

  getPromptChain(name: string): PromptChain | null {
    const row = this.db.prepare('SELECT * FROM prompt_chains WHERE name = ?').get(name) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapPromptChain(row) : null;
  }

  listPromptChains(): PromptChain[] {
    return (
      this.db.prepare('SELECT * FROM prompt_chains ORDER BY updated_at DESC').all() as Array<
        Record<string, unknown>
      >
    ).map((r) => this.mapPromptChain(r));
  }

  deletePromptChain(name: string): boolean {
    return this.db.prepare('DELETE FROM prompt_chains WHERE name = ?').run(name).changes > 0;
  }

  /* ---- CrawlerTask ---- */

  saveCrawlerTask(task: Omit<CrawlerTask, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO crawler_tasks (url, task_type, status, result, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)
    `);
    const info = stmt.run(
      task.url,
      task.taskType,
      task.status || 'pending',
      task.result || '{}',
      task.metadata || '{}',
    );
    return info.lastInsertRowid as number;
  }

  getCrawlerTasks(
    opts: { status?: string; taskType?: string; limit?: number } = {},
  ): CrawlerTask[] {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (opts.status) {
      clauses.push('status = ?');
      params.push(opts.status);
    }
    if (opts.taskType) {
      clauses.push('task_type = ?');
      params.push(opts.taskType);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = opts.limit ? `LIMIT ${opts.limit}` : '';
    return (
      this.db
        .prepare(`SELECT * FROM crawler_tasks ${where} ORDER BY id DESC ${limit}`)
        .all(...params) as Array<Record<string, unknown>>
    ).map((r) => this.mapCrawlerTask(r));
  }

  /* ---- AuditRecord ---- */

  saveAuditRecord(rec: Omit<AuditRecord, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO audit_records (session_id, agent, step_type, content, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      rec.sessionId,
      rec.agent,
      rec.stepType,
      rec.content,
      rec.metadata || '{}',
      rec.timestamp || new Date().toISOString(),
    );
    return info.lastInsertRowid as number;
  }

  getAuditTrail(sessionId: string, limit?: number): AuditRecord[] {
    const lim = limit ? `LIMIT ${limit}` : '';
    return (
      this.db
        .prepare(`SELECT * FROM audit_records WHERE session_id = ? ORDER BY id ${lim}`)
        .all(sessionId) as Array<Record<string, unknown>>
    ).map((r) => this.mapAuditRecord(r));
  }

  listAuditRecords(opts: {
    sessionId?: string;
    agent?: string;
    stepType?: string;
    q?: string;
    limit?: number;
    offset?: number;
  } = {}): { total: number; records: AuditRecord[] } {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (opts.sessionId?.trim()) {
      clauses.push('session_id = ?');
      params.push(opts.sessionId.trim());
    }
    if (opts.agent?.trim()) {
      clauses.push('agent = ?');
      params.push(opts.agent.trim());
    }
    if (opts.stepType?.trim()) {
      clauses.push('step_type = ?');
      params.push(opts.stepType.trim());
    }
    if (opts.q?.trim()) {
      clauses.push('(content LIKE ? OR metadata LIKE ? OR session_id LIKE ?)');
      const like = `%${opts.q.trim()}%`;
      params.push(like, like, like);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS c FROM audit_records ${where}`).get(...params) as {
        c: number;
      }
    ).c;
    const limit = Math.min(Math.max(opts.limit ?? 80, 1), 500);
    const offset = Math.max(opts.offset ?? 0, 0);
    const records = (
      this.db
        .prepare(
          `SELECT * FROM audit_records ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, limit, offset) as Array<Record<string, unknown>>
    ).map((r) => this.mapAuditRecord(r));
    return { total, records };
  }

  deleteAuditTrail(sessionId?: string): number {
    if (sessionId?.trim()) {
      return this.db.prepare('DELETE FROM audit_records WHERE session_id = ?').run(sessionId.trim())
        .changes;
    }
    return this.db.prepare('DELETE FROM audit_records').run().changes;
  }

  /* ---- ScanResult ---- */

  saveScanResult(sr: Omit<ScanResult, 'id'>): number {
    const stmt = this.db.prepare(`
      INSERT INTO scan_results (target, scan_type, result, vulnerabilities, created_at, metadata)
      VALUES (?, ?, ?, ?, datetime('now'), ?)
    `);
    const info = stmt.run(
      sr.target,
      sr.scanType,
      sr.result || '{}',
      sr.vulnerabilities || '[]',
      sr.metadata || '{}',
    );
    return info.lastInsertRowid as number;
  }

  /* ---- High-level API used by controller ---- */

  stats(): Record<string, unknown> {
    return this.getStats();
  }

  history(query: { agent?: string; limit?: number; sessionId?: string }): {
    conversations: {
      timestamp: string;
      agentType: string;
      userMessage: string;
      assistantMessage: string;
    }[];
  } {
    const convs = this.getConversations({
      agentType: query.agent,
      sessionId: query.sessionId,
      limit: query.limit,
    });
    return {
      conversations: convs.map((c) => ({
        timestamp: c.timestamp,
        agentType: c.agentType,
        userMessage: c.userMessage,
        assistantMessage: c.assistantMessage,
      })),
    };
  }

  clear(query: { agent?: string; sessionId?: string }): {
    success: number;
    deletedCount: number;
    message: string;
  } {
    const deleted = this.deleteConversations({
      agentType: query.agent,
      sessionId: query.sessionId,
    });
    return {
      success: 1,
      deletedCount: deleted,
      message: `已删除 ${deleted} 条对话记录`,
    };
  }

  /* ---- Stats ---- (internal) */

  getStats(): Record<string, unknown> {
    const count = (table: string) =>
      (this.db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c;

    const crawlerByStatus = (
      this.db
        .prepare('SELECT status, COUNT(*) as c FROM crawler_tasks GROUP BY status')
        .all() as Array<{ status: string; c: number }>
    ).reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = r.c;
      return acc;
    }, {});

    return {
      conversations: count('conversations'),
      promptChains: count('prompt_chains'),
      userConfigs: count('user_configs'),
      crawlerTasks: count('crawler_tasks'),
      crawlerTasksByStatus: crawlerByStatus,
    };
  }

  /* ---- Mapping helpers ---- */

  private mapConversation(r: Record<string, unknown>): Conversation {
    return {
      id: r['id'] as number,
      agentType: r['agent_type'] as string,
      userMessage: r['user_message'] as string,
      assistantMessage: r['assistant_message'] as string,
      sessionId: r['session_id'] as string,
      timestamp: r['timestamp'] as string,
      metadata: r['metadata'] as string,
    };
  }

  private mapUserConfig(r: Record<string, unknown>): UserConfig {
    return {
      id: r['id'] as number,
      key: r['key'] as string,
      value: r['value'] as string,
      category: r['category'] as string,
      description: r['description'] as string,
      updatedAt: r['updated_at'] as string,
    };
  }

  /* ---- Workspaces ---- */

  listWorkspaces(): Array<{ id: string; name: string; createdAt: string; updatedAt: string }> {
    const rows = this.db
      .prepare('SELECT * FROM workspaces ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r['id'] ?? ''),
      name: String(r['name'] ?? ''),
      createdAt: String(r['created_at'] ?? ''),
      updatedAt: String(r['updated_at'] ?? ''),
    }));
  }

  getWorkspace(id: string): { id: string; name: string; createdAt: string; updatedAt: string } | null {
    const r = this.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!r) return null;
    return {
      id: String(r['id'] ?? ''),
      name: String(r['name'] ?? ''),
      createdAt: String(r['created_at'] ?? ''),
      updatedAt: String(r['updated_at'] ?? ''),
    };
  }

  upsertWorkspace(id: string, name: string): void {
    this.db
      .prepare(
        `
        INSERT INTO workspaces (id, name, created_at, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, updated_at = datetime('now')
      `,
      )
      .run(id, name);
  }

  renameWorkspace(id: string, name: string): boolean {
    const info = this.db
      .prepare(`UPDATE workspaces SET name = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(name, id);
    return info.changes > 0;
  }

  deleteWorkspace(id: string): boolean {
    this.db.prepare('DELETE FROM workspace_nodes WHERE workspace_id = ?').run(id);
    this.db.prepare('DELETE FROM workspace_sessions WHERE workspace_id = ?').run(id);
    const info = this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
    return info.changes > 0;
  }

  listWorkspaceNodes(workspaceId?: string): Array<{
    id: string;
    workspaceId: string;
    name: string;
    kind: string;
    address: string;
    status: string;
    meta: string;
    createdAt: string;
  }> {
    const rows = (
      workspaceId
        ? this.db.prepare('SELECT * FROM workspace_nodes WHERE workspace_id = ? ORDER BY created_at ASC').all(workspaceId)
        : this.db.prepare('SELECT * FROM workspace_nodes ORDER BY created_at ASC').all()
    ) as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r['id'] ?? ''),
      workspaceId: String(r['workspace_id'] ?? ''),
      name: String(r['name'] ?? ''),
      kind: String(r['kind'] ?? 'secbot'),
      address: String(r['address'] ?? ''),
      status: String(r['status'] ?? 'unknown'),
      meta: String(r['meta'] ?? '{}'),
      createdAt: String(r['created_at'] ?? ''),
    }));
  }

  getWorkspaceNode(id: string): {
    id: string;
    workspaceId: string;
    name: string;
    kind: string;
    address: string;
    status: string;
    meta: string;
    createdAt: string;
  } | null {
    const r = this.db.prepare('SELECT * FROM workspace_nodes WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!r) return null;
    return {
      id: String(r['id'] ?? ''),
      workspaceId: String(r['workspace_id'] ?? ''),
      name: String(r['name'] ?? ''),
      kind: String(r['kind'] ?? 'secbot'),
      address: String(r['address'] ?? ''),
      status: String(r['status'] ?? 'unknown'),
      meta: String(r['meta'] ?? '{}'),
      createdAt: String(r['created_at'] ?? ''),
    };
  }

  upsertWorkspaceNode(node: {
    id: string;
    workspaceId: string;
    name: string;
    kind: string;
    address: string;
    status?: string;
    meta?: string;
  }): void {
    this.db
      .prepare(
        `
        INSERT INTO workspace_nodes (id, workspace_id, name, kind, address, status, meta, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          kind = excluded.kind,
          address = excluded.address,
          status = excluded.status,
          meta = excluded.meta
      `,
      )
      .run(
        node.id,
        node.workspaceId,
        node.name,
        node.kind,
        node.address,
        node.status ?? 'unknown',
        node.meta ?? '{}',
      );
  }

  updateWorkspaceNodeStatus(id: string, status: string, meta?: string): boolean {
    const info = meta
      ? this.db.prepare('UPDATE workspace_nodes SET status = ?, meta = ? WHERE id = ?').run(status, meta, id)
      : this.db.prepare('UPDATE workspace_nodes SET status = ? WHERE id = ?').run(status, id);
    return info.changes > 0;
  }

  deleteWorkspaceNode(id: string): boolean {
    const info = this.db.prepare('DELETE FROM workspace_nodes WHERE id = ?').run(id);
    return info.changes > 0;
  }

  bindWorkspaceSession(workspaceId: string, sessionId: string, nodeId?: string | null): void {
    this.db
      .prepare(
        `
        INSERT INTO workspace_sessions (session_id, workspace_id, node_id, updated_at)
        VALUES (?, ?, ?, datetime('now'))
        ON CONFLICT(session_id) DO UPDATE SET
          workspace_id = excluded.workspace_id,
          node_id = excluded.node_id,
          updated_at = datetime('now')
      `,
      )
      .run(sessionId, workspaceId, nodeId ?? null);
  }

  getWorkspaceSession(sessionId: string): { sessionId: string; workspaceId: string; nodeId: string | null } | null {
    const row = this.db
      .prepare('SELECT * FROM workspace_sessions WHERE session_id = ?')
      .get(sessionId) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      sessionId: String(row['session_id'] ?? ''),
      workspaceId: String(row['workspace_id'] ?? ''),
      nodeId: row['node_id'] == null ? null : String(row['node_id']),
    };
  }

  unbindWorkspaceSession(sessionId: string): void {
    this.db.prepare('DELETE FROM workspace_sessions WHERE session_id = ?').run(sessionId);
  }

  listWorkspaceSessionIds(workspaceId: string): string[] {
    const rows = this.db
      .prepare('SELECT session_id FROM workspace_sessions WHERE workspace_id = ?')
      .all(workspaceId) as Array<Record<string, unknown>>;
    return rows.map((r) => String(r['session_id'] ?? '')).filter(Boolean);
  }

  listAllWorkspaceSessions(): Array<{ sessionId: string; workspaceId: string; nodeId: string | null }> {
    const rows = this.db.prepare('SELECT * FROM workspace_sessions').all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      sessionId: String(r['session_id'] ?? ''),
      workspaceId: String(r['workspace_id'] ?? ''),
      nodeId: r['node_id'] == null ? null : String(r['node_id']),
    }));
  }

  reassignWorkspaceSessions(fromId: string, toId: string): void {
    this.db
      .prepare(
        `UPDATE workspace_sessions SET workspace_id = ?, updated_at = datetime('now') WHERE workspace_id = ?`,
      )
      .run(toId, fromId);
  }

  private mapPromptChain(r: Record<string, unknown>): PromptChain {
    return {
      id: r['id'] as number,
      name: r['name'] as string,
      content: r['content'] as string,
      description: r['description'] as string,
      createdAt: r['created_at'] as string,
      updatedAt: r['updated_at'] as string,
      metadata: r['metadata'] as string,
    };
  }

  private mapCrawlerTask(r: Record<string, unknown>): CrawlerTask {
    return {
      id: r['id'] as number,
      url: r['url'] as string,
      taskType: r['task_type'] as string,
      status: r['status'] as string,
      result: r['result'] as string,
      createdAt: r['created_at'] as string,
      updatedAt: r['updated_at'] as string,
      metadata: r['metadata'] as string,
    };
  }

  private mapAuditRecord(r: Record<string, unknown>): AuditRecord {
    return {
      id: r['id'] as number,
      sessionId: r['session_id'] as string,
      agent: r['agent'] as string,
      stepType: r['step_type'] as string,
      content: r['content'] as string,
      metadata: r['metadata'] as string,
      timestamp: r['timestamp'] as string,
    };
  }
}
