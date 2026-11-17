import { headers } from 'next/headers';
import { getToken } from 'next-auth/jwt';

/**
 * Retrieve the user's Keycloak access token on the server from the encrypted Auth.js JWT cookie
 * without exposing it in the client-accessible session object.
 */
export async function getServerAccessToken(): Promise<string | undefined> {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return undefined;
  }

  const reqHeaders = await headers();
  const cookieHeader = reqHeaders.get('cookie') || '';
  const secureCookie = cookieHeader.includes('__Secure-authjs.session-token');

  const token = await getToken({
    req: { headers: reqHeaders },
    secret,
    secureCookie,
  });

  return typeof token?.accessToken === 'string' ? token.accessToken : undefined;
}
