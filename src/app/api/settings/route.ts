import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPortalSettings, updatePortalSettings } from '@/lib/settings';
import { sanitizePortalSettingsUpdate } from '@/lib/validation';

export async function GET() {
  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getPortalSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roles = (session.user as unknown as { roles?: string[] }).roles || [];
  if (!roles.includes('winterfur-admin')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const rawBody = await request.json();
    const sanitized = sanitizePortalSettingsUpdate(rawBody);
    if (!sanitized) {
      return NextResponse.json({ error: 'Invalid settings payload' }, { status: 400 });
    }

    const updated = await updatePortalSettings(sanitized);
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[API] PUT /api/settings failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
