import { getSafeAvatarUrl } from '@/lib/validation';

export interface KeycloakUserProfile {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified?: boolean;
  attributes?: Record<string, string[]>;
}

export interface UserProfileData {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  emailVerified?: boolean;
  nickname: string;
  telegram: string;
  species: string;
  pronouns: string;
  phone: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  dob: string;
  avatarUrl?: string;
}

export interface KeycloakCredential {
  id: string;
  type: string;
  userLabel?: string;
  createdDate?: number;
}

export interface SecurityStatus {
  hasPassword: boolean;
  passwordUpdated?: string;
  hasTotp: boolean;
  totpLabel?: string;
  passkeys: Array<{
    id: string;
    name: string;
    date: string;
  }>;
}

const KEYCLOAK_FETCH_TIMEOUT_MS = 10_000;
const USERS_LIST_CACHE_TTL_MS = 30_000;
const MAX_KEYCLOAK_USER_PAGES = 100;

let cachedAdminToken: { token: string; expiresAt: number } | null = null;
let cachedUsersMinimal: { users: MinimalKeycloakUser[]; expiresAt: number } | null = null;
let inFlightUsersMinimal: Promise<MinimalKeycloakUser[] | null> | null = null;

function getKeycloakUrls() {
  const issuer = process.env.KEYCLOAK_ISSUER?.trim();
  if (!issuer) {
    throw new Error('[Keycloak] KEYCLOAK_ISSUER environment variable is not configured');
  }
  const urlObj = new URL(issuer);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  const realmIndex = pathParts.indexOf('realms');
  const realm = realmIndex !== -1 && pathParts[realmIndex + 1] ? pathParts[realmIndex + 1] : null;
  if (!realm) {
    throw new Error('[Keycloak] KEYCLOAK_ISSUER must include /realms/<realm>');
  }
  const realmsPos = urlObj.pathname.indexOf('/realms');
  const baseUrl = `${urlObj.origin}${realmsPos >= 0 ? urlObj.pathname.substring(0, realmsPos) : ''}`;

  return {
    issuer: issuer.replace(/\/+$/, ''),
    baseUrl: baseUrl || urlObj.origin,
    realm,
  };
}

/**
 * Obtain an Admin Service Account token using Client Credentials grant.
 */
async function getAdminToken(): Promise<string | null> {
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  let issuer: string;
  try {
    ({ issuer } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return null;
  }

  // Check cache
  if (cachedAdminToken && Date.now() < cachedAdminToken.expiresAt - 30000) {
    return cachedAdminToken.token;
  }

  const tokenEndpoint = `${issuer}/protocol/openid-connect/token`;

  try {
    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`[Keycloak] Failed to get admin token: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();
    cachedAdminToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in || 300) * 1000,
    };
    return cachedAdminToken.token;
  } catch (err) {
    console.error('[Keycloak] Error obtaining admin token:', err);
    return null;
  }
}

function isSafePathSegment(value: string): boolean {
  return Boolean(value) && !value.includes('/') && !value.includes('\\') && !value.includes('..') && !value.includes('?') && !value.includes('#');
}

/**
 * Fetch user profile from Keycloak using Admin API or user access token.
 */
export async function fetchKeycloakUser(userId: string, userAccessToken?: string): Promise<UserProfileData | null> {
  if (!isSafePathSegment(userId)) {
    return null;
  }

  let baseUrl: string;
  let realm: string;
  let issuer: string;
  try {
    ({ baseUrl, realm, issuer } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return null;
  }

  const adminToken = await getAdminToken();

  // Try Admin REST API first if adminToken is available
  if (adminToken) {
    const userEndpoint = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}`;
    try {
      const res = await fetch(userEndpoint, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      });

      if (res.ok) {
        const data: KeycloakUserProfile = await res.json();
        return mapKeycloakToProfile(data);
      }
      if (res.status === 401) {
        cachedAdminToken = null;
      }
    } catch (err) {
      console.error('[Keycloak] Admin API fetch failed:', err);
    }
  }

  // Fallback: Try User Account API if userAccessToken is available
  if (userAccessToken) {
    const accountEndpoint = `${issuer}/account`;
    try {
      const res = await fetch(accountEndpoint, {
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      });

      if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
        const data = await res.json();
        return mapKeycloakToProfile({ ...data, id: userId });
      }
    } catch (err) {
      console.error('[Keycloak] Account API fetch failed:', err);
    }
  }

  return null;
}

