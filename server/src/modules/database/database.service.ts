import { Injectable, OnModuleInit } from '@nestjs/common';
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

@Injectable()
export class DatabaseService implements OnModuleInit {
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

  deleteAuditTrail(sessionId: string): number {
    return this.db.prepare('DELETE FROM audit_records WHERE session_id = ?').run(sessionId).changes;
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
