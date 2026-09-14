import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { loadYamlConfig, saveYamlConfig } from '../../config/yaml-config-loader.js';

const DEFAULT_DATABASE_PATH = 'data/opencomsagent.db';

/** Keep handles alive; GC of ephemeral better-sqlite3 Database aborts Node (`env != nullptr`). */
const openHandles = new Map<string, Database.Database>();

function resolveDatabasePath(rootDir = process.cwd()): string {
  const yamlDbPath = (loadYamlConfig(rootDir).flat['database.path'] ?? '').trim();
  const configuredPath =
    (process.env.DATABASE_PATH ?? '').trim() || yamlDbPath || DEFAULT_DATABASE_PATH;
  return path.isAbsolute(configuredPath) ? configuredPath : path.join(rootDir, configuredPath);
}

function sqliteKeyToYamlDotKey(sqliteKey: string): string {
  return sqliteKey.replace(/_/g, '.');
}

function unflattenConfig(flat: Record<string, string>): Record<string, unknown> {
  const nested: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(flat)) {
    const parts = key.split('.');
    let current = nested;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = val;
  }
  return nested;
}

function handleKey(dbPath: string, writable: boolean): string {
  return `${writable ? 'w' : 'r'}:${dbPath}`;
}

function getConfigDb(dbPath: string, writable: boolean): Database.Database | null {
  if (!fs.existsSync(dbPath)) return null;
  const key = handleKey(dbPath, writable);
  const existing = openHandles.get(key);
  if (existing) return existing;
  const db = writable
    ? new Database(dbPath)
    : new Database(dbPath, { readonly: true, fileMustExist: true });
  openHandles.set(key, db);
  return db;
}

export function closePersistedConfigConnections(): void {
  for (const db of openHandles.values()) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }
  openHandles.clear();
}

export function getPersistedConfig(key: string, rootDir = process.cwd()): string | null {
  try {
    const dbPath = resolveDatabasePath(rootDir);
    const db = getConfigDb(dbPath, false);
    if (!db) return null;

    const row = db.prepare('SELECT value FROM user_configs WHERE key = ?').get(key) as
      | { value: string }
      | undefined;

    const value = (row?.value ?? '').trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function deleteYamlConfigKey(key: string, rootDir = process.cwd()): boolean {
  try {
    const dotKey = key.includes('.') ? key : sqliteKeyToYamlDotKey(key);
    const { flat } = loadYamlConfig(rootDir);
    if (!(dotKey in flat)) return false;

    delete flat[dotKey];
    saveYamlConfig(rootDir, unflattenConfig(flat));
    return true;
  } catch {
    return false;
  }
}

export function deletePersistedConfig(key: string, rootDir = process.cwd()): boolean {
  let sqliteDeleted = false;
  try {
    const dbPath = resolveDatabasePath(rootDir);
    const db = getConfigDb(dbPath, true);
    if (db) {
      sqliteDeleted = db.prepare('DELETE FROM user_configs WHERE key = ?').run(key).changes > 0;
    }
  } catch {
    sqliteDeleted = false;
  }

  const yamlDeleted = deleteYamlConfigKey(key, rootDir);
  return sqliteDeleted || yamlDeleted;
}
