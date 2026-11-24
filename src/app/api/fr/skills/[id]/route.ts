import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import { deleteSkill, getSkillById, updateSkill } from '@/lib/skills';
import { requireSessionPermission } from '@/lib/server-auth';
import {
  sanitizeSkillCategory,
  sanitizeSkillLevels,
  sanitizeSkillName,
} from '@/lib/validation';

const FR_READ_PERMS = ['fr.read', 'fr.write'] as const;

function parseSkillId(rawId: string): number | null {
  if (!/^\d+$/.test(rawId)) return null;
  const parsed = Number(rawId);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSessionPermission('fr.write');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id } = await context.params;
  const skillId = parseSkillId(id);
  if (!skillId) {
    return NextResponse.json({ error: 'Invalid skill ID' }, { status: 400 });
  }

  try {
    const existing = await getSkillById(skillId);
    if (!existing) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const input = body as Record<string, unknown>;
    const name = sanitizeSkillName(input.name);
    if (!name) {
      return NextResponse.json(
        { error: 'Skill name must be 1–80 characters' },
        { status: 400 }
      );
    }

    const category = sanitizeSkillCategory(input.category);
    if (!category) {
      return NextResponse.json(
        { error: 'Category must be at most 60 characters' },
        { status: 400 }
      );
    }

    const levels = sanitizeSkillLevels(input.levels);
    if (!levels) {
      return NextResponse.json(
        { error: 'At least 1 valid skill level (max 20, 1–40 chars each) is required' },
        { status: 400 }
      );
    }

    const updated = await updateSkill(skillId, name, category, levels);
    if (!updated) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    await recordAuditLog({
      category: 'fr',
      action: 'skill.updated',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'skill',
      targetId: String(skillId),
      targetLabel: updated.name,
      summary: `Updated skill "${updated.name}" (${updated.category})`,
      metadata: {
        previous: {
          name: existing.name,
          category: existing.category,
          levels: existing.levels,
        },
        next: {
          name: updated.name,
          category: updated.category,
          levels: updated.levels,
        },
      },
    });

    return NextResponse.json({ skill: updated });
  } catch (err) {
    const mysqlErr = err as { code?: string; message?: string };
    if (mysqlErr.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'A skill with this name already exists' },
        { status: 409 }
      );
    }
    console.error('[API] PATCH /api/fr/skills/[id] failed:', mysqlErr.message);
    return NextResponse.json({ error: 'Failed to update skill' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await requireSessionPermission('fr.write');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  const { id } = await context.params;
  const skillId = parseSkillId(id);
  if (!skillId) {
    return NextResponse.json({ error: 'Invalid skill ID' }, { status: 400 });
  }

  try {
    const existing = await getSkillById(skillId);
    if (!existing) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    const deleted = await deleteSkill(skillId);
    if (!deleted) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 });
    }

    await recordAuditLog({
      category: 'fr',
      action: 'skill.deleted',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'skill',
      targetId: String(skillId),
      targetLabel: existing.name,
      summary: `Deleted skill "${existing.name}" (${existing.category})`,
      metadata: {
        category: existing.category,
        levels: existing.levels,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /api/fr/skills/[id] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to delete skill' }, { status: 500 });
  }
}
