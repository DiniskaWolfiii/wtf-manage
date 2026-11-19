import { NextResponse } from 'next/server';
import { listAllCrewAssignments, listDepartments } from '@/lib/crew';
import { listKeycloakUsersMinimal } from '@/lib/keycloak';
import { requireSessionRole } from '@/lib/server-auth';
import { getPortalSettings } from '@/lib/settings';
import { getSafeAvatarUrl } from '@/lib/validation';

export async function GET() {
  const authResult = await requireSessionRole('crew');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const [departments, assignments, kcUsers, settings] = await Promise.all([
      listDepartments(),
      listAllCrewAssignments(),
      listKeycloakUsersMinimal(),
      getPortalSettings(),
    ]);

    const userMap = new Map<string, { username: string; avatarUrl?: string }>();
    if (kcUsers) {
      for (const u of kcUsers) {
        userMap.set(u.id, {
          username: u.username,
          avatarUrl: getSafeAvatarUrl(u.avatarUrl) ?? undefined,
        });
      }
    }

    const membersByDept = new Map<
      number,
      Array<{
        userId: string;
        username: string;
        avatarUrl?: string;
        position: string;
        sortOrder: number;
      }>
    >();

    const uniqueCrewIds = new Set<string>();

    for (const a of assignments) {
      uniqueCrewIds.add(a.userId);
      const userInfo = userMap.get(a.userId);
      const list = membersByDept.get(a.departmentId) ?? [];
      list.push({
        userId: a.userId,
        username: userInfo?.username ?? 'Unknown User',
        avatarUrl: userInfo?.avatarUrl,
        position: a.position,
        sortOrder: a.sortOrder,
      });
      membersByDept.set(a.departmentId, list);
    }

    const orgDepartments = departments.map((dept) => {
      const members = (membersByDept.get(dept.id) ?? []).sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.username.localeCompare(b.username);
      });
      return {
        id: dept.id,
        name: dept.name,
        parentDepartmentId: dept.parentDepartmentId,
        members,
      };
    });

    return NextResponse.json({
      conventionName: settings.conventionName,
      totalCrewMembers: uniqueCrewIds.size,
      departments: orgDepartments,
    });
  } catch (err) {
    console.error('[API] GET /api/crew/org-chart failed:', (err as Error).message);
    return NextResponse.json(
      { error: 'Failed to load org chart' },
      { status: 500 }
    );
  }
}
