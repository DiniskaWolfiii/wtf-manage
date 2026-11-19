import { NextResponse } from 'next/server';
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
import { requireSessionRole } from '@/lib/server-auth';
import { getSafeAvatarUrl, sanitizeCrewAssignmentsPayload } from '@/lib/validation';

const CREW_GROUP_NAME = 'wtf-crew';

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
  const authResult = await requireSessionRole('furry_ressources');
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

    const [profile, roles] = await Promise.all([
      fetchKeycloakUser(userId),
      getCrewRolesForUser(userId),
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
  const authResult = await requireSessionRole('furry_ressources');
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
  const authResult = await requireSessionRole('furry_ressources');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = await context.params;
  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    const rawBody = await request.json();
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

    for (const groupId of nextGroupIds) {
      if (!previousGroupIds.has(groupId)) {
        const added = await addUserToGroup(userId, groupId);
        if (!added) {
          return NextResponse.json(
            { error: 'Failed to sync mapped Keycloak department group' },
            { status: 502 }
          );
        }
      }
    }

    for (const groupId of previousGroupIds) {
      if (!nextGroupIds.has(groupId)) {
        const removed = await removeUserFromGroup(userId, groupId);
        if (!removed) {
          return NextResponse.json(
            { error: 'Failed to remove old Keycloak department group' },
            { status: 502 }
          );
        }
      }
    }

    await replaceUserCrewAssignments(userId, assignments);
    const updatedRoles = await getCrewRolesForUser(userId);

    return NextResponse.json({ ok: true, roles: updatedRoles });
  } catch (err) {
    console.error('[API] PUT /api/fr/crew/[userId] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to update crew roles' }, { status: 500 });
  }
}

/**
 * Demote a crew member: removes `wtf-crew`, removes all mapped department Keycloak groups,
 * and deletes all department assignments in MySQL.
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireSessionRole('furry_ressources');
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

    if (crewGroup) {
      const removedCrew = await removeUserFromGroup(userId, crewGroup.id);
      if (!removedCrew) {
        return NextResponse.json(
          { error: 'Failed to remove user from wtf-crew in Keycloak' },
          { status: 502 }
        );
      }
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

    await deleteAllUserCrewAssignments(userId);

    return NextResponse.json({ ok: true, isCrew: false, roles: [] });
  } catch (err) {
    console.error('[API] DELETE /api/fr/crew/[userId] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to demote user' }, { status: 500 });
  }
}
