import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ensureDatabaseExists, getPool } from '@/lib/db';
import type { MinimalKeycloakUser, UserProfileData } from '@/lib/keycloak';
import { getSafeAvatarUrl } from '@/lib/validation';

export type CrewStatus = 'active' | 'on_leave' | 'offboarded';

export type CrewLifecycleEventType =
  | 'joined'
  | 'rejoined'
  | 'on_leave'
  | 'returned'
  | 'offboarded'
  | 'roles_updated'
  | 'note';

export interface CrewProfile {
  userId: string;
  status: CrewStatus;
  joinedAt: string | null;
  offboardedAt: string | null;
  offboardReason: string | null;
  username: string;
  firstName: string;
  lastName: string;
  nickname: string;
  email: string;
  avatarUrl?: string;
  telegram: string;
  pronouns: string;
  species: string;
  phone: string;
  lastSyncedAt: string | null;
  internalNotes: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrewLifecycleEvent {
  id: number;
  userId: string;
  eventType: CrewLifecycleEventType | string;
  effectiveAt: string;
  actorUserId: string | null;
  actorUsername: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface CrewProfileRow extends RowDataPacket {
  user_id: string;
  status: CrewStatus;
  joined_at: Date | string | null;
  offboarded_at: Date | string | null;
  offboard_reason: string | null;
  username: string;
  first_name: string;
  last_name: string;
  nickname: string;
  email: string;
  avatar_url: string | null;
  telegram: string;
  pronouns: string;
  species: string;
  phone: string;
  last_synced_at: Date | string | null;
  internal_notes: string | null;
  updated_by: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CrewLifecycleEventRow extends RowDataPacket {
  id: number;
  user_id: string;
  event_type: string;
  effective_at: Date | string;
  actor_user_id: string | null;
  actor_username: string | null;
  note: string | null;
  metadata: unknown;
  created_at: Date | string;
}

interface FirstPromoteRow extends RowDataPacket {
  first_joined: Date | string | null;
}

const globalForCrewProfiles = globalThis as unknown as {
  crewProfileTablesReady?: Promise<void>;
};

function toIsoString(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val.toISOString();
  }
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? String(val) : d.toISOString();
}

function toMysqlDatetime(val: string | Date | null | undefined): string | null {
  if (!val) return null;
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

function mapCrewProfileRow(row: CrewProfileRow): CrewProfile {
  return {
    userId: row.user_id,
    status: row.status,
    joinedAt: toIsoString(row.joined_at),
    offboardedAt: toIsoString(row.offboarded_at),
    offboardReason: row.offboard_reason ?? null,
    username: row.username,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    nickname: row.nickname ?? '',
    email: row.email ?? '',
    avatarUrl: getSafeAvatarUrl(row.avatar_url ?? undefined) ?? undefined,
    telegram: row.telegram ?? '',
    pronouns: row.pronouns ?? '',
    species: row.species ?? '',
    phone: row.phone ?? '',
    lastSyncedAt: toIsoString(row.last_synced_at),
    internalNotes: row.internal_notes ?? '',
    updatedBy: row.updated_by ?? null,
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) ?? new Date().toISOString(),
  };
}

function mapLifecycleEventRow(row: CrewLifecycleEventRow): CrewLifecycleEvent {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    effectiveAt: toIsoString(row.effective_at) ?? new Date().toISOString(),
    actorUserId: row.actor_user_id ?? null,
    actorUsername: row.actor_username ?? null,
    note: row.note ?? null,
    metadata: parseMetadata(row.metadata),
    createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  };
}

/**
 * Ensures `crew_profiles` and `crew_lifecycle_events` tables exist in `wtf_manage`.
 */
export async function ensureCrewProfileTables(): Promise<void> {
  if (!globalForCrewProfiles.crewProfileTablesReady) {
    globalForCrewProfiles.crewProfileTablesReady = (async () => {
      try {
        await ensureDatabaseExists();
      } catch (err) {
        console.warn('[DB] ensureDatabaseExists skipped or failed:', (err as Error).message);
      }

      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS crew_profiles (
          user_id VARCHAR(64) PRIMARY KEY,
          status ENUM('active', 'on_leave', 'offboarded') NOT NULL DEFAULT 'active',
          joined_at DATETIME NULL,
          offboarded_at DATETIME NULL,
          offboard_reason VARCHAR(255) NULL,
          username VARCHAR(120) NOT NULL,
          first_name VARCHAR(120) NOT NULL DEFAULT '',
          last_name VARCHAR(120) NOT NULL DEFAULT '',
          nickname VARCHAR(120) NOT NULL DEFAULT '',
          email VARCHAR(190) NOT NULL DEFAULT '',
          avatar_url VARCHAR(512) NULL,
          telegram VARCHAR(120) NOT NULL DEFAULT '',
          pronouns VARCHAR(60) NOT NULL DEFAULT '',
          species VARCHAR(80) NOT NULL DEFAULT '',
          phone VARCHAR(60) NOT NULL DEFAULT '',
          last_synced_at DATETIME NULL,
          internal_notes TEXT NULL,
          updated_by VARCHAR(64) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_crew_profiles_status (status),
          INDEX idx_crew_profiles_username (username)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS crew_lifecycle_events (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          event_type VARCHAR(40) NOT NULL,
          effective_at DATETIME NOT NULL,
          actor_user_id VARCHAR(64) NULL,
          actor_username VARCHAR(120) NULL,
          note VARCHAR(255) NULL,
          metadata JSON NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_lifecycle_user_effective (user_id, effective_at),
          CONSTRAINT fk_lifecycle_profile
            FOREIGN KEY (user_id) REFERENCES crew_profiles(user_id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((err) => {
      globalForCrewProfiles.crewProfileTablesReady = undefined;
      throw err;
    });
  }
  return globalForCrewProfiles.crewProfileTablesReady;
}

export async function getCrewProfile(userId: string): Promise<CrewProfile | null> {
  await ensureCrewProfileTables();
  const pool = getPool();
  const [rows] = await pool.execute<CrewProfileRow[]>(
    'SELECT * FROM crew_profiles WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] ? mapCrewProfileRow(rows[0]) : null;
}

export async function listCrewProfiles(): Promise<CrewProfile[]> {
  await ensureCrewProfileTables();
  const pool = getPool();
  const [rows] = await pool.query<CrewProfileRow[]>(
    'SELECT * FROM crew_profiles ORDER BY username ASC'
  );
  return rows.map(mapCrewProfileRow);
}

export async function getCrewProfileMap(): Promise<Map<string, CrewProfile>> {
  const all = await listCrewProfiles();
  return new Map(all.map((p) => [p.userId, p]));
}

export async function listCrewLifecycleEvents(userId: string): Promise<CrewLifecycleEvent[]> {
  await ensureCrewProfileTables();
  const pool = getPool();
  const [rows] = await pool.execute<CrewLifecycleEventRow[]>(
    `SELECT * FROM crew_lifecycle_events
     WHERE user_id = ?
     ORDER BY effective_at DESC, id DESC`,
    [userId]
  );
  return rows.map(mapLifecycleEventRow);
}

export async function addCrewLifecycleEvent(input: {
  userId: string;
  eventType: CrewLifecycleEventType | string;
  effectiveAt?: string | Date | null;
  actorUserId?: string | null;
  actorUsername?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await ensureCrewProfileTables();
  const pool = getPool();
  const effectiveMysql = toMysqlDatetime(input.effectiveAt) ?? toMysqlDatetime(new Date())!;
  const note = input.note ? input.note.trim().slice(0, 255) : null;
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  await pool.execute<ResultSetHeader>(
    `INSERT INTO crew_lifecycle_events
       (user_id, event_type, effective_at, actor_user_id, actor_username, note, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.eventType.slice(0, 40),
      effectiveMysql,
      input.actorUserId ?? null,
      input.actorUsername ?? null,
      note,
      metadataJson,
    ]
  );
}

/**
 * Upserts a Crew Profile when a user is promoted to `wtf-crew` (or re-onboarded).
 */
export async function upsertCrewProfileOnPromote(
  profile: UserProfileData,
  actor: { userId: string; username: string }
): Promise<{ profile: CrewProfile; isRejoin: boolean }> {
  await ensureCrewProfileTables();
  const pool = getPool();
  const existing = await getCrewProfile(profile.id);
  const nowMysql = toMysqlDatetime(new Date())!;
  const safeAvatar = getSafeAvatarUrl(profile.avatarUrl) ?? null;

  if (!existing) {
    await pool.execute<ResultSetHeader>(
      `INSERT INTO crew_profiles
         (user_id, status, joined_at, offboarded_at, offboard_reason,
          username, first_name, last_name, nickname, email, avatar_url,
          telegram, pronouns, species, phone, last_synced_at, updated_by)
       VALUES (?, 'active', ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.id,
        nowMysql,
        profile.username,
        profile.firstName || '',
        profile.lastName || '',
        profile.nickname || '',
        profile.email || '',
        safeAvatar,
        profile.telegram || '',
        profile.pronouns || '',
        profile.species || '',
        profile.phone || '',
        nowMysql,
        actor.userId,
      ]
    );

    await addCrewLifecycleEvent({
      userId: profile.id,
      eventType: 'joined',
      effectiveAt: nowMysql,
      actorUserId: actor.userId,
      actorUsername: actor.username,
      note: 'Onboarded to Crew (wtf-crew)',
    });

    const created = await getCrewProfile(profile.id);
    return { profile: created!, isRejoin: false };
  }

  const wasOffboarded = existing.status === 'offboarded';
  const wasOnLeave = existing.status === 'on_leave';
  const joinedAtMysql = toMysqlDatetime(existing.joinedAt) ?? nowMysql;

  await pool.execute<ResultSetHeader>(
    `UPDATE crew_profiles
     SET status = 'active',
         joined_at = ?,
         offboarded_at = NULL,
         offboard_reason = NULL,
         username = ?,
         first_name = ?,
         last_name = ?,
         nickname = ?,
         email = ?,
         avatar_url = ?,
         telegram = ?,
         pronouns = ?,
         species = ?,
         phone = ?,
         last_synced_at = ?,
         updated_by = ?
     WHERE user_id = ?`,
    [
      joinedAtMysql,
      profile.username,
      profile.firstName || '',
      profile.lastName || '',
      profile.nickname || '',
      profile.email || '',
      safeAvatar,
      profile.telegram || '',
      profile.pronouns || '',
      profile.species || '',
      profile.phone || '',
      nowMysql,
      actor.userId,
      profile.id,
    ]
  );

  if (wasOffboarded) {
    await addCrewLifecycleEvent({
      userId: profile.id,
      eventType: 'rejoined',
      effectiveAt: nowMysql,
      actorUserId: actor.userId,
      actorUsername: actor.username,
      note: 'Re-onboarded to Crew (wtf-crew)',
    });
  } else if (wasOnLeave) {
    await addCrewLifecycleEvent({
      userId: profile.id,
      eventType: 'returned',
      effectiveAt: nowMysql,
      actorUserId: actor.userId,
      actorUsername: actor.username,
      note: 'Returned to active Crew',
    });
  }

  const updated = await getCrewProfile(profile.id);
  return { profile: updated!, isRejoin: wasOffboarded };
}

/**
 * Marks a Crew Profile as `offboarded` (Alumni) without deleting historical data.
 */
export async function markCrewProfileOffboarded(
  userId: string,
  options: {
    reason?: string | null;
    actorUserId?: string | null;
    actorUsername?: string | null;
    metadata?: Record<string, unknown> | null;
    fallbackProfile?: Partial<UserProfileData> | null;
  }
): Promise<void> {
  await ensureCrewProfileTables();
  const pool = getPool();
  const nowMysql = toMysqlDatetime(new Date())!;
  const existing = await getCrewProfile(userId);
  const reason = options.reason?.trim() ? options.reason.trim().slice(0, 255) : null;

  if (!existing) {
    const fb = options.fallbackProfile;
    await pool.execute<ResultSetHeader>(
      `INSERT INTO crew_profiles
         (user_id, status, joined_at, offboarded_at, offboard_reason,
          username, first_name, last_name, nickname, email, avatar_url,
          telegram, pronouns, species, phone, last_synced_at, updated_by)
       VALUES (?, 'offboarded', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        nowMysql,
        reason,
        fb?.username || userId,
        fb?.firstName || '',
        fb?.lastName || '',
        fb?.nickname || '',
        fb?.email || '',
        getSafeAvatarUrl(fb?.avatarUrl) ?? null,
        fb?.telegram || '',
        fb?.pronouns || '',
        fb?.species || '',
        fb?.phone || '',
        nowMysql,
        options.actorUserId ?? null,
      ]
    );
  } else {
    await pool.execute<ResultSetHeader>(
      `UPDATE crew_profiles
       SET status = 'offboarded',
           offboarded_at = ?,
           offboard_reason = ?,
           updated_by = ?
       WHERE user_id = ?`,
      [nowMysql, reason, options.actorUserId ?? null, userId]
    );
  }

  await addCrewLifecycleEvent({
    userId,
    eventType: 'offboarded',
    effectiveAt: nowMysql,
    actorUserId: options.actorUserId ?? null,
    actorUsername: options.actorUsername ?? null,
    note: reason || 'Removed from Crew (wtf-crew)',
    metadata: options.metadata ?? null,
  });
}

/**
 * Refreshes the Keycloak snapshot on an existing `crew_profiles` row (e.g. on GET detail).
 */
export async function refreshCrewProfileKeycloakSnapshot(
  profile: UserProfileData
): Promise<CrewProfile | null> {
  await ensureCrewProfileTables();
  const pool = getPool();
  const nowMysql = toMysqlDatetime(new Date())!;
  const safeAvatar = getSafeAvatarUrl(profile.avatarUrl) ?? null;

  await pool.execute<ResultSetHeader>(
    `UPDATE crew_profiles
     SET username = ?,
         first_name = ?,
         last_name = ?,
         nickname = ?,
         email = ?,
         avatar_url = ?,
         telegram = ?,
         pronouns = ?,
         species = ?,
         phone = ?,
         last_synced_at = ?
     WHERE user_id = ?`,
    [
      profile.username,
      profile.firstName || '',
      profile.lastName || '',
      profile.nickname || '',
      profile.email || '',
      safeAvatar,
      profile.telegram || '',
      profile.pronouns || '',
      profile.species || '',
      profile.phone || '',
      nowMysql,
      profile.id,
    ]
  );

  return getCrewProfile(profile.id);
}

/**
 * Fail-safe snapshot sync when a user updates their own profile or avatar.
 */
export async function syncKeycloakSnapshotIfExists(
  userId: string,
  patch: Partial<UserProfileData>
): Promise<void> {
  try {
    const existing = await getCrewProfile(userId);
    if (!existing) return;

    const pool = getPool();
    const nowMysql = toMysqlDatetime(new Date())!;
    const safeAvatar =
      patch.avatarUrl !== undefined
        ? getSafeAvatarUrl(patch.avatarUrl) ?? null
        : existing.avatarUrl ?? null;

    await pool.execute<ResultSetHeader>(
      `UPDATE crew_profiles
       SET first_name = ?,
           last_name = ?,
           nickname = ?,
           email = ?,
           avatar_url = ?,
           telegram = ?,
           pronouns = ?,
           species = ?,
           phone = ?,
           last_synced_at = ?
       WHERE user_id = ?`,
      [
        patch.firstName ?? existing.firstName,
        patch.lastName ?? existing.lastName,
        patch.nickname ?? existing.nickname,
        patch.email ?? existing.email,
        safeAvatar,
        patch.telegram ?? existing.telegram,
        patch.pronouns ?? existing.pronouns,
        patch.species ?? existing.species,
        patch.phone ?? existing.phone,
        nowMysql,
        userId,
      ]
    );
  } catch (err) {
    console.warn('[CrewProfiles] syncKeycloakSnapshotIfExists failed:', (err as Error).message);
  }
}

export interface UpdateCrewMasterDataInput {
  status?: CrewStatus;
  joinedAt?: string | null;
  offboardedAt?: string | null;
  offboardReason?: string | null;
  internalNotes?: string;
  effectiveAt?: string | null;
  eventNote?: string | null;
}

/**
 * Updates FR-managed master data fields on `crew_profiles` and logs status transitions.
 */
export async function updateCrewMasterData(
  userId: string,
  input: UpdateCrewMasterDataInput,
  actor: { userId: string; username: string }
): Promise<CrewProfile | null> {
  await ensureCrewProfileTables();
  const existing = await getCrewProfile(userId);
  if (!existing) return null;

  const pool = getPool();
  const nextStatus = input.status ?? existing.status;
  const nextJoinedAt =
    input.joinedAt !== undefined ? toMysqlDatetime(input.joinedAt) : toMysqlDatetime(existing.joinedAt);

  let nextOffboardedAt =
    input.offboardedAt !== undefined
      ? toMysqlDatetime(input.offboardedAt)
      : toMysqlDatetime(existing.offboardedAt);

  if (nextStatus !== 'offboarded' && input.offboardedAt === undefined) {
    nextOffboardedAt = null;
  } else if (nextStatus === 'offboarded' && !nextOffboardedAt) {
    nextOffboardedAt = toMysqlDatetime(input.effectiveAt ?? new Date());
  }

  const nextReason =
    input.offboardReason !== undefined
      ? input.offboardReason?.trim() || null
      : existing.offboardReason;
  const nextNotes =
    input.internalNotes !== undefined ? input.internalNotes : existing.internalNotes;

  await pool.execute<ResultSetHeader>(
    `UPDATE crew_profiles
     SET status = ?,
         joined_at = ?,
         offboarded_at = ?,
         offboard_reason = ?,
         internal_notes = ?,
         updated_by = ?
     WHERE user_id = ?`,
    [
      nextStatus,
      nextJoinedAt,
      nextOffboardedAt,
      nextReason,
      nextNotes,
      actor.userId,
      userId,
    ]
  );

  if (nextStatus !== existing.status) {
    let eventType: CrewLifecycleEventType = 'note';
    if (nextStatus === 'on_leave') eventType = 'on_leave';
    else if (nextStatus === 'offboarded') eventType = 'offboarded';
    else if (existing.status === 'on_leave') eventType = 'returned';
    else if (existing.status === 'offboarded') eventType = 'rejoined';

    await addCrewLifecycleEvent({
      userId,
      eventType,
      effectiveAt: input.effectiveAt ?? new Date(),
      actorUserId: actor.userId,
      actorUsername: actor.username,
      note: input.eventNote?.trim() || nextReason || `Status changed to ${nextStatus}`,
      metadata: { from: existing.status, to: nextStatus },
    });
  }

  return getCrewProfile(userId);
}

/**
 * Backfills or refreshes `crew_profiles` for all active `wtf-crew` members from Keycloak.
 * Uses earliest `crew.promote` entry in `audit_logs` as initial `joined_at` when creating new records.
 */
export async function syncAllActiveCrewProfilesFromKeycloak(
  kcUsers: MinimalKeycloakUser[],
  crewMemberIds: Set<string>,
  actor: { userId: string; username: string }
): Promise<{ created: number; updated: number }> {
  await ensureCrewProfileTables();
  const pool = getPool();
  const existingMap = await getCrewProfileMap();
  const nowMysql = toMysqlDatetime(new Date())!;

  let created = 0;
  let updated = 0;

  for (const kcUser of kcUsers) {
    if (!crewMemberIds.has(kcUser.id)) continue;

    const safeAvatar = getSafeAvatarUrl(kcUser.avatarUrl) ?? null;
    const existing = existingMap.get(kcUser.id);

    if (!existing) {
      let initialJoinedMysql = nowMysql;
      try {
        const [auditRows] = await pool.execute<FirstPromoteRow[]>(
          `SELECT MIN(created_at) AS first_joined
           FROM audit_logs
           WHERE target_id = ? AND action = 'crew.promote'`,
          [kcUser.id]
        );
        const auditDate = toMysqlDatetime(auditRows[0]?.first_joined);
        if (auditDate) {
          initialJoinedMysql = auditDate;
        }
      } catch {
        // audit_logs table might not exist yet; fall back to nowMysql
      }

      await pool.execute<ResultSetHeader>(
        `INSERT INTO crew_profiles
           (user_id, status, joined_at, offboarded_at, username, avatar_url, last_synced_at, updated_by)
         VALUES (?, 'active', ?, NULL, ?, ?, ?, ?)`,
        [kcUser.id, initialJoinedMysql, kcUser.username, safeAvatar, nowMysql, actor.userId]
      );

      await addCrewLifecycleEvent({
        userId: kcUser.id,
        eventType: 'joined',
        effectiveAt: initialJoinedMysql,
        actorUserId: actor.userId,
        actorUsername: actor.username,
        note: 'Synced from Keycloak (wtf-crew)',
      });
      created++;
    } else {
      await pool.execute<ResultSetHeader>(
        `UPDATE crew_profiles
         SET username = ?,
             avatar_url = ?,
             last_synced_at = ?
         WHERE user_id = ?`,
        [kcUser.username, safeAvatar, nowMysql, kcUser.id]
      );
      updated++;
    }
  }

  return { created, updated };
}