/**
 * Update user attributes in Keycloak.
 */
export async function updateKeycloakUser(
  userId: string,
  updated: Partial<UserProfileData>,
  userAccessToken?: string
): Promise<boolean> {
  if (!isSafePathSegment(userId)) {
    return false;
  }

  let baseUrl: string;
  let realm: string;
  let issuer: string;
  try {
    ({ baseUrl, realm, issuer } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return false;
  }

  const adminToken = await getAdminToken();

  const attributesPayload: Record<string, string[]> = {};
  if (updated.telegram !== undefined) attributesPayload.telegram = [updated.telegram];
  if (updated.species !== undefined) attributesPayload.species = [updated.species];
  if (updated.pronouns !== undefined) attributesPayload.pronouns = [updated.pronouns];
  if (updated.phone !== undefined) attributesPayload.phone = [updated.phone];
  if (updated.street !== undefined) attributesPayload.street = [updated.street];
  if (updated.zip !== undefined) attributesPayload.zip = [updated.zip];
  if (updated.city !== undefined) attributesPayload.city = [updated.city];
  if (updated.country !== undefined) attributesPayload.country = [updated.country];
  if (updated.dob !== undefined) attributesPayload.dob = [updated.dob];
  if (updated.nickname !== undefined) attributesPayload.nickname = [updated.nickname];
  if (updated.avatarUrl !== undefined) attributesPayload.avatarUrl = [updated.avatarUrl];

  // Try Admin REST API
  if (adminToken) {
    const userEndpoint = `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}`;
    try {
      // First get existing user attributes so we don't wipe unmanaged attributes
      const existingRes = await fetch(userEndpoint, {
        headers: { Authorization: `Bearer ${adminToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      });
      if (!existingRes.ok) {
        if (existingRes.status === 401) {
          cachedAdminToken = null;
        }
        console.warn(`[Keycloak] Admin API pre-fetch returned status: ${existingRes.status}`);
        return false;
      }
      const existingData = await existingRes.json();

      const emailChanged =
        typeof updated.email === 'string' &&
        updated.email.trim().toLowerCase() !== String(existingData.email ?? '').trim().toLowerCase();

      const body: Record<string, unknown> = {
        firstName: updated.firstName ?? existingData.firstName,
        lastName: updated.lastName ?? existingData.lastName,
        email: updated.email ?? existingData.email,
        ...(emailChanged ? { emailVerified: false } : {}),
        attributes: {
          ...(existingData.attributes || {}),
          ...attributesPayload,
        },
      };

      const putRes = await fetch(userEndpoint, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      });

      if (putRes.ok) {
        cachedUsersMinimal = null;
        return true;
      }
      if (putRes.status === 401) {
        cachedAdminToken = null;
      }
      console.warn(`[Keycloak] Admin API update returned status: ${putRes.status}`);
    } catch (err) {
      console.error('[Keycloak] Admin API update error:', err);
    }
  }

  // Fallback to Account API with user's access token
  if (userAccessToken) {
    const accountEndpoint = `${issuer}/account`;
    try {
      const res = await fetch(accountEndpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userAccessToken}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: updated.firstName,
          lastName: updated.lastName,
          attributes: attributesPayload,
        }),
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      });

      if (res.ok) return true;
    } catch (err) {
      console.error('[Keycloak] Account API update error:', err);
    }
  }

  return false;
}

/**
 * Trigger a Keycloak `VERIFY_EMAIL` verification email for a user via Admin API.
 */
export async function sendKeycloakVerifyEmail(
  userId: string,
  redirectUri?: string
): Promise<boolean> {
  if (!isSafePathSegment(userId)) {
    return false;
  }

  let baseUrl: string;
  let realm: string;
  try {
    ({ baseUrl, realm } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return false;
  }

  const adminToken = await getAdminToken();
  if (!adminToken) {
    return false;
  }

  const endpoint = new URL(
    `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/execute-actions-email`
  );
  const clientId = process.env.KEYCLOAK_CLIENT_ID?.trim();
  if (clientId && redirectUri) {
    endpoint.searchParams.set('client_id', clientId);
    endpoint.searchParams.set('redirect_uri', redirectUri);
  }

  try {
    const res = await fetch(endpoint.toString(), {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['VERIFY_EMAIL']),
      cache: 'no-store',
      signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
    });

    if (res.status === 401) {
      cachedAdminToken = null;
    }
    if (!res.ok) {
      console.warn(`[Keycloak] execute-actions-email (VERIFY_EMAIL) returned status: ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Keycloak] Error sending verify email:', err);
    return false;
  }
}

/**
 * Terminate all active Keycloak SSO sessions for a user (used on Crew offboarding).
 */
export async function logoutKeycloakUser(userId: string): Promise<boolean> {
  if (!isSafePathSegment(userId)) {
    return false;
  }

  let baseUrl: string;
  let realm: string;
  try {
    ({ baseUrl, realm } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return false;
  }

  const adminToken = await getAdminToken();
  if (!adminToken) {
    return false;
  }

  try {
    const res = await fetch(
      `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/logout`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      }
    );

    if (res.status === 401) {
      cachedAdminToken = null;
    }
    return res.ok || res.status === 204;
  } catch (err) {
    console.error('[Keycloak] Error revoking user sessions:', err);
    return false;
  }
}

function mapKeycloakToProfile(data: KeycloakUserProfile): UserProfileData {
  const getAttr = (key: string): string => {
    return data.attributes?.[key]?.[0] || '';
  };

  return {
    id: data.id,
    username: data.username || '',
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    email: data.email || '',
    emailVerified: Boolean(data.emailVerified),
    nickname: getAttr('nickname') || data.username || '',
    telegram: getAttr('telegram'),
    species: getAttr('species') || 'Other',
    pronouns: getAttr('pronouns') || '',
    phone: getAttr('phone') || '',
    street: getAttr('street') || '',
    zip: getAttr('zip') || '',
    city: getAttr('city') || '',
    country: getAttr('country') || 'Germany',
    dob: getAttr('dob') || '',
    avatarUrl: getSafeAvatarUrl(getAttr('avatarUrl')) || '',
  };
}

const PASSKEY_CREDENTIAL_TYPES = new Set(['webauthn', 'webauthn-passwordless']);

async function fetchRawUserCredentials(userId: string): Promise<KeycloakCredential[] | null> {
  let baseUrl: string;
  let realm: string;
  try {
    ({ baseUrl, realm } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return null;
  }

  const adminToken = await getAdminToken();
  if (!adminToken || !isSafePathSegment(userId)) {
    return null;
  }

  try {
    const res = await fetch(
      `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/credentials`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      }
    );

    if (!res.ok) {
      if (res.status === 401) {
        cachedAdminToken = null;
      }
      console.warn(`[Keycloak] Fetch credentials status: ${res.status}`);
      return null;
    }

    return (await res.json()) as KeycloakCredential[];
  } catch (err) {
    console.error('[Keycloak] Error fetching credentials:', err);
    return null;
  }
}

/**
 * Fetch credentials (passwords, OTP, WebAuthn) for a user from Keycloak Admin API.
 */
export async function fetchUserCredentials(userId: string): Promise<SecurityStatus> {
  const fallback: SecurityStatus = {
    hasPassword: true,
    passwordUpdated: 'Configured',
    hasTotp: false,
    passkeys: [],
  };

  const creds = await fetchRawUserCredentials(userId);
  if (!creds) {
    return fallback;
  }

  const passwordCred = creds.find((c) => c.type === 'password');
  const otpCred = creds.find((c) => c.type === 'otp');
  const passkeyCreds = creds.filter((c) => PASSKEY_CREDENTIAL_TYPES.has(c.type));

  return {
    hasPassword: !!passwordCred,
    passwordUpdated: passwordCred?.createdDate
      ? new Date(passwordCred.createdDate).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : 'Configured',
    hasTotp: !!otpCred,
    totpLabel: otpCred?.userLabel || 'Authenticator App',
    passkeys: passkeyCreds.map((p) => ({
      id: p.id,
      name: p.userLabel || 'WebAuthn Passkey',
      date: p.createdDate
        ? new Date(p.createdDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : 'Registered',
    })),
  };
}

/**
 * Delete a WebAuthn passkey credential for a user after verifying ownership and credential type.
 * Refuses to delete password or TOTP (OTP) credentials through this self-service endpoint.
 */
export async function deleteUserPasskeyCredential(
  userId: string,
  credentialId: string
): Promise<'deleted' | 'forbidden' | 'not_found' | 'error'> {
  if (!isSafePathSegment(userId) || !isSafePathSegment(credentialId)) {
    return 'error';
  }

  const creds = await fetchRawUserCredentials(userId);
  if (!creds) {
    return 'error';
  }

  const target = creds.find((c) => c.id === credentialId);
  if (!target) {
    return 'not_found';
  }
  if (!PASSKEY_CREDENTIAL_TYPES.has(target.type)) {
    return 'forbidden';
  }

  let baseUrl: string;
  let realm: string;
  try {
    ({ baseUrl, realm } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return 'error';
  }

  const adminToken = await getAdminToken();
  if (!adminToken) {
    return 'error';
  }

  try {
    const res = await fetch(
      `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/credentials/${encodeURIComponent(credentialId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      }
    );

    if (res.status === 401) {
      cachedAdminToken = null;
    }

    return res.ok || res.status === 204 ? 'deleted' : 'error';
  } catch (err) {
    console.error('[Keycloak] Error deleting passkey credential:', err);
    return 'error';
  }
}

/**
 * Build a Keycloak Action URL (kc_action=UPDATE_PASSWORD, CONFIGURE_TOTP, webauthn-register-passwordless)
 */
export function buildKeycloakActionUrl(action: string, redirectUrl?: string): string {
  const { issuer } = getKeycloakUrls();
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const targetRedirect = redirectUrl || process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (!clientId) {
    throw new Error('[Keycloak] KEYCLOAK_CLIENT_ID is not configured');
  }
  if (!targetRedirect) {
    throw new Error('[Keycloak] Redirect URL is not configured');
  }

  const authUrl = new URL(`${issuer}/protocol/openid-connect/auth`);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid');
  authUrl.searchParams.set('redirect_uri', targetRedirect);
  authUrl.searchParams.set('kc_action', action);

  return authUrl.toString();
}

export interface MinimalKeycloakUser {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface KeycloakGroupSummary {
  id: string;
  name: string;
  path: string;
}

/**
 * List all Keycloak realm users with strictly minimal fields (id, username, avatarUrl)
 * for FR crew promotion without exposing personal profile details.
 * Uses short-lived caching and in-flight deduplication to avoid Keycloak amplification.
 */
export async function listKeycloakUsersMinimal(
  options?: { bypassCache?: boolean }
): Promise<MinimalKeycloakUser[] | null> {
  const now = Date.now();
  if (!options?.bypassCache && cachedUsersMinimal && cachedUsersMinimal.expiresAt > now) {
    return cachedUsersMinimal.users;
  }
  if (!options?.bypassCache && inFlightUsersMinimal) {
    return inFlightUsersMinimal;
  }

  const loader = (async (): Promise<MinimalKeycloakUser[] | null> => {
    let baseUrl: string;
    let realm: string;
    try {
      ({ baseUrl, realm } = getKeycloakUrls());
    } catch (err) {
      console.error((err as Error).message);
      return null;
    }

    const adminToken = await getAdminToken();
    if (!adminToken) {
      return null;
    }

    const users: MinimalKeycloakUser[] = [];
    const pageSize = 100;
    let first = 0;

    try {
      for (let page = 0; page < MAX_KEYCLOAK_USER_PAGES; page++) {
        const res = await fetch(
          `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users?first=${first}&max=${pageSize}&briefRepresentation=false`,
          {
            headers: { Authorization: `Bearer ${adminToken}` },
            cache: 'no-store',
            signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
          }
        );

        if (res.status === 401) {
          cachedAdminToken = null;
          return null;
        }
        if (!res.ok) {
          console.warn(`[Keycloak] Failed to list users: ${res.status}`);
          return null;
        }

        const batch = (await res.json()) as Array<{
          id?: string;
          username?: string;
          attributes?: Record<string, string[]>;
        }>;

        for (const u of batch) {
          if (!u.id || !u.username) continue;
          const rawAvatar = u.attributes?.avatarUrl?.[0];
          const safeAvatar = getSafeAvatarUrl(rawAvatar) ?? undefined;
          users.push({
            id: u.id,
            username: u.username,
            avatarUrl: safeAvatar,
          });
        }

        if (batch.length < pageSize) {
          break;
        }
        first += pageSize;
      }

      const sorted = users.sort((a, b) => a.username.localeCompare(b.username));
      cachedUsersMinimal = {
        users: sorted,
        expiresAt: Date.now() + USERS_LIST_CACHE_TTL_MS,
      };
      return sorted;
    } catch (err) {
      console.error('[Keycloak] Error listing users:', err);
      return null;
    }
  })().finally(() => {
    if (inFlightUsersMinimal === loader) {
      inFlightUsersMinimal = null;
    }
  });

  if (!options?.bypassCache) {
    inFlightUsersMinimal = loader;
  }
  return loader;
}

interface RawKeycloakGroup {
  id?: string;
  name?: string;
  path?: string;
  subGroups?: RawKeycloakGroup[];
}

function flattenKeycloakGroups(groups: RawKeycloakGroup[], out: KeycloakGroupSummary[] = []): KeycloakGroupSummary[] {
  for (const g of groups) {
    if (g.id && g.name) {
      out.push({
        id: g.id,
        name: g.name,
        path: g.path || `/${g.name}`,
      });
    }
    if (Array.isArray(g.subGroups) && g.subGroups.length > 0) {
      flattenKeycloakGroups(g.subGroups, out);
    }
  }
  return out;
}

/**
 * List all Keycloak realm groups (flattened, including subgroups).
 */
export async function listKeycloakGroups(): Promise<KeycloakGroupSummary[] | null> {
  let baseUrl: string;
  let realm: string;
  try {
    ({ baseUrl, realm } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return null;
  }

  const adminToken = await getAdminToken();
  if (!adminToken) {
    return null;
  }

  try {
    const res = await fetch(
      `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/groups?briefRepresentation=false&max=500`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      }
    );

    if (res.status === 401) {
      cachedAdminToken = null;
      return null;
    }
    if (!res.ok) {
      console.warn(`[Keycloak] Failed to list groups: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as RawKeycloakGroup[];
    return flattenKeycloakGroups(data).sort((a, b) => a.path.localeCompare(b.path));
  } catch (err) {
    console.error('[Keycloak] Error listing groups:', err);
    return null;
  }
}

/**
 * Find a Keycloak group by exact normalized path (preferred) or top-level name fallback.
 */
export async function getKeycloakGroupByName(groupIdentifier: string): Promise<KeycloakGroupSummary | null> {
  const groups = await listKeycloakGroups();
  if (!groups) {
    return null;
  }
  const normalized = groupIdentifier.trim().replace(/^\/+|\/+$/g, '');
  if (!normalized) {
    return null;
  }
  // Prefer exact normalized full-path match to avoid subgroup name collisions
  const exactPathMatch = groups.find((g) => g.path.replace(/^\/+|\/+$/g, '') === normalized);
  if (exactPathMatch) {
    return exactPathMatch;
  }
  // Fallback: match by exact name only if unique across the realm
  const nameMatches = groups.filter((g) => g.name === normalized);
  return nameMatches.length === 1 ? nameMatches[0] : null;
}

/**
 * Fetch the set of Keycloak user IDs belonging to a specific group.
 */
export async function getGroupMemberIds(groupId: string): Promise<Set<string> | null> {
  let baseUrl: string;
  let realm: string;
  try {
    ({ baseUrl, realm } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return null;
  }

  const adminToken = await getAdminToken();
  if (!adminToken || !isSafePathSegment(groupId)) {
    return null;
  }

  const members = new Set<string>();
  const pageSize = 100;
  let first = 0;

  try {
    for (let page = 0; page < MAX_KEYCLOAK_USER_PAGES; page++) {
      const res = await fetch(
        `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/groups/${encodeURIComponent(groupId)}/members?first=${first}&max=${pageSize}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
        }
      );

      if (res.status === 401) {
        cachedAdminToken = null;
        return null;
      }
      if (!res.ok) {
        console.warn(`[Keycloak] Failed to fetch group members: ${res.status}`);
        return null;
      }

      const batch = (await res.json()) as Array<{ id?: string }>;
      for (const m of batch) {
        if (m.id) {
          members.add(m.id);
        }
      }

      if (batch.length < pageSize) {
        break;
      }
      first += pageSize;
    }

    return members;
  } catch (err) {
    console.error('[Keycloak] Error fetching group members:', err);
    return null;
  }
}

/**
 * Add a Keycloak user to a group.
 */
export async function addUserToGroup(userId: string, groupId: string): Promise<boolean> {
  let baseUrl: string;
  let realm: string;
  try {
    ({ baseUrl, realm } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return false;
  }

  const adminToken = await getAdminToken();
  if (!adminToken || !isSafePathSegment(userId) || !isSafePathSegment(groupId)) {
    return false;
  }

  try {
    const res = await fetch(
      `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(groupId)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      }
    );

    if (res.status === 401) {
      cachedAdminToken = null;
    }
    return res.ok || res.status === 204;
  } catch (err) {
    console.error('[Keycloak] Error adding user to group:', err);
    return false;
  }
}

/**
 * Remove a Keycloak user from a group.
 */
export async function removeUserFromGroup(userId: string, groupId: string): Promise<boolean> {
  let baseUrl: string;
  let realm: string;
  try {
    ({ baseUrl, realm } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return false;
  }

  const adminToken = await getAdminToken();
  if (!adminToken || !isSafePathSegment(userId) || !isSafePathSegment(groupId)) {
    return false;
  }

  try {
    const res = await fetch(
      `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/groups/${encodeURIComponent(groupId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      }
    );

    if (res.status === 401) {
      cachedAdminToken = null;
    }
    return res.ok || res.status === 204 || res.status === 404;
  } catch (err) {
    console.error('[Keycloak] Error removing user from group:', err);
    return false;
  }
}

/**
 * Fetch the Keycloak group paths (normalized without leading/trailing slashes)
 * for a specific user via the Keycloak Admin API.
 */
export async function fetchUserKeycloakGroups(userId: string): Promise<string[] | null> {
  let baseUrl: string;
  let realm: string;
  try {
    ({ baseUrl, realm } = getKeycloakUrls());
  } catch (err) {
    console.error((err as Error).message);
    return null;
  }

  const adminToken = await getAdminToken();
  if (!adminToken || !isSafePathSegment(userId)) {
    return null;
  }

  try {
    const res = await fetch(
      `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/groups?briefRepresentation=true&max=200`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(KEYCLOAK_FETCH_TIMEOUT_MS),
      }
    );

    if (res.status === 401) {
      cachedAdminToken = null;
      return null;
    }
    if (!res.ok) {
      console.warn(`[Keycloak] Failed to fetch user groups: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as Array<{ name?: string; path?: string }>;
    const normalized = data
      .map((g) => (g.path || g.name || '').trim().replace(/^\/+|\/+$/g, ''))
      .filter((g) => g.length > 0);

    return Array.from(new Set(normalized));
  } catch (err) {
    console.error('[Keycloak] Error fetching user groups:', err);
    return null;
  }
}
