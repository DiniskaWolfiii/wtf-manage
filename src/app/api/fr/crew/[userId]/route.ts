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
  addCrewLifecycleEvent,
  getCrewProfile,
  listCrewLifecycleEvents,
  markCrewProfileOffboarded,
  refreshCrewProfileKeycloakSnapshot,
  upsertCrewProfileOnPromote,
} from '@/lib/crew-profiles';
import {
  addUserToGroup,
  fetchKeycloakUser,
  getGroupMemberIds,
  getKeycloakGroupByName,
  removeUserFromGroup,
} from '@/lib/keycloak';
import { getCrewOnboardingGroup } from '@/lib/permissions';
import { requireSessionPermission } from '@/lib/server-auth';
import {
  deleteAllUserCrewSkills,
  getCrewSkillsForUser,
  listSkills,
  replaceUserCrewSkills,
} from '@/lib/skills';
import {
  getSafeAvatarUrl,
  sanitizeCrewAssignmentsPayload,
  sanitizeCrewSkillsPayload,
  sanitizeOffboardPayload,
} from '@/lib/validation';

const FR_READ_PERMS = ['fr.crew.view', 'fr.crew.manage'] as const;

function isValidUserId(userId: string): boolean {
  return (
    Boolean(userId) &&
    userId.length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(userId)
  );
}

function describeRoleChanges(
  previousRoles: Array<{ departmentId: number; departmentName: string; position: string }>,
  updatedRoles: Array<{ departmentId: number; departmentName: string; position: string }>
): string | null {
  const prevMap = new Map(previousRoles.map((r) => [r.departmentId, r]));
  const nextMap = new Map(updatedRoles.map((r) => [r.departmentId, r]));
  const changes: string[] = [];

  for (const r of updatedRoles) {
    const prev = prevMap.get(r.departmentId);
    if (!prev) {
      changes.push(r.position ? `Added to ${r.departmentName} (${r.position})` : `Added to ${r.departmentName}`);
    } else if ((prev.position || '') !== (r.position || '')) {
      changes.push(
        `Updated ${r.departmentName}: ${prev.position || 'Crew Member'} → ${r.position || 'Crew Member'}`
      );
    }
  }

  for (const prev of previousRoles) {
    if (!nextMap.has(prev.departmentId)) {
      changes.push(`Removed from ${prev.departmentName}`);
    }
  }

  return changes.length > 0 ? changes.join('; ') : null;
}

function describeSkillChanges(
  previousSkills: Array<{ skillId: number; skillName: string; level: string }>,
  updatedSkills: Array<{ skillId: number; skillName: string; level: string }>
): string | null {
  const prevMap = new Map(previousSkills.map((s) => [s.skillId, s]));
  const nextMap = new Map(updatedSkills.map((s) => [s.skillId, s]));
  const changes: string[] = [];

  for (const s of updatedSkills) {
    const prev = prevMap.get(s.skillId);
    if (!prev) {
      changes.push(`Added skill ${s.skillName} (${s.level})`);
    } else if (prev.level !== s.level) {
      changes.push(`Updated skill ${s.skillName}: ${prev.level} → ${s.level}`);
    }
  }

  for (const prev of previousSkills) {
    if (!nextMap.has(prev.skillId)) {
      changes.push(`Removed skill ${prev.skillName}`);
    }
  }

  return changes.length > 0 ? changes.join('; ') : null;
}

