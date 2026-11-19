import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import { getDepartmentById, updateDepartmentMemberOrder } from '@/lib/crew';
import { requireSessionRole } from '@/lib/server-auth';

function parseDepartmentId(rawId: string): number | null {
  const num = Number(rawId);
  return Number.isInteger(num) && num > 0 ? num : null;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSessionRole(['furry_ressources', 'furry_ressources_admin']);
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

    const rawBody = (await request.json()) as { userIds?: unknown };
    if (!Array.isArray(rawBody?.userIds) || rawBody.userIds.length > 500) {
      return NextResponse.json({ error: 'Invalid userIds array' }, { status: 400 });
    }

    const userIds: string[] = [];
    const seen = new Set<string>();
    for (const item of rawBody.userIds) {
      if (
        typeof item !== 'string' ||
        !item ||
        item.length > 64 ||
        !/^[a-zA-Z0-9_-]+$/.test(item) ||
        seen.has(item)
      ) {
        return NextResponse.json({ error: 'Invalid user ID in userIds' }, { status: 400 });
      }
      seen.add(item);
      userIds.push(item);
    }

    await updateDepartmentMemberOrder(id, userIds);

    await recordAuditLog({
      category: 'fr',
      action: 'department.order_updated',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'department',
      targetId: String(dept.id),
      targetLabel: dept.name,
      summary: `Updated member ranking in "${dept.name}" (${userIds.length} member(s))`,
      metadata: { orderedUserIds: userIds },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API] PUT /api/fr/departments/[id]/order failed:', (err as Error).message);
    return NextResponse.json(
      { error: 'Failed to update member order' },
      { status: 500 }
    );
  }
}
