import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import {
  deleteDepartment,
  getDepartmentById,
  getDepartmentMemberIds,
  updateDepartment,
  wouldCreateDepartmentCycle,
} from '@/lib/crew';
import { removeUserFromGroup } from '@/lib/keycloak';
import { requireSessionPermission } from '@/lib/server-auth';
import { sanitizeDepartmentName } from '@/lib/validation';

function parseDepartmentId(rawId: string): number | null {
  const num = Number(rawId);
  return Number.isInteger(num) && num > 0 ? num : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSessionPermission('fr.departments.manage');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id: rawId } = await context.params;
  const id = parseDepartmentId(rawId);
  if (!id) {
    return NextResponse.json({ error: 'Invalid department ID' }, { status: 400 });
  }

  try {
    const rawBody = (await request.json()) as {
      name?: unknown;
      parentDepartmentId?: unknown;
    };

    const updates: { name?: string; parentDepartmentId?: number | null } = {};

    if (rawBody?.name !== undefined) {
      const name = sanitizeDepartmentName(rawBody.name);
      if (!name) {
        return NextResponse.json(
          { error: 'Department name must be 1-80 characters' },
          { status: 400 }
        );
      }
      updates.name = name;
    }

    if (rawBody?.parentDepartmentId !== undefined) {
      if (rawBody.parentDepartmentId === null) {
        updates.parentDepartmentId = null;
      } else {
        if (
          typeof rawBody.parentDepartmentId !== 'number' ||
          !Number.isInteger(rawBody.parentDepartmentId) ||
          rawBody.parentDepartmentId <= 0
        ) {
          return NextResponse.json(
            { error: 'Invalid parentDepartmentId' },
            { status: 400 }
          );
        }
        const parent = await getDepartmentById(rawBody.parentDepartmentId);
        if (!parent) {
          return NextResponse.json(
            { error: 'Parent department not found' },
            { status: 400 }
          );
        }
        const createsCycle = await wouldCreateDepartmentCycle(id, parent.id);
        if (createsCycle) {
          return NextResponse.json(
            { error: 'A department cannot be placed under itself or its own sub-departments' },
            { status: 400 }
          );
        }
        updates.parentDepartmentId = parent.id;
      }
    }

    if (updates.name === undefined && updates.parentDepartmentId === undefined) {
      return NextResponse.json({ error: 'No valid update fields provided' }, { status: 400 });
    }

    const updated = await updateDepartment(id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Department not found' }, { status: 404 });
    }

    await recordAuditLog({
      category: 'fr',
      action: 'department.updated',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'department',
      targetId: String(updated.id),
      targetLabel: updated.name,
      summary: `Updated department "${updated.name}"`,
      metadata: updates,
    });

    return NextResponse.json({ department: updated });
  } catch (err) {
    const mysqlErr = err as { code?: string; message?: string };
    if (mysqlErr.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'A department with this name already exists' },
        { status: 409 }
      );
    }
    console.error('[API] PATCH /api/fr/departments/[id] failed:', mysqlErr.message);
    return NextResponse.json({ error: 'Failed to update department' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSessionPermission('fr.departments.manage');
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

    if (dept.keycloakGroupId) {
      const memberIds = await getDepartmentMemberIds(id);
      for (const userId of memberIds) {
        const removed = await removeUserFromGroup(userId, dept.keycloakGroupId);
        if (!removed) {
          return NextResponse.json(
            { error: 'Failed to remove members from mapped Keycloak group' },
            { status: 502 }
          );
        }
      }
    }

    await deleteDepartment(id);

    await recordAuditLog({
      category: 'fr',
      action: 'department.deleted',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'department',
      targetId: String(dept.id),
      targetLabel: dept.name,
      summary: `Deleted department "${dept.name}"`,
      metadata: { keycloakGroupName: dept.keycloakGroupName },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /api/fr/departments/[id] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to delete department' }, { status: 500 });
  }
}