/**
 * Fetch full profile details, FR master data, lifecycle timeline, roles & skills
 * for an active Crew member or stored master-data profile (On Leave / Alumni).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireSessionPermission([...FR_READ_PERMS]);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = await context.params;
  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    const crewGroupIdentifier = await getCrewOnboardingGroup();
    const [crewGroup, existingMaster, roles, skills, lifecycleEvents, departments, skillsCatalog] =
      await Promise.all([
        crewGroupIdentifier ? getKeycloakGroupByName(crewGroupIdentifier) : Promise.resolve(null),
        getCrewProfile(userId),
        getCrewRolesForUser(userId),
        getCrewSkillsForUser(userId),
        listCrewLifecycleEvents(userId),
        listDepartments(),
        listSkills(),
      ]);

    const crewMembers = crewGroup ? await getGroupMemberIds(crewGroup.id) : null;
    const isCrew = Boolean(crewMembers && crewMembers.has(userId));

    if (!isCrew && !existingMaster) {
      return NextResponse.json(
        { error: 'Profile view is only available for Crew members or offboarded records' },
        { status: 403 }
      );
    }

    const kcProfile = await fetchKeycloakUser(userId);
    let masterProfile = existingMaster;
    if (kcProfile && existingMaster) {
      masterProfile = (await refreshCrewProfileKeycloakSnapshot(kcProfile)) ?? existingMaster;
    }

    if (!kcProfile && !masterProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const profile = kcProfile
      ? {
          ...kcProfile,
          avatarUrl: getSafeAvatarUrl(kcProfile.avatarUrl) ?? undefined,
        }
      : {
          id: masterProfile!.userId,
          username: masterProfile!.username,
          firstName: masterProfile!.firstName,
          lastName: masterProfile!.lastName,
          email: masterProfile!.email,
          nickname: masterProfile!.nickname || masterProfile!.username,
          telegram: masterProfile!.telegram,
          species: masterProfile!.species,
          pronouns: masterProfile!.pronouns,
          phone: masterProfile!.phone,
          street: '',
          zip: '',
          city: '',
          country: '',
          dob: '',
          avatarUrl: masterProfile!.avatarUrl,
        };

    return NextResponse.json({
      isCrew,
      isFrAdmin: authResult.permissions.includes('fr.crew.manage'),
      profile,
      crewProfile: masterProfile,
      lifecycleEvents,
      roles,
      skills,
      departments,
      skillsCatalog,
    });
  } catch (err) {
    console.error('[API] GET /api/fr/crew/[userId] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load crew profile' }, { status: 500 });
  }
}

/**
 * Promote a Keycloak user to Crew by adding them to `wtf-crew`
 * and creating/reactivating their central `crew_profiles` master record.
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireSessionPermission('fr.crew.manage');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = await context.params;
  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  try {
    const crewGroupIdentifier = await getCrewOnboardingGroup();
    if (!crewGroupIdentifier) {
      return NextResponse.json(
        { error: 'Crew onboarding group is not configured in Admin → Permissions.' },
        { status: 400 }
      );
    }

    const crewGroup = await getKeycloakGroupByName(crewGroupIdentifier);
    if (!crewGroup) {
      return NextResponse.json(
        { error: `Keycloak group "${crewGroupIdentifier}" was not found` },
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

    const { isRejoin } = await upsertCrewProfileOnPromote(
      targetProfile ?? {
        id: userId,
        username: userId,
        firstName: '',
        lastName: '',
        email: '',
        nickname: userId,
        telegram: '',
        species: '',
        pronouns: '',
        phone: '',
        street: '',
        zip: '',
        city: '',
        country: '',
        dob: '',
      },
      { userId: authResult.userId, username: authResult.username }
    );

    await recordAuditLog({
      category: 'fr',
      action: 'crew.promote',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'user',
      targetId: userId,
      targetLabel,
      summary: isRejoin
        ? `Re-onboarded "${targetLabel}" to Crew (wtf-crew)`
        : `Onboarded "${targetLabel}" to Crew (wtf-crew)`,
      metadata: { groupName: crewGroupIdentifier, isRejoin },
    });

    return NextResponse.json({ ok: true, isCrew: true, isRejoin });
  } catch (err) {
    console.error('[API] POST /api/fr/crew/[userId] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to onboard user' }, { status: 500 });
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
  const authResult = await requireSessionPermission('fr.crew.manage');
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

    const crewGroupIdentifier = await getCrewOnboardingGroup();
    if (!crewGroupIdentifier) {
      return NextResponse.json(
        { error: 'Crew onboarding group is not configured in Admin → Permissions.' },
        { status: 400 }
      );
    }

    const crewGroup = await getKeycloakGroupByName(crewGroupIdentifier);
    if (!crewGroup) {
      return NextResponse.json(
        { error: `Keycloak group "${crewGroupIdentifier}" was not found` },
        { status: 500 }
      );
    }

    const crewMembers = await getGroupMemberIds(crewGroup.id);
    if (!crewMembers || !crewMembers.has(userId)) {
      return NextResponse.json(
        { error: 'User must be onboarded to Crew before assigning departments' },
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

    const previousRoles = await getCrewRolesForUser(userId);
    await replaceUserCrewAssignments(userId, assignments);
    const [updatedRoles, targetProfile, existingMaster] = await Promise.all([
      getCrewRolesForUser(userId),
      fetchKeycloakUser(userId),
      getCrewProfile(userId),
    ]);
    const targetLabel = targetProfile?.username || userId;

    if (existingMaster) {
      const roleSummary = describeRoleChanges(previousRoles, updatedRoles);
      if (roleSummary) {
        await addCrewLifecycleEvent({
          userId,
          eventType: 'roles_updated',
          actorUserId: authResult.userId,
          actorUsername: authResult.username,
          note: roleSummary,
          metadata: {
            previous: previousRoles.map((r) => ({
              departmentId: r.departmentId,
              departmentName: r.departmentName,
              position: r.position,
            })),
            roles: updatedRoles.map((r) => ({
              departmentId: r.departmentId,
              departmentName: r.departmentName,
              position: r.position,
            })),
          },
        });
      }
    }

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
  const authResult = await requireSessionPermission('fr.crew.manage');
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

    const crewGroupIdentifier = await getCrewOnboardingGroup();
    if (!crewGroupIdentifier) {
      return NextResponse.json(
        { error: 'Crew onboarding group is not configured in Admin → Permissions.' },
        { status: 400 }
      );
    }

    const crewGroup = await getKeycloakGroupByName(crewGroupIdentifier);
    if (!crewGroup) {
      return NextResponse.json(
        { error: `Keycloak group "${crewGroupIdentifier}" was not found` },
        { status: 500 }
      );
    }

    const crewMembers = await getGroupMemberIds(crewGroup.id);
    if (!crewMembers || !crewMembers.has(userId)) {
      return NextResponse.json(
        { error: 'User must be onboarded to Crew before assigning skills' },
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
    const [updatedSkills, targetProfile, existingMaster] = await Promise.all([
      getCrewSkillsForUser(userId),
      fetchKeycloakUser(userId),
      getCrewProfile(userId),
    ]);
    const targetLabel = targetProfile?.username || userId;

    if (existingMaster) {
      const skillSummary = describeSkillChanges(previousSkills, updatedSkills);
      if (skillSummary) {
        await addCrewLifecycleEvent({
          userId,
          eventType: 'skills_updated',
          actorUserId: authResult.userId,
          actorUsername: authResult.username,
          note: skillSummary,
        });
      }
    }

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
 * Demote / Offboard a crew member: removes `wtf-crew` and mapped department Keycloak groups,
 * deletes active department & skill assignments, and marks `crew_profiles` as `offboarded` (Alumni).
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ userId: string }> }
) {
  const authResult = await requireSessionPermission('fr.crew.manage');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { userId } = await context.params;
  if (!isValidUserId(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }
  if (userId === authResult.userId) {
    return NextResponse.json({ error: 'Cannot offboard your own account' }, { status: 400 });
  }

  try {
    const rawBody = await request.json().catch(() => null);
    const { reason } = sanitizeOffboardPayload(rawBody);

    const crewGroupIdentifier = await getCrewOnboardingGroup();
    if (!crewGroupIdentifier) {
      return NextResponse.json(
        { error: 'Crew onboarding group is not configured in Admin → Permissions.' },
        { status: 400 }
      );
    }

    const [crewGroup, mappedGroupIds, previousRoles] = await Promise.all([
      getKeycloakGroupByName(crewGroupIdentifier),
      getMappedGroupIdsForUser(userId),
      getCrewRolesForUser(userId),
    ]);

    if (!crewGroup) {
      return NextResponse.json(
        { error: `Keycloak group "${crewGroupIdentifier}" was not found` },
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
      markCrewProfileOffboarded(userId, {
        reason,
        actorUserId: authResult.userId,
        actorUsername: authResult.username,
        metadata: {
          removedMappedGroupCount: mappedGroupIds.length,
          previousRoles: previousRoles.map((r) => ({
            departmentName: r.departmentName,
            position: r.position,
          })),
        },
        fallbackProfile: targetProfile,
      }),
    ]);

    await recordAuditLog({
      category: 'fr',
      action: 'crew.demote',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'user',
      targetId: userId,
      targetLabel,
      summary: `Offboarded "${targetLabel}" from Crew (removed wtf-crew & assignments)`,
      metadata: {
        removedMappedGroupCount: mappedGroupIds.length,
        reason,
      },
    });

    return NextResponse.json({ ok: true, isCrew: false, status: 'offboarded', roles: [] });
  } catch (err) {
    console.error('[API] DELETE /api/fr/crew/[userId] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to offboard user' }, { status: 500 });
  }
}
