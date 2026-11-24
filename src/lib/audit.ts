import type { RowDataPacket } from 'mysql2/promise';
import { ensureDatabaseExists, getPool } from '@/lib/db';

export type AuditCategory = 'fr' | 'admin' | 'profile';

export type AuditAction =
  | 'crew.promote'
  | 'crew.demote'
  | 'crew.roles_updated'
  | 'crew.skills_updated'
  | 'crew.master_data_updated'
  | 'crew.profiles_synced'
  | 'department.created'
  | 'department.updated'
  | 'department.deleted'
  | 'department.order_updated'
  | 'department.keycloak_mapped'
  | 'skill.created'
  | 'skill.updated'
  | 'skill.deleted'
  | 'settings.updated'
  | 'permissions.updated'
  | 'profile.updated'
  | 'profile.avatar_updated'
  | 'profile.passkey_deleted';

export interface RecordAuditLogInput {
  category: AuditCategory;
  action: AuditAction;
  actorUserId?: string | null;
  actorUsername?: string | null;
  targetType?: 'user' | 'department' | 'skill' | 'settings' | 'permissions' | 'credential' | 'session' | null;
  targetId?: string | null;
  targetLabel?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
}

export interface AuditLogEntry {
  id: number;
  category: AuditCategory;
  action: string;
  actorUserId: string | null;
  actorUsername: string | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface QueryAuditLogsParams {
  category?: string;
  action?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
  allowedCategories?: AuditCategory[];
}

interface AuditLogRow extends RowDataPacket {
  id: number;
  category: AuditCategory;
  action: string;
  actor_user_id: string | null;
  actor_username: string | null;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  summary: string;
  metadata: unknown;
  created_at: Date | string;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface ActionRow extends RowDataPacket {
  action: string;
}

const globalForAudit = globalThis as unknown as {
  auditTableReady?: Promise<void>;
};

/**
 * Ensures the `audit_logs` table exists in the `wtf_manage` database.
 */
export async function ensureAuditTable(): Promise<void> {
  if (!globalForAudit.auditTableReady) {
    globalForAudit.auditTableReady = (async () => {
      try {
        await ensureDatabaseExists();
      } catch (err) {
        console.warn('[DB] ensureDatabaseExists skipped or failed:', (err as Error).message);
      }

      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          category VARCHAR(32) NOT NULL,
          action VARCHAR(64) NOT NULL,
          actor_user_id VARCHAR(64) NULL,
          actor_username VARCHAR(120) NULL,
          target_type VARCHAR(32) NULL,
          target_id VARCHAR(64) NULL,
          target_label VARCHAR(160) NULL,
          summary VARCHAR(255) NOT NULL,
          metadata JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_audit_category_created (category, created_at),
          INDEX idx_audit_action (action),
          INDEX idx_audit_actor (actor_user_id),
          INDEX idx_audit_target (target_id),
          INDEX idx_audit_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((err) => {
      globalForAudit.auditTableReady = undefined;
      throw err;
    });
  }
  return globalForAudit.auditTableReady;
}

function parseMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/**
 * Record an audit log entry in MySQL. Fail-safe: logs errors without throwing
 * so audit failures never break user-facing mutations.
 */
export async function recordAuditLog(input: RecordAuditLogInput): Promise<void> {
  try {
    await ensureAuditTable();
    const pool = getPool();
    const summary = input.summary.slice(0, 255);
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    await pool.execute(
      `INSERT INTO audit_logs (
        category, action, actor_user_id, actor_username,
        target_type, target_id, target_label, summary, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.category,
        input.action,
        input.actorUserId ?? null,
        input.actorUsername ? input.actorUsername.slice(0, 120) : null,
        input.targetType ?? null,
        input.targetId ? input.targetId.slice(0, 64) : null,
        input.targetLabel ? input.targetLabel.slice(0, 160) : null,
        summary,
        metadataJson,
      ]
    );
  } catch (err) {
    console.error('[Audit] Failed to record audit log:', (err as Error).message);
  }
}

export async function queryAuditLogs(params: QueryAuditLogsParams): Promise<{
  logs: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  availableActions: string[];
}> {
  await ensureAuditTable();
  const pool = getPool();

  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(params.pageSize ?? 50)));
  const offset = (page - 1) * pageSize;

  const whereClauses: string[] = [];
  const values: Array<string | number> = [];

  if (params.allowedCategories && params.allowedCategories.length > 0) {
    const placeholders = params.allowedCategories.map(() => '?').join(', ');
    whereClauses.push(`category IN (${placeholders})`);
    values.push(...params.allowedCategories);
  }

  if (params.category && params.category !== 'all') {
    whereClauses.push('category = ?');
    values.push(params.category);
  }

  if (params.action && params.action !== 'all') {
    whereClauses.push('action = ?');
    values.push(params.action);
  }

  if (params.q && params.q.trim()) {
    const escapedQ = params.q.trim().slice(0, 120).replace(/[\\%_]/g, '\\$&');
    const pattern = `%${escapedQ}%`;
    whereClauses.push(
      '(actor_username LIKE ? OR target_label LIKE ? OR summary LIKE ? OR action LIKE ?)'
    );
    values.push(pattern, pattern, pattern, pattern);
  }

  if (params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from)) {
    whereClauses.push('created_at >= ?');
    values.push(`${params.from} 00:00:00`);
  }

  if (params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to)) {
    whereClauses.push('created_at <= ?');
    values.push(`${params.to} 23:59:59`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const [countRows] = await pool.execute<CountRow[]>(
    `SELECT COUNT(*) AS total FROM audit_logs ${whereSql}`,
    values
  );
  const total = Number(countRows[0]?.total ?? 0);

  const [rows] = await pool.execute<AuditLogRow[]>(
    `SELECT id, category, action, actor_user_id, actor_username,
            target_type, target_id, target_label, summary, metadata, created_at
     FROM audit_logs
     ${whereSql}
     ORDER BY created_at DESC, id DESC
     LIMIT ? OFFSET ?`,
    [...values, pageSize, offset]
  );

  // Distinct actions scoped to allowedCategories
  const actionWhere =
    params.allowedCategories && params.allowedCategories.length > 0
      ? `WHERE category IN (${params.allowedCategories.map(() => '?').join(', ')})`
      : '';
  const actionValues = params.allowedCategories ?? [];
  const [actionRows] = await pool.execute<ActionRow[]>(
    `SELECT DISTINCT action FROM audit_logs ${actionWhere} ORDER BY action ASC`,
    actionValues
  );

  return {
    logs: rows.map((r) => ({
      id: Number(r.id),
      category: r.category,
      action: r.action,
      actorUserId: r.actor_user_id ?? null,
      actorUsername: r.actor_username ?? null,
      targetType: r.target_type ?? null,
      targetId: r.target_id ?? null,
      targetLabel: r.target_label ?? null,
      summary: r.summary,
      metadata: parseMetadata(r.metadata),
      createdAt:
        r.created_at instanceof Date
          ? r.created_at.toISOString()
          : new Date(r.created_at).toISOString(),
    })),
    total,
    page,
    pageSize,
    availableActions: actionRows.map((a) => a.action),
  };
}
