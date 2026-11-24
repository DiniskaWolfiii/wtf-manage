import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '@/lib/db';
import { ensureSettingsTable } from '@/lib/settings';
import {
  ALL_PERMISSIONS,
  DEFAULT_PERMISSION_MAPPINGS,
  LEGACY_PERMISSION_MIGRATION,
  isValidPermission,
  normalizeGroupIdentifier,
  type PermissionMappings,
  type PortalPermission,
} from '@/lib/permission-types';

const PERMISSION_SETTING_KEY = 'permissionMappings';
const CREW_GROUP_SETTING_KEY = 'crewGroup';
const CACHE_TTL_MS = 30 * 1000;

interface SettingRow extends RowDataPacket {
  setting_value: unknown;
}

const globalForPermissions = globalThis as unknown as {
  permissionMappingsCache?: {
    value: PermissionMappings;
    expiresAt: number;
  };
  crewGroupCache?: {
    value: string | null;
    expiresAt: number;
  };
  warnedMissingAdminGroup?: boolean;
};

/**
 * Returns the configured super-admin Keycloak group identifier from `ADMIN_GROUP`.
 * Returns `null` (fail-closed) when unset, without any hardcoded group fallback.
 */
export function getConfiguredAdminGroup(): string | null {
  const raw = process.env.ADMIN_GROUP?.trim();
  if (!raw) {
    if (!globalForPermissions.warnedMissingAdminGroup) {
      globalForPermissions.warnedMissingAdminGroup = true;
      console.warn('[Auth] ADMIN_GROUP is not configured; super-admin group fallback is disabled.');
    }
    return null;
  }
  const normalized = normalizeGroupIdentifier(raw);
  return normalized.length > 0 ? normalized : null;
}

function createEmptyMappings(): PermissionMappings {
  return {
    'crew.dashboard.view': [],
    'fr.crew.view': [],
    'fr.crew.manage': [],
    'fr.departments.view': [],
    'fr.departments.manage': [],
    'fr.skills.view': [],
    'fr.skills.manage': [],
    'logs.fr.view': [],
    'logs.admin.view': [],
    'logs.all.view': [],
    'admin.portal.manage': [],
  };
}

function sanitizeGroupList(list: unknown): string[] {
  if (!Array.isArray(list)) {
    return [];
  }
  return Array.from(
    new Set(
      list
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeGroupIdentifier)
        .filter((item) => item.length > 0 && item.length <= 255)
    )
  );
}

function sanitizeMappings(raw: unknown): PermissionMappings {
  const result = createEmptyMappings();

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }

  const obj = raw as Record<string, unknown>;

  // First migrate any legacy permission keys if the new key is not explicitly present yet
  for (const [legacyKey, targetKey] of Object.entries(LEGACY_PERMISSION_MIGRATION)) {
    if (Object.hasOwn(obj, legacyKey) && !Object.hasOwn(obj, targetKey)) {
      result[targetKey] = sanitizeGroupList(obj[legacyKey]);
    }
  }

  // Apply current schema keys
  for (const key of ALL_PERMISSIONS) {
    if (!Object.hasOwn(obj, key)) {
      continue;
    }
    result[key] = sanitizeGroupList(obj[key]);
  }

  return result;
}

function parseSettingJson(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

/**
 * Invalidates the in-memory permission mappings and crew group caches immediately.
 */
export function invalidatePermissionMappingsCache(): void {
  globalForPermissions.permissionMappingsCache = undefined;
  globalForPermissions.crewGroupCache = undefined;
}

/**
 * Loads permission-to-group mappings from MySQL (with 30s in-memory cache).
 * Automatically migrates legacy keys and falls back to empty mappings on DB errors.
 */
export async function getPermissionMappings(): Promise<PermissionMappings> {
  const now = Date.now();
  const cached = globalForPermissions.permissionMappingsCache;
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    await ensureSettingsTable();
    const pool = getPool();

    await pool.execute(
      'INSERT IGNORE INTO portal_settings (setting_key, setting_value) VALUES (?, ?)',
      [PERMISSION_SETTING_KEY, JSON.stringify(DEFAULT_PERMISSION_MAPPINGS)]
    );

    const [rows] = await pool.query<SettingRow[]>(
      'SELECT setting_value FROM portal_settings WHERE setting_key = ? LIMIT 1',
      [PERMISSION_SETTING_KEY]
    );

    const parsed = rows.length > 0 ? parseSettingJson(rows[0].setting_value) : null;
    const mappings = sanitizeMappings(parsed);

    globalForPermissions.permissionMappingsCache = {
      value: mappings,
      expiresAt: now + CACHE_TTL_MS,
    };

    return mappings;
  } catch (err) {
    console.error('[DB] Failed to load permission mappings:', (err as Error).message);
    return createEmptyMappings();
  }
}

