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
  getPermissionMappings,
  updatePermissionMappings,
} from '@/lib/permissions';
import { requireSessionPermission } from '@/lib/server-auth';

export async function GET() {
  const authResult = await requireSessionPermission('admin.manage');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const [mappings, keycloakGroups] = await Promise.all([
      getPermissionMappings(),
      listKeycloakGroups(),
    ]);

    return NextResponse.json({
      definitions: PERMISSION_DEFINITIONS,
      mappings,
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
  const authResult = await requireSessionPermission('admin.manage');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const rawBody = (await request.json()) as { mappings?: unknown };
    if (
      !rawBody ||
      typeof rawBody !== 'object' ||
      !rawBody.mappings ||
      typeof rawBody.mappings !== 'object' ||
      Array.isArray(rawBody.mappings)
    ) {
      return NextResponse.json({ error: 'Invalid permissions payload' }, { status: 400 });
    }

    const inputMappings = rawBody.mappings as Record<string, unknown>;
    const sanitizedInput: Record<string, string[]> = {};
    for (const [key, val] of Object.entries(inputMappings)) {
      if (!isValidPermission(key) || !Array.isArray(val)) {
        return NextResponse.json({ error: `Invalid permission entry: ${key}` }, { status: 400 });
      }
      sanitizedInput[key] = val.filter((item): item is string => typeof item === 'string');
    }

    const previous = await getPermissionMappings();
    const updated = await updatePermissionMappings(sanitizedInput);

    const changedKeys = ALL_PERMISSIONS.filter(
      (key) => JSON.stringify(previous[key]) !== JSON.stringify(updated[key])
    );

    if (changedKeys.length > 0) {
      await recordAuditLog({
        category: 'admin',
        action: 'permissions.updated',
        actorUserId: authResult.userId,
        actorUsername: authResult.username,
        targetType: 'permissions',
        targetId: 'permissionMappings',
        targetLabel: changedKeys.join(', '),
        summary: `Updated group mappings for ${changedKeys.join(', ')}`,
        metadata: {
          changedPermissions: changedKeys,
          previous,
          updated,
        },
      });
    }

    return NextResponse.json({
      mappings: updated,
      adminGroup: getConfiguredAdminGroup(),
    });
  } catch (err) {
    console.error('[API] PUT /api/admin/permissions failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to update permissions' }, { status: 500 });
  }
}
