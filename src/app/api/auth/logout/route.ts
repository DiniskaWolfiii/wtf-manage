import { NextRequest, NextResponse } from 'next/server';
import { signOut } from '@/auth';
import { getServerIdToken } from '@/lib/server-auth';

/**
 * End the local Auth.js session and return the Keycloak OIDC RP-Initiated Logout URL
 * so the user's SSO session at WinterFur Identity is also terminated.
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const appOrigin = process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const expectedOrigin = new URL(appOrigin).origin;
  if (origin && origin !== expectedOrigin) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  }

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
