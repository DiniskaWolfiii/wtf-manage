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

let cachedAdminToken: { token: string; expiresAt: number } | null = null;

function getKeycloakUrls() {
  const issuer = process.env.KEYCLOAK_ISSUER || 'https://identity.winterfur.org/realms/winterfur-test';
  const urlObj = new URL(issuer);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  const realmIndex = pathParts.indexOf('realms');
  const realm = realmIndex !== -1 && pathParts[realmIndex + 1] ? pathParts[realmIndex + 1] : 'winterfur-test';
  const baseUrl = `${urlObj.origin}${urlObj.pathname.substring(0, urlObj.pathname.indexOf('/realms'))}`;

  return {
    issuer,
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
  const { issuer } = getKeycloakUrls();

  if (!clientId || !clientSecret) {
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

  const { baseUrl, realm, issuer } = getKeycloakUrls();
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

  const { baseUrl, realm, issuer } = getKeycloakUrls();
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
      });
      if (!existingRes.ok) {
        if (existingRes.status === 401) {
          cachedAdminToken = null;
        }
        console.warn(`[Keycloak] Admin API pre-fetch returned status: ${existingRes.status}`);
        return false;
      }
      const existingData = await existingRes.json();

      const body: Record<string, unknown> = {
        firstName: updated.firstName ?? existingData.firstName,
        lastName: updated.lastName ?? existingData.lastName,
        email: updated.email ?? existingData.email,
        ...(updated.email && updated.email !== existingData.email ? { emailVerified: false } : {}),
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
      });

      if (putRes.ok) return true;
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
      });

      if (res.ok) return true;
    } catch (err) {
      console.error('[Keycloak] Account API update error:', err);
    }
  }

  return false;
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
    avatarUrl: getAttr('avatarUrl') || '',
  };
}

/**
 * Fetch credentials (passwords, OTP, WebAuthn) for a user from Keycloak Admin API.
 */
export async function fetchUserCredentials(userId: string): Promise<SecurityStatus> {
  const { baseUrl, realm } = getKeycloakUrls();
  const adminToken = await getAdminToken();

  const fallback: SecurityStatus = {
    hasPassword: true,
    passwordUpdated: 'Configured',
    hasTotp: false,
    passkeys: [],
  };

  if (!adminToken || !isSafePathSegment(userId)) return fallback;

  try {
    const res = await fetch(`${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/credentials`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      if (res.status === 401) {
        cachedAdminToken = null;
      }
      console.warn(`[Keycloak] Fetch credentials status: ${res.status}`);
      return fallback;
    }

    const creds: KeycloakCredential[] = await res.json();

    const passwordCred = creds.find((c) => c.type === 'password');
    const otpCred = creds.find((c) => c.type === 'otp');
    const passkeyCreds = creds.filter(
      (c) => c.type === 'webauthn' || c.type === 'webauthn-passwordless'
    );

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
  } catch (err) {
    console.error('[Keycloak] Error fetching credentials:', err);
    return fallback;
  }
}

/**
 * Delete a specific credential (e.g. remove a Passkey) in Keycloak.
 */
export async function deleteUserCredential(userId: string, credentialId: string): Promise<boolean> {
  const { baseUrl, realm } = getKeycloakUrls();
  const adminToken = await getAdminToken();

  if (!adminToken || !isSafePathSegment(userId) || !isSafePathSegment(credentialId)) {
    return false;
  }

  try {
    const res = await fetch(
      `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users/${encodeURIComponent(userId)}/credentials/${encodeURIComponent(credentialId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    if (res.status === 401) {
      cachedAdminToken = null;
    }

    return res.ok || res.status === 204;
  } catch (err) {
    console.error('[Keycloak] Error deleting credential:', err);
    return false;
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
 */
export async function listKeycloakUsersMinimal(): Promise<MinimalKeycloakUser[] | null> {
  const { baseUrl, realm } = getKeycloakUrls();
  const adminToken = await getAdminToken();
  if (!adminToken) {
    return null;
  }

  const users: MinimalKeycloakUser[] = [];
  const pageSize = 100;
  let first = 0;

  try {
    while (true) {
      const res = await fetch(
        `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/users?first=${first}&max=${pageSize}&briefRepresentation=false`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          cache: 'no-store',
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
        users.push({
          id: u.id,
          username: u.username,
          avatarUrl: rawAvatar && rawAvatar.trim() ? rawAvatar.trim() : undefined,
        });
      }

      if (batch.length < pageSize) {
        break;
      }
      first += pageSize;
    }

    return users.sort((a, b) => a.username.localeCompare(b.username));
  } catch (err) {
    console.error('[Keycloak] Error listing users:', err);
    return null;
  }
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
  const { baseUrl, realm } = getKeycloakUrls();
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
 * Find a Keycloak group by exact name (e.g. `wtf-crew`).
 */
export async function getKeycloakGroupByName(groupName: string): Promise<KeycloakGroupSummary | null> {
  const groups = await listKeycloakGroups();
  if (!groups) {
    return null;
  }
  return groups.find((g) => g.name === groupName) ?? null;
}

/**
 * Fetch the set of Keycloak user IDs belonging to a specific group.
 */
export async function getGroupMemberIds(groupId: string): Promise<Set<string> | null> {
  const { baseUrl, realm } = getKeycloakUrls();
  const adminToken = await getAdminToken();
  if (!adminToken || !isSafePathSegment(groupId)) {
    return null;
  }

  const members = new Set<string>();
  const pageSize = 100;
  let first = 0;

  try {
    while (true) {
      const res = await fetch(
        `${baseUrl}/admin/realms/${encodeURIComponent(realm)}/groups/${encodeURIComponent(groupId)}/members?first=${first}&max=${pageSize}`,
        {
          headers: { Authorization: `Bearer ${adminToken}` },
          cache: 'no-store',
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
  const { baseUrl, realm } = getKeycloakUrls();
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
  const { baseUrl, realm } = getKeycloakUrls();
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

