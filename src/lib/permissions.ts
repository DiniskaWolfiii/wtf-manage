import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '@/lib/db';
import { ensureSettingsTable } from '@/lib/settings';
import {
  ALL_PERMISSIONS,
  DEFAULT_PERMISSION_MAPPINGS,
  isValidPermission,
  normalizeGroupIdentifier,
  type PermissionMappings,
  type PortalPermission,
} from '@/lib/permission-types';

const PERMISSION_SETTING_KEY = 'permissionMappings';
const CACHE_TTL_MS = 30 * 1000;

interface SettingRow extends RowDataPacket {
  setting_value: unknown;
}

const globalForPermissions = globalThis as unknown as {
  permissionMappingsCache?: {
    value: PermissionMappings;
    expiresAt: number;
  };
};

/**
 * Returns the configured super-admin Keycloak group identifier from `ADMIN_GROUP`.
 * Falls back to `winterfur-admin` when unset.
 */
export function getConfiguredAdminGroup(): string {
  const raw = process.env.ADMIN_GROUP?.trim();
  return raw && raw.length > 0 ? normalizeGroupIdentifier(raw) : 'winterfur-admin';
}

function sanitizeMappings(raw: unknown): PermissionMappings {
  const result: PermissionMappings = {
    'crew.view': [...DEFAULT_PERMISSION_MAPPINGS['crew.view']],
    'fr.read': [...DEFAULT_PERMISSION_MAPPINGS['fr.read']],
    'fr.write': [...DEFAULT_PERMISSION_MAPPINGS['fr.write']],
    'logs.view_fr': [...DEFAULT_PERMISSION_MAPPINGS['logs.view_fr']],
    'logs.view_admin': [...DEFAULT_PERMISSION_MAPPINGS['logs.view_admin']],
    'logs.view_all': [...DEFAULT_PERMISSION_MAPPINGS['logs.view_all']],
    'admin.manage': [...DEFAULT_PERMISSION_MAPPINGS['admin.manage']],
  };

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }

  const obj = raw as Record<string, unknown>;
  for (const key of ALL_PERMISSIONS) {
    if (!Object.hasOwn(obj, key)) {
      continue;
    }
    const list = obj[key];
    if (!Array.isArray(list)) {
      continue;
    }
    const cleaned = Array.from(
      new Set(
        list
          .filter((item): item is string => typeof item === 'string')
          .map(normalizeGroupIdentifier)
          .filter((item) => item.length > 0 && item.length <= 255)
      )
    );
    result[key] = cleaned;
  }

  return result;
}

function parseSettingJson(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

/**
 * Invalidates the in-memory permission mappings cache immediately.
 */
export function invalidatePermissionMappingsCache(): void {
  globalForPermissions.permissionMappingsCache = undefined;
}

/**
 * Loads permission-to-group mappings from MySQL (with 30s in-memory cache).
 * Seeds default mappings on first access and falls back to defaults on DB errors.
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
    return sanitizeMappings(DEFAULT_PERMISSION_MAPPINGS);
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
    next[key] = Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .map(normalizeGroupIdentifier)
          .filter((item) => item.length > 0 && item.length <= 255)
      )
    );
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
