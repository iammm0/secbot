import type { AuditRecord } from '../database/entities/index.js';

export type ActionAuditWriter = (rec: Omit<AuditRecord, 'id'>) => void;

let writer: ActionAuditWriter | null = null;

/** Wire from DatabaseService on module init so tool wrappers can persist without Nest DI. */
export function setActionAuditWriter(next: ActionAuditWriter | null): void {
  writer = next;
}

export function recordActionAudit(rec: Omit<AuditRecord, 'id'>): void {
  if (!writer) return;
  try {
    writer(rec);
  } catch {
    /* never break the main request path for audit I/O */
  }
}

export function summarizeForAudit(value: unknown, max = 400): unknown {
  if (typeof value === 'string') {
    return value.length > max ? `${value.slice(0, max)}…` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return value;
  }
  try {
    const raw = JSON.stringify(value);
    if (raw.length <= max) return JSON.parse(raw);
    return `${raw.slice(0, max)}…`;
  } catch {
    return String(value);
  }
}
