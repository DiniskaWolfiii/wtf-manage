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
      }
      if (profile || account?.access_token) {
        const clientId = process.env.KEYCLOAK_CLIENT_ID;
        const profileObj = (profile as Record<string, unknown> | undefined) ?? null;
        const accessClaims = decodeJwtPayload(account?.access_token);

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

