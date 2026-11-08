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
  badgeNumber?: string;
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

/**
 * Fetch user profile from Keycloak using Admin API or user access token.
 */
export async function fetchKeycloakUser(userId: string, userAccessToken?: string): Promise<UserProfileData | null> {
  const { baseUrl, realm, issuer } = getKeycloakUrls();
  const adminToken = await getAdminToken();

  // Try Admin REST API first if adminToken is available
  if (adminToken) {
    const userEndpoint = `${baseUrl}/admin/realms/${realm}/users/${userId}`;
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
        },
        cache: 'no-store',
      });

      if (res.ok) {
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
    const userEndpoint = `${baseUrl}/admin/realms/${realm}/users/${userId}`;
    try {
      // First get existing user attributes so we don't wipe unmanaged attributes
      const existingRes = await fetch(userEndpoint, {
        headers: { Authorization: `Bearer ${adminToken}` },
        cache: 'no-store',
      });
      const existingData = existingRes.ok ? await existingRes.json() : {};

      const body: Record<string, unknown> = {
        firstName: updated.firstName ?? existingData.firstName,
        lastName: updated.lastName ?? existingData.lastName,
        email: updated.email ?? existingData.email,
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
    badgeNumber: getAttr('badgeNumber') || '#0142',
  };
}

