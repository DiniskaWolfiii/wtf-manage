import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import {
  deleteAllUserCrewAssignments,
  getCrewRolesForUser,
  getMappedGroupIdsForUser,
  listDepartments,
  replaceUserCrewAssignments,
} from '@/lib/crew';
import {
  addUserToGroup,
  fetchKeycloakUser,
  getGroupMemberIds,
  getKeycloakGroupByName,
  removeUserFromGroup,
} from '@/lib/keycloak';
import {
  deleteAllUserCrewSkills,
  getCrewSkillsForUser,
  listSkills,
  replaceUserCrewSkills,
} from '@/lib/skills';
import { requireSessionRole } from '@/lib/server-auth';
import {
  getSafeAvatarUrl,
  sanitizeCrewAssignmentsPayload,
  sanitizeCrewSkillsPayload,
} from '@/lib/validation';

const CREW_GROUP_NAME = 'wtf-crew';
const FR_ANY_ROLES = ['furry_ressources', 'furry_ressources_admin'];

function isValidUserId(userId: string): boolean {
  return (
    Boolean(userId) &&
    userId.length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(userId)
  );
}

/**
 * Fetch full profile details + crew roles for an active Crew member.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireSessionRole(FR_ANY_ROLES);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = await context.params;
  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    const crewGroup = await getKeycloakGroupByName(CREW_GROUP_NAME);
    if (!crewGroup) {
      return NextResponse.json(
        { error: `Keycloak group "${CREW_GROUP_NAME}" was not found` },
        { status: 500 }
      );
    }

    const crewMembers = await getGroupMemberIds(crewGroup.id);
    if (!crewMembers || !crewMembers.has(userId)) {
      return NextResponse.json(
        { error: 'Profile view is only available for active Crew members' },
        { status: 403 }
      );
    }

    const [profile, roles, skills] = await Promise.all([
      fetchKeycloakUser(userId),
      getCrewRolesForUser(userId),
      getCrewSkillsForUser(userId),
    ]);

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    return NextResponse.json({
      profile: {
        ...profile,
        avatarUrl: getSafeAvatarUrl(profile.avatarUrl) ?? undefined,
      },
      roles,
      skills,
    });
  } catch (err) {
    console.error('[API] GET /api/fr/crew/[userId] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load crew profile' }, { status: 500 });
  }
}

/**
 * Promote a Keycloak user to Crew by adding them to `wtf-crew`.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireSessionRole('furry_ressources_admin');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = await context.params;
  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    const crewGroup = await getKeycloakGroupByName(CREW_GROUP_NAME);
    if (!crewGroup) {
      return NextResponse.json(
        { error: `Keycloak group "${CREW_GROUP_NAME}" was not found` },
        { status: 500 }
      );
    }

    const ok = await addUserToGroup(userId, crewGroup.id);
    if (!ok) {
      return NextResponse.json(
        { error: 'Failed to add user to wtf-crew in Keycloak' },
        { status: 502 }
      );
    }

    const targetProfile = await fetchKeycloakUser(userId);
    const targetLabel = targetProfile?.username || userId;
    await recordAuditLog({
      category: 'fr',
      action: 'crew.promote',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'user',
      targetId: userId,
      targetLabel,
      summary: `Promoted "${targetLabel}" to Crew (wtf-crew)`,
      metadata: { groupName: CREW_GROUP_NAME },
    });

    return NextResponse.json({ ok: true, isCrew: true });
  } catch (err) {
    console.error('[API] POST /api/fr/crew/[userId] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to promote user' }, { status: 500 });
  }
}

/**
 * Replace a promoted crew member's department + position assignments
 * and sync any admin-mapped Keycloak department groups.
 */
export async function PUT(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireSessionRole(FR_ANY_ROLES);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = await context.params;
  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const assignments = sanitizeCrewAssignmentsPayload(rawBody);
    if (!assignments) {
      return NextResponse.json({ error: 'Invalid assignments payload' }, { status: 400 });
    }

    const crewGroup = await getKeycloakGroupByName(CREW_GROUP_NAME);
    if (!crewGroup) {
      return NextResponse.json(
        { error: `Keycloak group "${CREW_GROUP_NAME}" was not found` },
        { status: 500 }
      );
    }

    const crewMembers = await getGroupMemberIds(crewGroup.id);
    if (!crewMembers || !crewMembers.has(userId)) {
      return NextResponse.json(
        { error: 'User must be promoted to Crew before assigning departments' },
        { status: 400 }
      );
    }

    const allDepartments = await listDepartments();
    const deptMap = new Map(allDepartments.map((d) => [d.id, d]));
    for (const item of assignments) {
      if (!deptMap.has(item.departmentId)) {
        return NextResponse.json(
          { error: `Department ${item.departmentId} does not exist` },
          { status: 400 }
        );
      }
    }

    const previousGroupIds = new Set(await getMappedGroupIdsForUser(userId));
    const nextGroupIds = new Set<string>();
    for (const item of assignments) {
      const dept = deptMap.get(item.departmentId);
      if (dept?.keycloakGroupId) {
        nextGroupIds.add(dept.keycloakGroupId);
      }
    }

    const addedGroups: string[] = [];
    for (const groupId of nextGroupIds) {
      if (!previousGroupIds.has(groupId)) {
        const added = await addUserToGroup(userId, groupId);
        if (!added) {
          await Promise.allSettled(addedGroups.map((gid) => removeUserFromGroup(userId, gid)));
          return NextResponse.json(
            { error: 'Failed to sync mapped Keycloak department group' },
            { status: 502 }
          );
        }
        addedGroups.push(groupId);
      }
    }

    const removedGroups: string[] = [];
    for (const groupId of previousGroupIds) {
      if (!nextGroupIds.has(groupId)) {
        const removed = await removeUserFromGroup(userId, groupId);
        if (!removed) {
          await Promise.allSettled([
            ...addedGroups.map((gid) => removeUserFromGroup(userId, gid)),
            ...removedGroups.map((gid) => addUserToGroup(userId, gid)),
          ]);
          return NextResponse.json(
            { error: 'Failed to remove old Keycloak department group' },
            { status: 502 }
          );
        }
        removedGroups.push(groupId);
      }
    }

    await replaceUserCrewAssignments(userId, assignments);
    const [updatedRoles, targetProfile] = await Promise.all([
      getCrewRolesForUser(userId),
      fetchKeycloakUser(userId),
    ]);
    const targetLabel = targetProfile?.username || userId;

    await recordAuditLog({
      category: 'fr',
      action: 'crew.roles_updated',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'user',
      targetId: userId,
      targetLabel,
      summary: `Updated crew roles for "${targetLabel}" (${updatedRoles.length} department(s))`,
      metadata: {
        roles: updatedRoles.map((r) => ({
          departmentId: r.departmentId,
          departmentName: r.departmentName,
          position: r.position,
        })),
      },
    });

    return NextResponse.json({ ok: true, roles: updatedRoles });
  } catch (err) {
    console.error('[API] PUT /api/fr/crew/[userId] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to update crew roles' }, { status: 500 });
  }
}

