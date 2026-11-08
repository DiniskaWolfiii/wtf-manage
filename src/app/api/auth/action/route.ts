import { NextResponse } from 'next/server';
import { buildKeycloakActionUrl } from '@/lib/keycloak';

export async function GET(req: Request) {
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const targetUrl = buildKeycloakActionUrl(action, appUrl);

  return NextResponse.redirect(targetUrl);
}
