import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ensureDatabaseExists, getPool } from '@/lib/db';

export interface SkillDefinition {
  id: number;
  name: string;
  category: string;
  levels: string[];
}

export interface UserCrewSkill {
  skillId: number;
  skillName: string;
  category: string;
  level: string;
}

export interface CrewSkillAssignment extends UserCrewSkill {
  id: number;
  userId: string;
}

interface SkillRow extends RowDataPacket {
  id: number;
  name: string;
  category: string;
  levels: string | string[];
}

interface CrewSkillRow extends RowDataPacket {
  id: number;
  user_id: string;
  skill_id: number;
  skill_name: string;
  category: string;
  level: string;
}

const globalForSkills = globalThis as unknown as {
  skillTablesReady?: Promise<void>;
};

function parseLevels(raw: string | string[]): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      }
    } catch {
      return [];
    }
  }
  return [];
}

function mapSkillRow(row: SkillRow): SkillDefinition {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    levels: parseLevels(row.levels),
  };
}

/**
 * Ensures the `skills` and `crew_skills` tables exist in the `wtf_manage` database.
 */
export async function ensureSkillTables(): Promise<void> {
  if (!globalForSkills.skillTablesReady) {
    globalForSkills.skillTablesReady = (async () => {
      try {
        await ensureDatabaseExists();
      } catch (err) {
        console.warn('[DB] ensureDatabaseExists skipped or failed:', (err as Error).message);
      }

      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS skills (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(80) NOT NULL UNIQUE,
          category VARCHAR(60) NOT NULL DEFAULT 'General',
          levels JSON NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS crew_skills (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          skill_id INT NOT NULL,
          level VARCHAR(60) NOT NULL,
          updated_by VARCHAR(64) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_user_skill (user_id, skill_id),
          INDEX idx_crew_skills_user (user_id),
          CONSTRAINT fk_crew_skills_skill
            FOREIGN KEY (skill_id) REFERENCES skills(id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((err) => {
      globalForSkills.skillTablesReady = undefined;
      throw err;
    });
  }
  return globalForSkills.skillTablesReady;
}

export async function listSkills(): Promise<SkillDefinition[]> {
  await ensureSkillTables();
  const pool = getPool();
  const [rows] = await pool.query<SkillRow[]>(
    'SELECT id, name, category, levels FROM skills ORDER BY category ASC, name ASC'
  );
  return rows.map(mapSkillRow);
}

export async function getSkillById(id: number): Promise<SkillDefinition | null> {
  await ensureSkillTables();
  const pool = getPool();
  const [rows] = await pool.query<SkillRow[]>(
    'SELECT id, name, category, levels FROM skills WHERE id = ? LIMIT 1',
    [id]
  );
  if (rows.length === 0) return null;
  return mapSkillRow(rows[0]);
}

export async function createSkill(
  name: string,
  category: string,
  levels: string[]
): Promise<SkillDefinition> {
  await ensureSkillTables();
  const pool = getPool();
  const [res] = await pool.query<ResultSetHeader>(
    'INSERT INTO skills (name, category, levels) VALUES (?, ?, ?)',
    [name, category, JSON.stringify(levels)]
  );
  return {
    id: res.insertId,
    name,
    category,
    levels,
  };
}

export async function updateSkill(
  id: number,
  name: string,
  category: string,
  levels: string[]
): Promise<SkillDefinition | null> {
  await ensureSkillTables();
  const pool = getPool();
  const [res] = await pool.query<ResultSetHeader>(
    'UPDATE skills SET name = ?, category = ?, levels = ? WHERE id = ?',
    [name, category, JSON.stringify(levels), id]
  );
  if (res.affectedRows === 0) return null;
  return { id, name, category, levels };
}

export async function deleteSkill(id: number): Promise<boolean> {
  await ensureSkillTables();
  const pool = getPool();
  const [res] = await pool.query<ResultSetHeader>('DELETE FROM skills WHERE id = ?', [id]);
  return res.affectedRows > 0;
}

export async function getCrewSkillsForUser(userId: string): Promise<UserCrewSkill[]> {
  await ensureSkillTables();
  const pool = getPool();
  const [rows] = await pool.query<CrewSkillRow[]>(
    `SELECT cs.id, cs.user_id, cs.skill_id, s.name AS skill_name, s.category, cs.level
     FROM crew_skills cs
     INNER JOIN skills s ON s.id = cs.skill_id
     WHERE cs.user_id = ?
     ORDER BY s.category ASC, s.name ASC`,
    [userId]
  );
  return rows.map((r) => ({
    skillId: r.skill_id,
    skillName: r.skill_name,
    category: r.category,
    level: r.level,
  }));
}

export async function listAllCrewSkills(): Promise<CrewSkillAssignment[]> {
  await ensureSkillTables();
  const pool = getPool();
  const [rows] = await pool.query<CrewSkillRow[]>(
    `SELECT cs.id, cs.user_id, cs.skill_id, s.name AS skill_name, s.category, cs.level
     FROM crew_skills cs
     INNER JOIN skills s ON s.id = cs.skill_id
     ORDER BY s.category ASC, s.name ASC`
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    skillId: r.skill_id,
    skillName: r.skill_name,
    category: r.category,
    level: r.level,
  }));
}

export async function replaceUserCrewSkills(
  userId: string,
  items: Array<{ skillId: number; level: string }>,
  updatedBy?: string | null
): Promise<void> {
  await ensureSkillTables();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM crew_skills WHERE user_id = ?', [userId]);

    if (items.length > 0) {
      const values = items.map((item) => [userId, item.skillId, item.level, updatedBy ?? null]);
      await conn.query(
        'INSERT INTO crew_skills (user_id, skill_id, level, updated_by) VALUES ?',
        [values]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function deleteAllUserCrewSkills(userId: string): Promise<void> {
  await ensureSkillTables();
  const pool = getPool();
  await pool.query('DELETE FROM crew_skills WHERE user_id = ?', [userId]);
}
