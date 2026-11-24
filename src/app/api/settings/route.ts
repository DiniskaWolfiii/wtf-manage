import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import { getSessionWithPermissions, requireSessionPermission } from '@/lib/server-auth';
import { getPortalSettingsForPermissions, updatePortalSettings } from '@/lib/settings';
import { sanitizePortalSettingsUpdate } from '@/lib/validation';

export async function GET() {
  const user = await getSessionWithPermissions();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getPortalSettingsForPermissions(user.permissions);
  return NextResponse.json(settings);
}

export async function PUT(request: Request) {
  const authResult = await requireSessionPermission('admin.portal.manage');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const rawBody = await request.json();
    const sanitized = sanitizePortalSettingsUpdate(rawBody);
    if (!sanitized) {
      return NextResponse.json({ error: 'Invalid settings payload' }, { status: 400 });
    }

    const updated = await updatePortalSettings(sanitized);

    await recordAuditLog({
      category: 'admin',
      action: 'settings.updated',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'settings',
      targetId: 'portal_settings',
      targetLabel: updated.conventionName,
      summary: 'Updated portal settings',
      metadata: {
        updatedKeys: Object.keys(sanitized),
        conventionName: updated.conventionName,
        quickLinkCount: updated.quickLinks.length,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[API] PUT /api/settings failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
