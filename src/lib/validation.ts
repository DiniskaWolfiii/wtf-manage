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
 * Validate and trim an optional free-text crew position title (0-120 characters).
 * Returns null only if the input type is invalid or exceeds 120 characters.
 */
export function sanitizePositionTitle(raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return '';
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length > MAX_POSITION_LENGTH) {
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
    if (position === null) {
      return null;
    }
    seenDepartments.add(raw.departmentId);
    clean.push({ departmentId: raw.departmentId, position });
  }

  return clean;
}

const MAX_SKILL_NAME_LENGTH = 80;
const MAX_SKILL_CATEGORY_LENGTH = 60;
const MAX_SKILL_LEVEL_LENGTH = 40;
const MAX_SKILL_LEVELS_COUNT = 20;
const MAX_SKILLS_PER_USER = 40;

/**
 * Validate and trim a skill name (1-80 characters).
 */
export function sanitizeSkillName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_SKILL_NAME_LENGTH) {
    return null;
  }
  return trimmed;
}

/**
 * Validate and trim a skill category (1-60 characters, defaults to 'General' when empty).
 */
export function sanitizeSkillCategory(raw: unknown): string | null {
  if (raw === undefined || raw === null) {
    return 'General';
  }
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'General';
  }
  if (trimmed.length > MAX_SKILL_CATEGORY_LENGTH) {
    return null;
  }
  return trimmed;
}

/**
 * Validate an array of skill levels (1-20 unique non-empty strings, max 40 chars each).
 */
export function sanitizeSkillLevels(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SKILL_LEVELS_COUNT * 2) {
    return null;
  }
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      return null;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.length > MAX_SKILL_LEVEL_LENGTH) {
      return null;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    clean.push(trimmed);
    if (clean.length > MAX_SKILL_LEVELS_COUNT) {
      return null;
    }
  }
  if (clean.length === 0) {
    return null;
  }
  return clean;
}

/**
 * Validate a crew skills assignment payload (`{ skills: [{ skillId, level }] }`).
 * Rejects duplicate skillIds.
 */
export function sanitizeCrewSkillsPayload(
  body: unknown
): Array<{ skillId: number; level: string }> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const input = body as Record<string, unknown>;
  if (!Array.isArray(input.skills) || input.skills.length > MAX_SKILLS_PER_USER) {
    return null;
  }

  const seenSkills = new Set<number>();
  const clean: Array<{ skillId: number; level: string }> = [];

  for (const item of input.skills) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return null;
    }
    const raw = item as Record<string, unknown>;
    if (
      typeof raw.skillId !== 'number' ||
      !Number.isInteger(raw.skillId) ||
      raw.skillId <= 0
    ) {
      return null;
    }
    if (seenSkills.has(raw.skillId)) {
      return null;
    }
    if (typeof raw.level !== 'string') {
      return null;
    }
    const level = raw.level.trim();
    if (!level || level.length > MAX_SKILL_LEVEL_LENGTH) {
      return null;
    }
    seenSkills.add(raw.skillId);
    clean.push({ skillId: raw.skillId, level });
  }

  return clean;
}

const VALID_CREW_STATUSES = new Set(['active', 'on_leave', 'offboarded']);
const MAX_REASON_LENGTH = 255;
const MAX_INTERNAL_NOTES_LENGTH = 4000;

function parseOptionalDateString(val: unknown): string | null | undefined {
  if (val === undefined) return undefined;
  if (val === null || val === '') return null;
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

/**
 * Validate a crew master-data update payload for FR.
 */
export function sanitizeCrewMasterDataPayload(body: unknown): {
  status?: 'active' | 'on_leave' | 'offboarded';
  joinedAt?: string | null;
  offboardedAt?: string | null;
  offboardReason?: string | null;
  internalNotes?: string;
  effectiveAt?: string | null;
  eventNote?: string | null;
} | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const input = body as Record<string, unknown>;
  const out: {
    status?: 'active' | 'on_leave' | 'offboarded';
    joinedAt?: string | null;
    offboardedAt?: string | null;
    offboardReason?: string | null;
    internalNotes?: string;
    effectiveAt?: string | null;
    eventNote?: string | null;
  } = {};

  if (input.status !== undefined) {
    if (typeof input.status !== 'string' || !VALID_CREW_STATUSES.has(input.status)) {
      return null;
    }
    out.status = input.status as 'active' | 'on_leave' | 'offboarded';
  }

  if (input.joinedAt !== undefined) {
    const d = parseOptionalDateString(input.joinedAt);
    if (d === undefined) return null;
    out.joinedAt = d;
  }

  if (input.offboardedAt !== undefined) {
    const d = parseOptionalDateString(input.offboardedAt);
    if (d === undefined) return null;
    out.offboardedAt = d;
  }

  if (input.effectiveAt !== undefined) {
    const d = parseOptionalDateString(input.effectiveAt);
    if (d === undefined) return null;
    out.effectiveAt = d;
  }

  if (input.offboardReason !== undefined) {
    if (input.offboardReason === null) {
      out.offboardReason = null;
    } else if (typeof input.offboardReason === 'string') {
      const t = input.offboardReason.trim();
      if (t.length > MAX_REASON_LENGTH) return null;
      out.offboardReason = t || null;
    } else {
      return null;
    }
  }

  if (input.eventNote !== undefined) {
    if (input.eventNote === null) {
      out.eventNote = null;
    } else if (typeof input.eventNote === 'string') {
      const t = input.eventNote.trim();
      if (t.length > MAX_REASON_LENGTH) return null;
      out.eventNote = t || null;
    } else {
      return null;
    }
  }

  if (input.internalNotes !== undefined) {
    if (typeof input.internalNotes !== 'string') return null;
    if (input.internalNotes.length > MAX_INTERNAL_NOTES_LENGTH) return null;
    out.internalNotes = input.internalNotes.trim();
  }

  if (Object.keys(out).length === 0) {
    return null;
  }

  return out;
}

/**
 * Validate optional `{ reason }` body on DELETE /api/fr/crew/[userId].
 */
export function sanitizeOffboardPayload(body: unknown): { reason: string | null } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { reason: null };
  }
  const raw = (body as Record<string, unknown>).reason;
  if (typeof raw !== 'string') {
    return { reason: null };
  }
  const trimmed = raw.trim().slice(0, MAX_REASON_LENGTH);
  return { reason: trimmed || null };
}
