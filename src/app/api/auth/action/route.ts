import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { buildKeycloakActionUrl } from '@/lib/keycloak';

export async function GET(req: Request) {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (!action) {
    return NextResponse.json({ error: 'Missing action parameter' }, { status: 400 });
  }

  // Allowed Keycloak required actions
  const validActions = [
    'UPDATE_PASSWORD',
    'CONFIGURE_TOTP',
    'webauthn-register',
    'webauthn-register-passwordless',
  ];

  if (!validActions.includes(action)) {
    return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 });
  }

  const appUrl = process.env.AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const targetUrl = buildKeycloakActionUrl(action, new URL('/profile', appUrl).toString());

  return NextResponse.redirect(targetUrl);
}

