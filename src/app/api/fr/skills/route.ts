import { NextResponse } from 'next/server';
import { recordAuditLog } from '@/lib/audit';
import { createSkill, listSkills } from '@/lib/skills';
import { requireSessionPermission } from '@/lib/server-auth';
import {
  sanitizeSkillCategory,
  sanitizeSkillLevels,
  sanitizeSkillName,
} from '@/lib/validation';

const SKILL_READ_PERMS = ['fr.skills.view', 'fr.skills.manage'] as const;

export async function GET() {
  const authResult = await requireSessionPermission([...SKILL_READ_PERMS]);
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
    const skills = await listSkills();
    return NextResponse.json({ skills });
  } catch (err) {
    console.error('[API] GET /api/fr/skills failed:', (err as Error).message);
    return NextResponse.json({ error: 'Failed to load skills' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authResult = await requireSessionPermission('fr.skills.manage');
  if (authResult instanceof NextResponse) {
    return authResult;
  }

  try {
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

    const created = await createSkill(name, category, levels);

    await recordAuditLog({
      category: 'fr',
      action: 'skill.created',
      actorUserId: authResult.userId,
      actorUsername: authResult.username,
      targetType: 'skill',
      targetId: String(created.id),
      targetLabel: created.name,
      summary: `Created skill "${created.name}" (${created.category}) with ${created.levels.length} level(s)`,
      metadata: {
        category: created.category,
        levels: created.levels,
      },
    });

    return NextResponse.json({ skill: created }, { status: 201 });
  } catch (err) {
    const mysqlErr = err as { code?: string; message?: string };
    if (mysqlErr.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'A skill with this name already exists' },
        { status: 409 }
      );
    }
    console.error('[API] POST /api/fr/skills failed:', mysqlErr.message);
    return NextResponse.json({ error: 'Failed to create skill' }, { status: 500 });
  }
}
