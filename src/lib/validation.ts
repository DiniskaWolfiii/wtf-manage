import type { UserProfileData } from '@/lib/keycloak';
import type { PortalSettings, QuickLink } from '@/lib/portal-config';

export const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export const MAX_AVATAR_BYTES = 512 * 1024;
export const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_LENGTH = 720_000;
const MAX_URL_LENGTH = 2048;

const SAFE_DATA_IMAGE_REGEX = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/**
 * Validate external HTTP/HTTPS URLs (blocks javascript:, data:, vbscript:, etc.).
 */
export function getSafeExternalUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validate avatar URLs (allows https/http URLs or strict raster base64 data URLs).
 */
export function getSafeAvatarUrl(rawUrl?: string): string | null {
  if (!rawUrl) {
    return null;
  }
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('data:')) {
    if (trimmed.length > MAX_AVATAR_DATA_URL_LENGTH) {
      return null;
    }
    return SAFE_DATA_IMAGE_REGEX.test(trimmed) ? trimmed : null;
  }
  return getSafeExternalUrl(trimmed);
}

const EDITABLE_PROFILE_STRING_FIELDS: Array<{
  key: keyof Omit<UserProfileData, 'id' | 'username' | 'avatarUrl'>;
  maxLength: number;
}> = [
  { key: 'firstName', maxLength: 100 },
  { key: 'lastName', maxLength: 100 },
  { key: 'email', maxLength: 254 },
  { key: 'nickname', maxLength: 100 },
  { key: 'telegram', maxLength: 100 },
  { key: 'species', maxLength: 100 },
  { key: 'pronouns', maxLength: 60 },
  { key: 'phone', maxLength: 40 },
  { key: 'street', maxLength: 160 },
  { key: 'zip', maxLength: 24 },
  { key: 'city', maxLength: 100 },
  { key: 'country', maxLength: 100 },
  { key: 'dob', maxLength: 20 },
];

/**
 * Validate and pick only explicitly allowed editable fields from a PUT /api/profile body.
 * Returns null if the payload is malformed or contains invalid field types/values.
 */
export function sanitizeProfileUpdate(body: unknown): Partial<UserProfileData> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  const input = body as Record<string, unknown>;
  const sanitized: Partial<UserProfileData> = {};

  for (const { key, maxLength } of EDITABLE_PROFILE_STRING_FIELDS) {
    const value = input[key];
    if (value === undefined) {
      continue;
    }
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (trimmed.length > maxLength) {
      return null;
    }
    sanitized[key] = trimmed;
  }

  // avatarUrl is managed exclusively via /api/profile/avatar and intentionally ignored here.
  return sanitized;
}

const MAX_CONVENTION_NAME_LENGTH = 120;
const MAX_QUICK_LINKS = 30;
const MAX_QUICK_LINK_ICON_LENGTH = 16;
const MAX_QUICK_LINK_TITLE_LENGTH = 80;

/**
 * Validate and sanitize a partial PortalSettings update payload from PUT /api/settings.
 * Returns null if any provided field has an invalid type, length, or unsafe URL.
 */
export function sanitizePortalSettingsUpdate(body: unknown): Partial<PortalSettings> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }

  const input = body as Record<string, unknown>;
  const sanitized: Partial<PortalSettings> = {};

  if (input.conventionName !== undefined) {
    if (typeof input.conventionName !== 'string') {
      return null;
    }
    const trimmedName = input.conventionName.trim();
    if (!trimmedName || trimmedName.length > MAX_CONVENTION_NAME_LENGTH) {
      return null;
    }
    sanitized.conventionName = trimmedName;
  }

  if (input.quickLinks !== undefined) {
    if (!Array.isArray(input.quickLinks) || input.quickLinks.length > MAX_QUICK_LINKS) {
      return null;
    }

    const cleanLinks: QuickLink[] = [];
    for (const item of input.quickLinks) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
      }
      const raw = item as Record<string, unknown>;
      if (typeof raw.id !== 'number' || !Number.isFinite(raw.id) || raw.id <= 0) {
        return null;
      }
      if (typeof raw.title !== 'string' || typeof raw.url !== 'string') {
        return null;
      }
      const title = raw.title.trim();
      const safeUrl = getSafeExternalUrl(raw.url);
      if (!title || title.length > MAX_QUICK_LINK_TITLE_LENGTH || !safeUrl) {
        return null;
      }

      const rawIcon = typeof raw.icon === 'string' ? raw.icon.trim() : '🔗';
      if (rawIcon.length > MAX_QUICK_LINK_ICON_LENGTH) {
        return null;
      }

      cleanLinks.push({
        id: Math.floor(raw.id),
        icon: rawIcon || '🔗',
        title,
        url: safeUrl,
      });
    }

    sanitized.quickLinks = cleanLinks;
  }

  if (sanitized.conventionName === undefined && sanitized.quickLinks === undefined) {
    return null;
  }

  return sanitized;
}

const MAX_DEPARTMENT_NAME_LENGTH = 80;
const MAX_POSITION_LENGTH = 120;
const MAX_ASSIGNMENTS_PER_USER = 30;

/**
 * Validate and trim a department name (1-80 characters).
 */
export function sanitizeDepartmentName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_DEPARTMENT_NAME_LENGTH) {
    return null;
  }
  return trimmed;
}

/**
 * Validate and trim a free-text crew position title (1-120 characters).
 */
export function sanitizePositionTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_POSITION_LENGTH) {
    return null;
  }
  return trimmed;
}

/**
 * Validate a crew assignment payload (`{ assignments: [{ departmentId, position }] }`).
 * Deduplicates by departmentId (rejects duplicate department IDs).
 */
export function sanitizeCrewAssignmentsPayload(
  body: unknown
): Array<{ departmentId: number; position: string }> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.assignments) || input.assignments.length > MAX_ASSIGNMENTS_PER_USER) {
    return null;
  }

  const seenDepartments = new Set<number>();
  const clean: Array<{ departmentId: number; position: string }> = [];

  for (const item of input.assignments) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }
    const raw = item as Record<string, unknown>;
    if (
      typeof raw.departmentId !== 'number' ||
      !Number.isInteger(raw.departmentId) ||
      raw.departmentId <= 0
    ) {
      return null;
    }
    if (seenDepartments.has(raw.departmentId)) {
      return null;
    }
    const position = sanitizePositionTitle(raw.position);
    if (!position) {
      return null;
    }
    seenDepartments.add(raw.departmentId);
    clean.push({ departmentId: raw.departmentId, position });
  }

  return clean;
}
