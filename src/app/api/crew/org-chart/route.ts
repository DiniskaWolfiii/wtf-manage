import { NextResponse } from 'next/server';
import { listAllCrewAssignments, listDepartments } from '@/lib/crew';
import { getCrewProfileMap } from '@/lib/crew-profiles';
import { listKeycloakUsersMinimal } from '@/lib/keycloak';
import { requireSessionPermission } from '@/lib/server-auth';
import { getPortalSettings } from '@/lib/settings';
import { getSafeAvatarUrl } from '@/lib/validation';

export async function GET() {
  const authResult = await requireSessionPermission('crew.dashboard.view');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const [departments, assignments, profileMap, settings] = await Promise.all([
      listDepartments(),
      listAllCrewAssignments(),
      getCrewProfileMap(),
      getPortalSettings(),
    ]);

    const userMap = new Map<string, { username: string; avatarUrl?: string }>();
    for (const [userId, profile] of profileMap.entries()) {
      userMap.set(userId, {
        username: profile.username,
        avatarUrl: profile.avatarUrl,
      });
    }

    // Only hit Keycloak if any assigned crew member does not yet have a cached master profile
    const hasMissingProfile = assignments.some((a) => !userMap.has(a.userId));
    if (hasMissingProfile) {
      const kcUsers = await listKeycloakUsersMinimal();
      if (kcUsers) {
        for (const u of kcUsers) {
          if (!userMap.has(u.id)) {
            userMap.set(u.id, {
              username: u.username,
              avatarUrl: getSafeAvatarUrl(u.avatarUrl) ?? undefined,
            });
          }
        }
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

    const orgDepartments = departments
      .map((dept) => {
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
      })
      .filter((dept) => dept.members.length > 0);

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
