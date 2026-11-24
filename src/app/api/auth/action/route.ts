import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getExpectedAppOrigin } from '@/lib/csrf';
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

  const appOrigin = getExpectedAppOrigin(req.url);
  const targetUrl = buildKeycloakActionUrl(action, new URL('/profile', appOrigin).toString());

  return NextResponse.redirect(targetUrl);
}

