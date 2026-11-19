import { NextResponse } from 'next/server';
import { listAllCrewAssignments, listDepartments } from '@/lib/crew';
import {
  getGroupMemberIds,
  getKeycloakGroupByName,
  listKeycloakUsersMinimal,
} from '@/lib/keycloak';
import { requireSessionRole } from '@/lib/server-auth';
import { getSafeAvatarUrl } from '@/lib/validation';

const CREW_GROUP_NAME = 'wtf-crew';

export async function GET() {
  const authResult = await requireSessionRole('furry_ressources');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const [kcUsers, crewGroup, departments, assignments] = await Promise.all([
      listKeycloakUsersMinimal(),
      getKeycloakGroupByName(CREW_GROUP_NAME),
      listDepartments(),
      listAllCrewAssignments(),
    ]);

    if (!kcUsers) {
      return NextResponse.json(
        { error: 'Failed to load users from Keycloak' },
        { status: 502 }
      );
    }

    const crewMemberIds = crewGroup
      ? (await getGroupMemberIds(crewGroup.id)) ?? new Set<string>()
      : new Set<string>();

    const assignmentsByUser = new Map<
      string,
      Array<{ departmentId: number; departmentName: string; position: string }>
    >();
    for (const a of assignments) {
      const list = assignmentsByUser.get(a.userId) ?? [];
      list.push({
        departmentId: a.departmentId,
        departmentName: a.departmentName,
        position: a.position,
      });
      assignmentsByUser.set(a.userId, list);
    }

    const users = kcUsers.map((u) => ({
      id: u.id,
      username: u.username,
      avatarUrl: getSafeAvatarUrl(u.avatarUrl) ?? undefined,
      isCrew: crewMemberIds.has(u.id),
      roles: assignmentsByUser.get(u.id) ?? [],
    }));

    return NextResponse.json({
      crewGroupConfigured: Boolean(crewGroup),
      users,
      departments,
    });
  } catch (err) {
    console.error('[API] GET /api/fr/crew failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load FR crew data' }, { status: 500 });
  }
}
