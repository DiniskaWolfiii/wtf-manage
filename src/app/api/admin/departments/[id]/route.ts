import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import {
  getDepartmentById,
  getDepartmentMemberIds,
  updateDepartmentKeycloakMapping,
} from '@/lib/crew';
import { addUserToGroup, listKeycloakGroups } from '@/lib/keycloak';
import { requireSessionPermission } from '@/lib/server-auth';

function parseDepartmentId(rawId: string): number | null {
  const num = Number(rawId);
  return Number.isInteger(num) && num > 0 ? num : null;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSessionPermission('admin.portal.manage');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id: rawId } = await context.params;
  const id = parseDepartmentId(rawId);
  if (!id) {
    return NextResponse.json({ error: 'Invalid department ID' }, { status: 400 });
  }

  try {
    const dept = await getDepartmentById(id);
    if (!dept) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    const rawBody = (await request.json()) as {
      keycloakGroupId?: unknown;
      syncMembers?: unknown;
    };

    const rawGroupId = rawBody?.keycloakGroupId;
    const syncMembers = rawBody?.syncMembers === true;

    if (rawGroupId === null || rawGroupId === '') {
      const updated = await updateDepartmentKeycloakMapping(id, null, null);
      await recordAuditLog({
        category: 'admin',
        action: 'department.keycloak_mapped',
        actorUserId: authResult.userId,
        actorUsername: authResult.username,
        targetType: 'department',
        targetId: String(dept.id),
        targetLabel: dept.name,
        summary: `Removed Keycloak group mapping for "${dept.name}"`,
        metadata: { keycloakGroupId: null, keycloakGroupName: null },
      });
      return NextResponse.json({ department: updated, syncedCount: 0 });
    }

    if (typeof rawGroupId !== 'string' || !rawGroupId.trim()) {
      return NextResponse.json({ error: 'Invalid keycloakGroupId' }, { status: 400 });
    }

    const groups = await listKeycloakGroups();
    if (!groups) {
      return NextResponse.json(
        { error: 'Failed to verify Keycloak groups' },
        { status: 502 }
      );
    }

    const matchedGroup = groups.find((g) => g.id === rawGroupId.trim());
    if (!matchedGroup) {
      return NextResponse.json(
        { error: 'Selected Keycloak group does not exist' },
        { status: 400 }
      );
    }

    const updated = await updateDepartmentKeycloakMapping(
      id,
      matchedGroup.id,
      matchedGroup.name
    );

    let syncedCount = 0;
    if (syncMembers) {
      const memberIds = await getDepartmentMemberIds(id);
      for (const userId of memberIds) {
        const ok = await addUserToGroup(userId, matchedGroup.id);
        if (ok) {
          syncedCount += 1;
        }
      }
    }

    await recordAuditLog({
      category: 'admin',
      action: 'department.keycloak_mapped',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'department',
      targetId: String(dept.id),
      targetLabel: dept.name,
      summary: `Mapped department "${dept.name}" to Keycloak group "${matchedGroup.name}"`,
      metadata: {
        keycloakGroupId: matchedGroup.id,
        keycloakGroupName: matchedGroup.name,
        syncMembers,
        syncedCount,
      },
    });

    return NextResponse.json({ department: updated, syncedCount });
  } catch (err) {
    console.error('[API] PUT /api/admin/departments/[id] failed:', (err as Error).message);
    return NextResponse.json(
      { error: 'Failed to update department mapping' },
      { status: 500 }
    );
  }
}
