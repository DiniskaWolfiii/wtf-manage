import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import { listKeycloakGroups } from '@/lib/keycloak';
import {
  ALL_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  isValidPermission,
} from '@/lib/permission-types';
import {
  getConfiguredAdminGroup,
  getCrewOnboardingGroup,
  getPermissionMappings,
  isPrivilegedPortalGroup,
  updateCrewOnboardingGroup,
  updatePermissionMappings,
} from '@/lib/permissions';
import { requireSessionPermission } from '@/lib/server-auth';

export async function GET() {
  const authResult = await requireSessionPermission('admin.portal.manage');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const [mappings, crewGroup, keycloakGroups] = await Promise.all([
      getPermissionMappings(),
      getCrewOnboardingGroup(),
      listKeycloakGroups(),
    ]);

    return NextResponse.json({
      definitions: PERMISSION_DEFINITIONS,
      mappings,
      crewGroup,
      adminGroup: getConfiguredAdminGroup(),
      keycloakGroups: keycloakGroups ?? [],
      keycloakGroupsAvailable: keycloakGroups !== null,
    });
  } catch (err) {
    console.error('[API] GET /api/admin/permissions failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load permissions' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const authResult = await requireSessionPermission('admin.portal.manage');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const rawBody = (await request.json()) as {
      mappings?: unknown;
      crewGroup?: unknown;
    };
    if (
      !rawBody ||
      typeof rawBody !== 'object' ||
      !rawBody.mappings ||
      typeof rawBody.mappings !== 'object' ||
      Array.isArray(rawBody.mappings)
    ) {
      return NextResponse.json({ error: 'Invalid permissions payload' }, { status: 400 });
    }

    if (
      rawBody.crewGroup !== undefined &&
      rawBody.crewGroup !== null &&
      typeof rawBody.crewGroup !== 'string'
    ) {
      return NextResponse.json({ error: 'Invalid crewGroup payload' }, { status: 400 });
    }

    const inputMappings = rawBody.mappings as Record<string, unknown>;
    const sanitizedInput: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(inputMappings)) {
      if (!isValidPermission(key) || !Array.isArray(val)) {
        return NextResponse.json({ error: `Invalid permission entry: ${key}` }, { status: 400 });
      }
      sanitizedInput[key] = val.filter((item): item is string => typeof item === 'string');
    }

    const [previousMappings, previousCrewGroup] = await Promise.all([
      getPermissionMappings(),
      getCrewOnboardingGroup(),
    ]);

    const candidateMappings = {
      ...previousMappings,
      ...sanitizedInput,
    };
    const effectiveCrewGroup =
      rawBody.crewGroup !== undefined ? (rawBody.crewGroup as string | null) : previousCrewGroup;

    if (effectiveCrewGroup) {
      const kcGroups = await listKeycloakGroups();
      if (!kcGroups && rawBody.crewGroup !== undefined) {
        return NextResponse.json(
          { error: 'Failed to verify crew onboarding group against Keycloak' },
          { status: 502 }
        );
      }

      const normalizedEffective = effectiveCrewGroup.trim().replace(/^\/+|\/+$/g, '');
      const exactPathMatch = kcGroups?.find(
        (g) => g.path.replace(/^\/+|\/+$/g, '') === normalizedEffective
      );
      const nameMatches = kcGroups?.filter((g) => g.name === normalizedEffective) ?? [];
      const resolvedCrewGroup =
        exactPathMatch ?? (nameMatches.length === 1 ? nameMatches[0] : null);

      const candidates = [
        effectiveCrewGroup,
        ...(resolvedCrewGroup ? [resolvedCrewGroup.path, resolvedCrewGroup.name] : []),
      ];

      if (await isPrivilegedPortalGroup(candidates, candidateMappings)) {
        return NextResponse.json(
          { error: 'Crew onboarding group cannot be a privileged admin group' },
          { status: 400 }
        );
      }
    }

    const updatedMappings = await updatePermissionMappings(sanitizedInput);
    const updatedCrewGroup =
      rawBody.crewGroup !== undefined
        ? await updateCrewOnboardingGroup(rawBody.crewGroup as string | null)
        : previousCrewGroup;

    const changedKeys = ALL_PERMISSIONS.filter(
      (key) => JSON.stringify(previousMappings[key]) !== JSON.stringify(updatedMappings[key])
    );
    const crewGroupChanged = previousCrewGroup !== updatedCrewGroup;

    if (changedKeys.length > 0 || crewGroupChanged) {
      const targetLabels = [
        ...changedKeys,
        ...(crewGroupChanged ? ['crewGroup'] : []),
      ];
      await recordAuditLog({
        category: 'admin',
        action: 'permissions.updated',
        actorUserId: authResult.userId,
        actorUsername: authResult.username,
        targetType: 'permissions',
        targetId: 'permissionMappings',
        targetLabel: targetLabels.join(', '),
        summary: `Updated group mappings for ${targetLabels.join(', ')}`,
        metadata: {
          changedPermissions: changedKeys,
          previous: previousMappings,
          updated: updatedMappings,
          ...(crewGroupChanged
            ? { previousCrewGroup, updatedCrewGroup }
            : {}),
        },
      });
    }

    return NextResponse.json({
      mappings: updatedMappings,
      crewGroup: updatedCrewGroup,
      adminGroup: getConfiguredAdminGroup(),
    });
  } catch (err) {
    console.error('[API] PUT /api/admin/permissions failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 });
  }
}
