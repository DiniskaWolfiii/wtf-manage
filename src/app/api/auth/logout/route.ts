import { NextRequest, NextResponse } from 'next/server';
import { signOut } from '@/auth';
import { assertSameOrigin, getExpectedAppOrigin } from '@/lib/csrf';
import { getServerIdToken } from '@/lib/server-auth';

/**
 * End the local Auth.js session and return the Keycloak OIDC RP-Initiated Logout URL
 * so the user's SSO session at WinterFur Identity is also terminated.
 */
export async function POST(req: NextRequest) {
  const csrfRejection = assertSameOrigin(req);
  if (csrfRejection) {
    return csrfRejection;
  }

  const expectedOrigin = getExpectedAppOrigin(req.nextUrl.origin);
  const idToken = await getServerIdToken();

  await signOut({ redirect: false });

  const postLogoutUrl = new URL('/login?loggedOut=1', expectedOrigin).toString();
  const issuer = process.env.KEYCLOAK_ISSUER?.replace(/\/+$/, '');

  if (!issuer) {
    return NextResponse.json({ logoutUrl: postLogoutUrl });
  }

  const logoutUrl = new URL(`${issuer}/protocol/openid-connect/logout`);
  logoutUrl.searchParams.set('post_logout_redirect_uri', postLogoutUrl);

  if (idToken) {
    logoutUrl.searchParams.set('id_token_hint', idToken);
  }
  if (process.env.KEYCLOAK_CLIENT_ID) {
    logoutUrl.searchParams.set('client_id', process.env.KEYCLOAK_CLIENT_ID);
  }

  return NextResponse.json({ logoutUrl: logoutUrl.toString() });
}
