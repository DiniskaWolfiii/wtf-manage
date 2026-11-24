import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import { listAllCrewAssignments, listDepartments } from '@/lib/crew';
import {
  getCrewProfileMap,
  syncAllActiveCrewProfilesFromKeycloak,
  type CrewStatus,
} from '@/lib/crew-profiles';
import {
  getGroupMemberIds,
  getKeycloakGroupByName,
  listKeycloakUsersMinimal,
} from '@/lib/keycloak';
import { requireSessionPermission } from '@/lib/server-auth';
import { listAllCrewSkills, listSkills } from '@/lib/skills';
import { getSafeAvatarUrl } from '@/lib/validation';

const CREW_GROUP_NAME = 'wtf-crew';
const FR_READ_PERMS = ['fr.read', 'fr.write'] as const;

export async function GET() {
  const authResult = await requireSessionPermission([...FR_READ_PERMS]);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const isFrAdmin = authResult.permissions.includes('fr.write');

  try {
    const [kcUsers, crewGroup, departments, assignments, skillsCatalog, crewSkills, profileMap] =
      await Promise.all([
        listKeycloakUsersMinimal(),
        getKeycloakGroupByName(CREW_GROUP_NAME),
        listDepartments(),
        listAllCrewAssignments(),
        listSkills(),
        listAllCrewSkills(),
        getCrewProfileMap(),
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

    const skillsByUser = new Map<
      string,
      Array<{ skillId: number; skillName: string; category: string; level: string }>
    >();
    for (const s of crewSkills) {
      const list = skillsByUser.get(s.userId) ?? [];
      list.push({
        skillId: s.skillId,
        skillName: s.skillName,
        category: s.category,
        level: s.level,
      });
      skillsByUser.set(s.userId, list);
    }

    const seenUserIds = new Set<string>();
    const allUsers = kcUsers.map((u) => {
      seenUserIds.add(u.id);
      const isCrew = crewMemberIds.has(u.id);
      const master = profileMap.get(u.id);
      const status: CrewStatus | null = master
        ? master.status
        : isCrew
        ? 'active'
        : null;

      return {
        id: u.id,
        username: master?.username || u.username,
        avatarUrl: getSafeAvatarUrl(u.avatarUrl) ?? master?.avatarUrl ?? undefined,
        isCrew,
        status,
        joinedAt: master?.joinedAt ?? null,
        offboardedAt: master?.offboardedAt ?? null,
        hasMasterProfile: Boolean(master),
        roles: assignmentsByUser.get(u.id) ?? [],
        skills: skillsByUser.get(u.id) ?? [],
      };
    });

    // Include Alumni / offboarded master profiles whose Keycloak account may no longer be returned
    for (const master of profileMap.values()) {
      if (seenUserIds.has(master.userId)) continue;
      allUsers.push({
        id: master.userId,
        username: master.username,
        avatarUrl: master.avatarUrl,
        isCrew: false,
        status: master.status,
        joinedAt: master.joinedAt,
        offboardedAt: master.offboardedAt,
        hasMasterProfile: true,
        roles: assignmentsByUser.get(master.userId) ?? [],
        skills: skillsByUser.get(master.userId) ?? [],
      });
    }

    // Standard FR sees active Crew + stored master profiles (including on_leave & offboarded Alumni);
    // FR Admin also sees non-crew Keycloak users for promotion.
    const users = isFrAdmin
      ? allUsers
      : allUsers.filter((u) => u.isCrew || u.hasMasterProfile);

    return NextResponse.json({
      crewGroupConfigured: Boolean(crewGroup),
      isFrAdmin,
      users,
      departments,
      skillsCatalog,
    });
  } catch (err) {
    console.error('[API] GET /api/fr/crew failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load FR crew data' }, { status: 500 });
  }
}

/**
 * Sync / backfill all active `wtf-crew` members from Keycloak into `crew_profiles`.
 */
export async function POST() {
  const authResult = await requireSessionPermission('fr.write');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const [kcUsers, crewGroup] = await Promise.all([
      listKeycloakUsersMinimal(),
      getKeycloakGroupByName(CREW_GROUP_NAME),
    ]);

    if (!kcUsers) {
      return NextResponse.json(
        { error: 'Failed to load users from Keycloak' },
        { status: 502 }
      );
    }
    if (!crewGroup) {
      return NextResponse.json(
        { error: `Keycloak group "${CREW_GROUP_NAME}" was not found` },
        { status: 500 }
      );
    }

    const crewMemberIds = (await getGroupMemberIds(crewGroup.id)) ?? new Set<string>();
    const result = await syncAllActiveCrewProfilesFromKeycloak(kcUsers, crewMemberIds, {
      userId: authResult.userId,
      username: authResult.username,
    });

    await recordAuditLog({
      category: 'fr',
      action: 'crew.profiles_synced',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'user',
      targetId: null,
      targetLabel: CREW_GROUP_NAME,
      summary: `Synced crew master profiles from Keycloak (${result.created} created, ${result.updated} updated)`,
      metadata: result,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[API] POST /api/fr/crew failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to sync crew profiles' }, { status: 500 });
  }
}
