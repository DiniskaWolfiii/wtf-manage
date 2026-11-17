import type { RowDataPacket } from 'mysql2/promise';
import { ensureDatabaseExists, getPool } from '@/lib/db';
import {
  DEFAULT_PORTAL_SETTINGS,
  type IdentityDisplayConfig,
  type PortalSettings,
  type QuickLink,
} from '@/lib/portal-config';
import { getSafeExternalUrl } from '@/lib/validation';

interface SettingRow extends RowDataPacket {
  setting_key: string;
  setting_value: unknown;
}

const globalForSettings = globalThis as unknown as {
  settingsTableReady?: Promise<void>;
};

function parseJsonValue<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) {
    return fallback;
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

/**
 * Creates the `portal_settings` table if missing and seeds default values.
 */
export async function ensureSettingsTable(): Promise<void> {
  if (!globalForSettings.settingsTableReady) {
    globalForSettings.settingsTableReady = (async () => {
      try {
        await ensureDatabaseExists();
      } catch (err) {
        // Non-fatal if DB user lacks CREATE DATABASE privilege but target DB already exists
        console.warn('[DB] ensureDatabaseExists skipped or failed:', (err as Error).message);
      }

      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS portal_settings (
          setting_key VARCHAR(64) PRIMARY KEY,
          setting_value JSON NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await pool.execute(
        'INSERT IGNORE INTO portal_settings (setting_key, setting_value) VALUES (?, ?)',
        ['conventionName', JSON.stringify(DEFAULT_PORTAL_SETTINGS.conventionName)]
      );

      await pool.execute(
        'INSERT IGNORE INTO portal_settings (setting_key, setting_value) VALUES (?, ?)',
        ['quickLinks', JSON.stringify(DEFAULT_PORTAL_SETTINGS.quickLinks)]
      );
    })().catch((err) => {
      globalForSettings.settingsTableReady = undefined;
      throw err;
    });
  }

  return globalForSettings.settingsTableReady;
}

/**
 * Loads portal settings from MySQL, creating & seeding the table if needed.
 * Falls back to DEFAULT_PORTAL_SETTINGS if MySQL is temporarily unavailable.
 */
export async function getPortalSettings(): Promise<PortalSettings> {
  try {
    await ensureSettingsTable();
    const pool = getPool();
    const [rows] = await pool.query<SettingRow[]>(
      'SELECT setting_key, setting_value FROM portal_settings WHERE setting_key IN (?, ?)',
      ['conventionName', 'quickLinks']
    );

    let conventionName = DEFAULT_PORTAL_SETTINGS.conventionName;
    let quickLinks = DEFAULT_PORTAL_SETTINGS.quickLinks;

    for (const row of rows) {
      if (row.setting_key === 'conventionName') {
        const parsed = parseJsonValue<unknown>(row.setting_value, conventionName);
        if (typeof parsed === 'string' && parsed.trim()) {
          conventionName = parsed.trim();
        }
      } else if (row.setting_key === 'quickLinks') {
        const parsed = parseJsonValue<unknown>(row.setting_value, quickLinks);
        if (Array.isArray(parsed)) {
          quickLinks = parsed.filter((item): item is QuickLink => {
            if (!item || typeof item !== 'object') return false;
            const candidate = item as Record<string, unknown>;
            return (
              typeof candidate.id === 'number' &&
              typeof candidate.title === 'string' &&
              typeof candidate.url === 'string' &&
              Boolean(getSafeExternalUrl(candidate.url))
            );
          });
        }
      }
    }

    return { conventionName, quickLinks };
  } catch (err) {
    console.error('[DB] Failed to load portal settings:', (err as Error).message);
    return DEFAULT_PORTAL_SETTINGS;
  }
}

/**
 * Persists validated portal settings to MySQL and returns the updated configuration.
 */
export async function updatePortalSettings(partial: Partial<PortalSettings>): Promise<PortalSettings> {
  await ensureSettingsTable();
  const pool = getPool();

  if (partial.conventionName !== undefined) {
    await pool.execute(
      `INSERT INTO portal_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      ['conventionName', JSON.stringify(partial.conventionName)]
    );
  }

  if (partial.quickLinks !== undefined) {
    await pool.execute(
      `INSERT INTO portal_settings (setting_key, setting_value)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      ['quickLinks', JSON.stringify(partial.quickLinks)]
    );
  }

  return getPortalSettings();
}

/**
 * Extracts public-safe Keycloak issuer URL and realm name from KEYCLOAK_ISSUER.
 */
export function getIdentityDisplayConfig(): IdentityDisplayConfig {
  const issuer = process.env.KEYCLOAK_ISSUER || 'https://identity.winterfur.org/realms/winterfur';
  try {
    const url = new URL(issuer);
    const match = url.pathname.match(/\/realms\/([^/]+)/);
    return {
      issuerUrl: url.origin,
      realm: match?.[1] || 'winterfur',
    };
  } catch {
    return {
      issuerUrl: 'https://identity.winterfur.org',
      realm: 'winterfur',
    };
  }
}
