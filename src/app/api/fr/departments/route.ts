import { NextResponse } from 'next/server';
import { createDepartment, getDepartmentById, listDepartments } from '@/lib/crew';
import { requireSessionRole } from '@/lib/server-auth';
import { sanitizeDepartmentName } from '@/lib/validation';

export async function GET() {
  const authResult = await requireSessionRole('furry_ressources');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const departments = await listDepartments();
    return NextResponse.json({ departments });
  } catch (err) {
    console.error('[API] GET /api/fr/departments failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load departments' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authResult = await requireSessionRole('furry_ressources');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const rawBody = (await request.json()) as {
      name?: unknown;
      parentDepartmentId?: unknown;
    };
    const name = sanitizeDepartmentName(rawBody?.name);
    if (!name) {
      return NextResponse.json(
        { error: 'Department name must be 1-80 characters' },
        { status: 400 }
      );
    }

    let parentDepartmentId: number | null = null;
    if (rawBody?.parentDepartmentId !== undefined && rawBody?.parentDepartmentId !== null) {
      if (
        typeof rawBody.parentDepartmentId !== 'number' ||
        !Number.isInteger(rawBody.parentDepartmentId) ||
        rawBody.parentDepartmentId <= 0
      ) {
        return NextResponse.json(
          { error: 'Invalid parentDepartmentId' },
          { status: 400 }
        );
      }
      const parent = await getDepartmentById(rawBody.parentDepartmentId);
      if (!parent) {
        return NextResponse.json(
          { error: 'Parent department not found' },
          { status: 400 }
        );
      }
      parentDepartmentId = parent.id;
    }

    const created = await createDepartment(name, parentDepartmentId);
    return NextResponse.json({ department: created }, { status: 201 });
  } catch (err) {
    const mysqlErr = err as { code?: string; message?: string };
    if (mysqlErr.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'A department with this name already exists' },
        { status: 409 }
      );
    }
    console.error('[API] POST /api/fr/departments failed:', mysqlErr.message);
    return NextResponse.json({ error: 'Failed to create department' }, { status: 500 });
  }
}
