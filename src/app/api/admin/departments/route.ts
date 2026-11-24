import { NextResponse } from 'next/server';
import { listAllCrewAssignments, listDepartments } from '@/lib/crew';
import { listKeycloakGroups } from '@/lib/keycloak';
import { requireSessionPermission } from '@/lib/server-auth';

export async function GET() {
  const authResult = await requireSessionPermission('admin.portal.manage');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const [departments, assignments, keycloakGroups] = await Promise.all([
      listDepartments(),
      listAllCrewAssignments(),
      listKeycloakGroups(),
    ]);

    const memberCounts = new Map<number, number>();
    for (const a of assignments) {
      memberCounts.set(a.departmentId, (memberCounts.get(a.departmentId) ?? 0) + 1);
    }

    return NextResponse.json({
      departments: departments.map((d) => ({
        ...d,
        memberCount: memberCounts.get(d.id) ?? 0,
      })),
      keycloakGroups: keycloakGroups ?? [],
      keycloakGroupsAvailable: keycloakGroups !== null,
    });
  } catch (err) {
    console.error('[API] GET /api/admin/departments failed:', (err as Error).message);
    return NextResponse.json(
      { error: 'Failed to load department mappings' },
      { status: 500 }
    );
  }
}
