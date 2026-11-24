import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getToken, type JWT } from 'next-auth/jwt';
import { auth, getCachedRefreshedToken } from '@/auth';
import { resolveUserPermissions } from '@/lib/permissions';
import type { PortalPermission } from '@/lib/permission-types';

const ABSOLUTE_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 30 * 1000;

async function getRawServerToken(): Promise<JWT | null> {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return null;
  }

  const reqHeaders = await headers();
  const cookieHeader = reqHeaders.get('cookie') || '';
  const secureCookie =
    (process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '').startsWith('https://') ||
    /(?:^|;\s*)__Secure-authjs\.session-token(?:\.\d+)?=/.test(cookieHeader);

  const token = await getToken({
    req: { headers: reqHeaders },
    secret,
    secureCookie,
  });

  if (!token) {
    return null;
  }

  if (
    typeof token.loginAt !== 'number' ||
    !Number.isFinite(token.loginAt) ||
    Date.now() - token.loginAt > ABSOLUTE_SESSION_MAX_AGE_MS
  ) {
    return null;
  }

  return token;
}

/**
 * Retrieve the user's Keycloak access token on the server from the encrypted Auth.js JWT cookie
 * without triggering an unpersisted refresh token rotation (compatible with Keycloak Revoke Refresh Token).
 */
export async function getServerAccessToken(): Promise<string | undefined> {
  const token = await getRawServerToken();
  if (!token) {
    return undefined;
  }

  if (typeof token.expiresAt === 'number' && Date.now() >= token.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    if (typeof token.refreshToken === 'string' && token.refreshToken) {
      const cached = getCachedRefreshedToken(token.refreshToken);
      if (cached) {
        return cached.accessToken;
      }
    }
    return undefined;
  }

  return typeof token.accessToken === 'string' ? token.accessToken : undefined;
}

/**
 * Retrieve the user's Keycloak ID token on the server for federated OIDC RP-Initiated Logout.
 * Does NOT trigger a token refresh (OIDC logout accepts expired id_token_hint).
 */
export async function getServerIdToken(): Promise<string | undefined> {
  const token = await getRawServerToken();
  if (!token) {
    return undefined;
  }
  if (typeof token.refreshToken === 'string' && token.refreshToken) {
    const cached = getCachedRefreshedToken(token.refreshToken);
    if (cached?.idToken) {
      return cached.idToken;
    }
  }
  return typeof token.idToken === 'string' ? token.idToken : undefined;
}

export interface AuthenticatedSessionUser {
  id: string;
  name: string;
  email: string;
  image: string;
  username: string;
  permissions: PortalPermission[];
}

/**
 * Loads the current Auth.js session and resolves the user's effective portal permissions
 * on the server from their Keycloak groups. Returns `null` if unauthenticated.
 */
export async function getSessionWithPermissions(): Promise<AuthenticatedSessionUser | null> {
  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    return null;
  }

  const groups = (session.user as unknown as { groups?: string[] }).groups || [];
  const permissions = await resolveUserPermissions(groups);
  const username =
    (session.user as unknown as { username?: string }).username ||
    session.user.name ||
    session.user.id;

  return {
    id: session.user.id,
    name: session.user.name || '',
    email: session.user.email || '',
    image: session.user.image || '',
    username,
    permissions,
  };
}

/**
 * Verify that the current request has an authenticated session with at least one
 * of the required portal permissions. Returns `{ userId, username, groups, permissions }`
 * or a `401`/`403` NextResponse.
 */
export async function requireSessionPermission(
  requiredPermission: PortalPermission | PortalPermission[]
): Promise<
  | { userId: string; username: string; groups: string[]; permissions: PortalPermission[] }
  | NextResponse
> {
  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const groups = (session.user as unknown as { groups?: string[] }).groups || [];
  const permissions = await resolveUserPermissions(groups);
  const allowed = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];

  if (!allowed.some((perm) => permissions.includes(perm))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const username =
    (session.user as unknown as { username?: string }).username ||
    session.user.name ||
    session.user.id;

  return { userId: session.user.id, username, groups, permissions };
}
