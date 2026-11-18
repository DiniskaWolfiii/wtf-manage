import { headers } from 'next/headers';
import { getToken, type JWT } from 'next-auth/jwt';

async function getServerToken(): Promise<JWT | null> {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return null;
  }

  const reqHeaders = await headers();
  const cookieHeader = reqHeaders.get('cookie') || '';
  const secureCookie = cookieHeader.includes('__Secure-authjs.session-token');

  return getToken({
    req: { headers: reqHeaders },
    secret,
    secureCookie,
  });
}

/**
 * Retrieve the user's Keycloak access token on the server from the encrypted Auth.js JWT cookie
 * without exposing it in the client-accessible session object.
 */
export async function getServerAccessToken(): Promise<string | undefined> {
  const token = await getServerToken();
  return typeof token?.accessToken === 'string' ? token.accessToken : undefined;
}

/**
 * Retrieve the user's Keycloak ID token on the server for federated OIDC logout.
 */
export async function getServerIdToken(): Promise<string | undefined> {
  const token = await getServerToken();
  return typeof token?.idToken === 'string' ? token.idToken : undefined;
}
