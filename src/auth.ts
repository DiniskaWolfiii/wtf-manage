import NextAuth from 'next-auth';
import Keycloak from 'next-auth/providers/keycloak';
import { getSafeAvatarUrl } from '@/lib/validation';

function decodeJwtPayload(jwt?: string): Record<string, unknown> | null {
  if (!jwt) return null;
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function extractKeycloakRoles(
  claims: Record<string, unknown> | null | undefined,
  clientId?: string
): string[] {
  if (!claims) return [];

  const realmAccess = claims.realm_access as { roles?: unknown } | undefined;
  const realmRoles =
    realmAccess && typeof realmAccess === 'object' && !Array.isArray(realmAccess) && Array.isArray(realmAccess.roles)
      ? realmAccess.roles.filter((r): r is string => typeof r === 'string')
      : [];

  const resourceAccess = claims.resource_access as Record<string, { roles?: unknown } | undefined> | undefined;
  const clientAccess =
    clientId &&
      resourceAccess &&
      typeof resourceAccess === 'object' &&
      !Array.isArray(resourceAccess) &&
      Object.hasOwn(resourceAccess, clientId)
      ? resourceAccess[clientId]
      : undefined;
  const clientRoles =
    clientAccess && typeof clientAccess === 'object' && !Array.isArray(clientAccess) && Array.isArray(clientAccess.roles)
      ? clientAccess.roles.filter((r): r is string => typeof r === 'string')
      : [];

  return [...realmRoles, ...clientRoles];
}

const ABSOLUTE_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const TOKEN_REFRESH_BUFFER_MS = 30 * 1000;

interface RefreshedTokens {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt: number;
  roles: string[];
}

const inFlightRefreshes = new Map<string, Promise<RefreshedTokens | null>>();
const RECENT_REFRESH_TTL_MS = 10 * 1000;
const recentRefreshes = new Map<string, { value: RefreshedTokens; expiresAt: number }>();

async function refreshKeycloakToken(refreshToken: string): Promise<RefreshedTokens | null> {
  const issuer = process.env.KEYCLOAK_ISSUER;
  const clientId = process.env.KEYCLOAK_CLIENT_ID;
  const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET;

  if (!issuer || !clientId || !clientSecret) {
    return null;
  }

  const tokenUrl = `${issuer.replace(/\/+$/, '')}/protocol/openid-connect/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  try {
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return null;
    }

    const data = (await res.json()) as {
      access_token?: string;
      id_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (typeof data.access_token !== 'string' || !data.access_token) {
      return null;
    }

    const expiresInSec =
      typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 300;
    const accessClaims = decodeJwtPayload(data.access_token);
    const idClaims = decodeJwtPayload(data.id_token);

    const roles = Array.from(
      new Set([
        ...extractKeycloakRoles(accessClaims, clientId),
        ...extractKeycloakRoles(idClaims, clientId),
      ])
    );

    return {
      accessToken: data.access_token,
      idToken: typeof data.id_token === 'string' ? data.id_token : undefined,
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : undefined,
      expiresAt: Date.now() + expiresInSec * 1000,
      roles,
    };
  } catch {
    return null;
  }
}

export function getOrRefreshKeycloakToken(refreshToken: string): Promise<RefreshedTokens | null> {
  const now = Date.now();
  for (const [key, entry] of recentRefreshes.entries()) {
    if (entry.expiresAt <= now) {
      recentRefreshes.delete(key);
    }
  }

  const recent = recentRefreshes.get(refreshToken);
  if (recent && recent.expiresAt > now) {
    return Promise.resolve(recent.value);
  }

  const existing = inFlightRefreshes.get(refreshToken);
  if (existing) {
    return existing;
  }

  const promise = refreshKeycloakToken(refreshToken)
    .then((result) => {
      if (result) {
        recentRefreshes.set(refreshToken, {
          value: result,
          expiresAt: Date.now() + RECENT_REFRESH_TTL_MS,
        });
      }
      return result;
    })
    .finally(() => {
      inFlightRefreshes.delete(refreshToken);
    });
  inFlightRefreshes.set(refreshToken, promise);
  return promise;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [
    Keycloak({
      name: 'WinterFur Identity',
      clientId: process.env.KEYCLOAK_CLIENT_ID,
      clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
      issuer: process.env.KEYCLOAK_ISSUER,
    }),
  ],
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8h instead of 30d default to limit stale RBAC claims
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.idToken = account.id_token;
        token.userId = account.providerAccountId;
        token.refreshToken = account.refresh_token;
        token.expiresAt =
          typeof account.expires_at === 'number'
            ? account.expires_at * 1000
            : Date.now() + 5 * 60 * 1000;
        token.loginAt = Date.now();

        if (profile || account.access_token) {
          const clientId = process.env.KEYCLOAK_CLIENT_ID;
          const profileObj = (profile as Record<string, unknown> | undefined) ?? null;
          const accessClaims = decodeJwtPayload(account.access_token);

          if (profileObj) {
            if (typeof profileObj.preferred_username === 'string' && profileObj.preferred_username.trim()) {
              token.username = profileObj.preferred_username.trim();
            }
            const safePicture =
              typeof profileObj.picture === 'string' ? getSafeAvatarUrl(profileObj.picture) : null;
            if (safePicture) {
              token.picture = safePicture;
            } else {
              delete token.picture;
            }
          }

          const mergedRoles = Array.from(
            new Set([
              ...extractKeycloakRoles(profileObj, clientId),
              ...extractKeycloakRoles(accessClaims, clientId),
            ])
          );
          token.roles = mergedRoles;
        }

        return token;
      }

      // Enforce hard absolute session lifetime (fail-closed on missing/invalid loginAt)
      if (
        typeof token.loginAt !== 'number' ||
        !Number.isFinite(token.loginAt) ||
        Date.now() - token.loginAt > ABSOLUTE_SESSION_MAX_AGE_MS
      ) {
        return null;
      }

      // Access token still valid -> reuse cached claims without contacting Keycloak
      if (typeof token.expiresAt === 'number' && Date.now() < token.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
        return token;
      }

      // Access token expired -> refresh against Keycloak to sync roles and session state
      if (typeof token.refreshToken !== 'string' || !token.refreshToken) {
        return null;
      }

      const refreshed = await getOrRefreshKeycloakToken(token.refreshToken);
      if (!refreshed) {
        return null;
      }

      token.accessToken = refreshed.accessToken;
      if (refreshed.idToken) {
        token.idToken = refreshed.idToken;
      }
      if (refreshed.refreshToken) {
        token.refreshToken = refreshed.refreshToken;
      }
      token.expiresAt = refreshed.expiresAt;
      token.roles = refreshed.roles;

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.userId as string) || (token.sub as string);
        const safeImage =
          typeof token.picture === 'string' ? getSafeAvatarUrl(token.picture) : null;
        if (safeImage) {
          session.user.image = safeImage;
        } else {
          delete session.user.image;
        }
        (session.user as unknown as { username?: string }).username = token.username as string;
        (session.user as unknown as { roles?: string[] }).roles = (token.roles as string[]) || [];
      }
      return session;
    },
  },
});

