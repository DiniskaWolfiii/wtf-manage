import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import {
  getCrewProfile,
  listCrewLifecycleEvents,
  updateCrewMasterData,
} from '@/lib/crew-profiles';
import { requireSessionPermission } from '@/lib/server-auth';
import { sanitizeCrewMasterDataPayload } from '@/lib/validation';

function isValidUserId(userId: string): boolean {
  return (
    Boolean(userId) &&
    userId.length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(userId)
  );
}

/**
 * Update FR-managed master data fields (`status`, `joinedAt`, `offboardedAt`, `offboardReason`, `internalNotes`)
 * for an existing Crew / Alumni profile.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireSessionPermission('fr.write');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = await context.params;
  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const sanitized = sanitizeCrewMasterDataPayload(rawBody);
    if (!sanitized) {
      return NextResponse.json({ error: 'Invalid master data payload' }, { status: 400 });
    }

    const existing = await getCrewProfile(userId);
    if (!existing) {
      return NextResponse.json(
        { error: 'Crew master profile not found. Sync profiles from Keycloak first.' },
        { status: 404 }
      );
    }

    // Prevent status='offboarded' drift if user is still in wtf-crew; offboarding must go through DELETE /api/fr/crew/[userId]
    if (sanitized.status === 'offboarded' && existing.status !== 'offboarded') {
      return NextResponse.json(
        { error: 'Use the Offboard action to remove the user from wtf-crew.' },
        { status: 400 }
      );
    }

    // Re-activating an offboarded record must go through POST /api/fr/crew/[userId] so wtf-crew is re-added
    if (existing.status === 'offboarded' && sanitized.status && sanitized.status !== 'offboarded') {
      return NextResponse.json(
        { error: 'Use the Onboard / Re-Onboard action to re-add an offboarded member to wtf-crew.' },
        { status: 400 }
      );
    }

    const updated = await updateCrewMasterData(userId, sanitized, {
      userId: authResult.userId,
      username: authResult.username,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Crew master profile not found' }, { status: 404 });
    }

    const lifecycleEvents = await listCrewLifecycleEvents(userId);

    await recordAuditLog({
      category: 'fr',
      action: 'crew.master_data_updated',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'user',
      targetId: userId,
      targetLabel: updated.username,
      summary: `Updated master data for "${updated.username}" (status: ${updated.status})`,
      metadata: {
        previousStatus: existing.status,
        nextStatus: updated.status,
        joinedAt: updated.joinedAt,
        offboardedAt: updated.offboardedAt,
      },
    });

    return NextResponse.json({
      ok: true,
      crewProfile: updated,
      lifecycleEvents,
    });
  } catch (err) {
    console.error('[API] PUT /api/fr/crew/[userId]/master-data failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to update crew master data' }, { status: 500 });
  }
}
