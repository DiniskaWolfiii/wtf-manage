import { NextResponse } from 'next/server';
import { queryAuditLogs, type AuditCategory } from '@/lib/audit';
import { requireSessionRole } from '@/lib/server-auth';

const LOG_VIEWER_ROLES = ['winterfur-admin', 'furry_ressources', 'furry_ressources_admin'];

export async function GET(request: Request) {
  const authResult = await requireSessionRole(LOG_VIEWER_ROLES);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const isAdmin = authResult.roles.includes('winterfur-admin');
  const allowedCategories: AuditCategory[] | undefined = isAdmin ? undefined : ['fr'];

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'all';
    const action = searchParams.get('action') || 'all';
    const q = searchParams.get('q') || '';
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const page = Number(searchParams.get('page') || '1');
    const pageSize = Number(searchParams.get('pageSize') || '50');

    const result = await queryAuditLogs({
      category: isAdmin ? category : 'fr',
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
      isAdmin,
    });
  } catch (err) {
    console.error('[API] GET /api/logs failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load audit logs' }, { status: 500 });
  }
}