/**
 * Persists validated permission-to-group mappings to MySQL and invalidates cache.
 */
export async function updatePermissionMappings(
  input: Record<string, unknown>
): Promise<PermissionMappings> {
  const current = await getPermissionMappings();
  const next: PermissionMappings = { ...current };

  for (const [key, value] of Object.entries(input)) {
    if (!isValidPermission(key) || !Array.isArray(value)) {
      continue;
    }
    next[key] = sanitizeGroupList(value);
  }

  await ensureSettingsTable();
  const pool = getPool();
  await pool.execute(
    `INSERT INTO portal_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [PERMISSION_SETTING_KEY, JSON.stringify(next)]
  );

  invalidatePermissionMappingsCache();
  return getPermissionMappings();
}

/**
 * Loads the configured Keycloak group used for crew onboarding/offboarding.
 * Returns `null` if not configured yet.
 */
export async function getCrewOnboardingGroup(): Promise<string | null> {
  const now = Date.now();
  const cached = globalForPermissions.crewGroupCache;
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    await ensureSettingsTable();
    const pool = getPool();
    const [rows] = await pool.query<SettingRow[]>(
      'SELECT setting_value FROM portal_settings WHERE setting_key = ? LIMIT 1',
      [CREW_GROUP_SETTING_KEY]
    );

    let group: string | null = null;
    if (rows.length > 0) {
      const parsed = parseSettingJson(rows[0].setting_value);
      if (typeof parsed === 'string') {
        const normalized = normalizeGroupIdentifier(parsed);
        group = normalized.length > 0 ? normalized : null;
      }
    }

    globalForPermissions.crewGroupCache = {
      value: group,
      expiresAt: now + CACHE_TTL_MS,
    };

    return group;
  } catch (err) {
    console.error('[DB] Failed to load crew onboarding group:', (err as Error).message);
    return null;
  }
}

/**
 * Persists the Keycloak group used for crew onboarding/offboarding and invalidates cache.
 */
export async function updateCrewOnboardingGroup(group: string | null): Promise<string | null> {
  const normalized = group ? normalizeGroupIdentifier(group) : '';
  const value = normalized.length > 0 && normalized.length <= 255 ? normalized : null;

  await ensureSettingsTable();
  const pool = getPool();
  await pool.execute(
    `INSERT INTO portal_settings (setting_key, setting_value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
    [CREW_GROUP_SETTING_KEY, JSON.stringify(value)]
  );

  invalidatePermissionMappingsCache();
  return getCrewOnboardingGroup();
}

/**
 * Computes the effective portal permissions for a user based on their Keycloak groups.
 * The configured `ADMIN_GROUP` always receives all permissions to prevent lockouts.
 */
export async function resolveUserPermissions(userGroups: string[]): Promise<PortalPermission[]> {
  const normalizedUserGroups = new Set(
    userGroups.map(normalizeGroupIdentifier).filter((g) => g.length > 0)
  );

  const adminGroup = getConfiguredAdminGroup();
  if (adminGroup && normalizedUserGroups.has(adminGroup)) {
    return [...ALL_PERMISSIONS];
  }

  const mappings = await getPermissionMappings();
  const granted: PortalPermission[] = [];

  for (const permission of ALL_PERMISSIONS) {
    const allowedGroups = mappings[permission] || [];
    if (allowedGroups.some((group) => normalizedUserGroups.has(normalizeGroupIdentifier(group)))) {
      granted.push(permission);
    }
  }

  return granted;
}
