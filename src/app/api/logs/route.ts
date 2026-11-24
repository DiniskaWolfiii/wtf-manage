import { NextResponse } from 'next/server';
import { queryAuditLogs, type AuditCategory } from '@/lib/audit';
import { requireSessionPermission } from '@/lib/server-auth';

export async function GET(request: Request) {
  const authResult = await requireSessionPermission([
    'logs.view_fr',
    'logs.view_admin',
    'logs.view_all',
  ]);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { permissions } = authResult;
  const canViewAll = permissions.includes('logs.view_all');
  const allowedCategories: AuditCategory[] | undefined = canViewAll
    ? undefined
    : [
        ...(permissions.includes('logs.view_fr') ? (['fr'] as const) : []),
        ...(permissions.includes('logs.view_admin') ? (['admin'] as const) : []),
      ];

  try {
    const { searchParams } = new URL(request.url);
    const requestedCategory = searchParams.get('category') || 'all';
    const action = searchParams.get('action') || 'all';
    const q = searchParams.get('q') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const page = Number(searchParams.get('page') || '1');
    const pageSize = Number(searchParams.get('pageSize') || '50');

    const effectiveCategory =
      !allowedCategories ||
      requestedCategory === 'all' ||
      allowedCategories.includes(requestedCategory as AuditCategory)
        ? requestedCategory
        : allowedCategories[0] ?? 'all';

    const result = await queryAuditLogs({
      category: effectiveCategory,
      action,
      q,
      from,
      to,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
      allowedCategories,
    });

    return NextResponse.json({
      ...result,
      canViewAll,
      allowedCategories: allowedCategories ?? ['fr', 'admin', 'profile'],
    });
  } catch (err) {
    console.error('[API] GET /api/logs failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load audit logs' }, { status: 500 });
  }
}
