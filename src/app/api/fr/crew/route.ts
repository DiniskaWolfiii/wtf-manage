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
const FR_ANY_ROLES = ['furry_ressources', 'furry_ressources_admin'];

export async function GET() {
  const authResult = await requireSessionRole(FR_ANY_ROLES);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const isFrAdmin = authResult.roles.includes('furry_ressources_admin');

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
      Array<{ departmentId: number; departmentName: string; position: string; sortOrder: number }>
    >();
    for (const a of assignments) {
      const list = assignmentsByUser.get(a.userId) ?? [];
      list.push({
        departmentId: a.departmentId,
        departmentName: a.departmentName,
        position: a.position,
        sortOrder: a.sortOrder,
      });
      assignmentsByUser.set(a.userId, list);
    }

    const allUsers = kcUsers.map((u) => ({
      id: u.id,
      username: u.username,
      avatarUrl: getSafeAvatarUrl(u.avatarUrl) ?? undefined,
      isCrew: crewMemberIds.has(u.id),
      roles: assignmentsByUser.get(u.id) ?? [],
    }));

    // Standard FR only receives active crew members; FR Admin also sees non-crew users for promotion
    const users = isFrAdmin ? allUsers : allUsers.filter((u) => u.isCrew);

    return NextResponse.json({
      crewGroupConfigured: Boolean(crewGroup),
      isFrAdmin,
      users,
      departments,
    });
  } catch (err) {
    console.error('[API] GET /api/fr/crew failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load FR crew data' }, { status: 500 });
  }
}