/**
 * Replace a promoted crew member's FR-managed skills + levels.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireSessionRole(FR_ANY_ROLES);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = await context.params;
  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const skillsPayload = sanitizeCrewSkillsPayload(rawBody);
    if (!skillsPayload) {
      return NextResponse.json({ error: 'Invalid skills payload' }, { status: 400 });
    }

    const crewGroup = await getKeycloakGroupByName(CREW_GROUP_NAME);
    if (!crewGroup) {
      return NextResponse.json(
        { error: `Keycloak group "${CREW_GROUP_NAME}" was not found` },
        { status: 500 }
      );
    }

    const crewMembers = await getGroupMemberIds(crewGroup.id);
    if (!crewMembers || !crewMembers.has(userId)) {
      return NextResponse.json(
        { error: 'User must be promoted to Crew before assigning skills' },
        { status: 400 }
      );
    }

    const catalog = await listSkills();
    const skillMap = new Map(catalog.map((s) => [s.id, s]));
    for (const item of skillsPayload) {
      const def = skillMap.get(item.skillId);
      if (!def) {
        return NextResponse.json(
          { error: `Skill ${item.skillId} does not exist` },
          { status: 400 }
        );
      }
      if (!def.levels.includes(item.level)) {
        return NextResponse.json(
          { error: `Invalid level "${item.level}" for skill "${def.name}"` },
          { status: 400 }
        );
      }
    }

    const previousSkills = await getCrewSkillsForUser(userId);
    await replaceUserCrewSkills(userId, skillsPayload, authResult.userId);
    const [updatedSkills, targetProfile] = await Promise.all([
      getCrewSkillsForUser(userId),
      fetchKeycloakUser(userId),
    ]);
    const targetLabel = targetProfile?.username || userId;

    await recordAuditLog({
      category: 'fr',
      action: 'crew.skills_updated',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'user',
      targetId: userId,
      targetLabel,
      summary: `Updated crew skills for "${targetLabel}" (${updatedSkills.length} skill(s))`,
      metadata: {
        previous: previousSkills.map((s) => ({
          skillId: s.skillId,
          skillName: s.skillName,
          level: s.level,
        })),
        next: updatedSkills.map((s) => ({
          skillId: s.skillId,
          skillName: s.skillName,
          level: s.level,
        })),
      },
    });

    return NextResponse.json({ ok: true, skills: updatedSkills });
  } catch (err) {
    console.error('[API] PATCH /api/fr/crew/[userId] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to update crew skills' }, { status: 500 });
  }
}

/**
 * Demote a crew member: removes `wtf-crew`, removes all mapped department Keycloak groups,
 * and deletes all department & skill assignments in MySQL.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireSessionRole('furry_ressources_admin');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = await context.params;
  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    const [crewGroup, mappedGroupIds] = await Promise.all([
      getKeycloakGroupByName(CREW_GROUP_NAME),
      getMappedGroupIdsForUser(userId),
    ]);

    if (!crewGroup) {
      return NextResponse.json(
        { error: `Keycloak group "${CREW_GROUP_NAME}" was not found` },
        { status: 500 }
      );
    }

    const removedCrew = await removeUserFromGroup(userId, crewGroup.id);
    if (!removedCrew) {
      return NextResponse.json(
        { error: 'Failed to remove user from wtf-crew in Keycloak' },
        { status: 502 }
      );
    }

    for (const groupId of mappedGroupIds) {
      const removedGroup = await removeUserFromGroup(userId, groupId);
      if (!removedGroup) {
        return NextResponse.json(
          { error: 'Failed to remove mapped department group in Keycloak' },
          { status: 502 }
        );
      }
    }

    const targetProfile = await fetchKeycloakUser(userId);
    const targetLabel = targetProfile?.username || userId;

    await Promise.all([
      deleteAllUserCrewAssignments(userId),
      deleteAllUserCrewSkills(userId),
    ]);

    await recordAuditLog({
      category: 'fr',
      action: 'crew.demote',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'user',
      targetId: userId,
      targetLabel,
      summary: `Demoted "${targetLabel}" from Crew (removed wtf-crew & all assignments)`,
      metadata: { removedMappedGroupCount: mappedGroupIds.length },
    });

    return NextResponse.json({ ok: true, isCrew: false, roles: [] });
  } catch (err) {
    console.error('[API] DELETE /api/fr/crew/[userId] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to demote user' }, { status: 500 });
  }
}
