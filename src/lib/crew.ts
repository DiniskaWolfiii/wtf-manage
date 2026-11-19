import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { ensureDatabaseExists, getPool } from '@/lib/db';

export interface Department {
  id: number;
  name: string;
  parentDepartmentId: number | null;
  keycloakGroupId: string | null;
  keycloakGroupName: string | null;
}

export interface UserCrewRole {
  departmentId: number;
  departmentName: string;
  position: string;
  sortOrder: number;
}

export interface CrewAssignment extends UserCrewRole {
  id: number;
  userId: string;
}

interface DepartmentRow extends RowDataPacket {
  id: number;
  name: string;
  parent_department_id: number | null;
  keycloak_group_id: string | null;
  keycloak_group_name: string | null;
}

interface CrewAssignmentRow extends RowDataPacket {
  id: number;
  user_id: string;
  department_id: number;
  department_name: string;
  position: string;
  sort_order: number;
}

interface GroupIdRow extends RowDataPacket {
  keycloak_group_id: string;
}

interface UserIdRow extends RowDataPacket {
  user_id: string;
}

const globalForCrew = globalThis as unknown as {
  crewTablesV3Ready?: Promise<void>;
};

/**
 * Ensures the `departments` and `crew_assignments` tables exist in the `wtf_manage` database.
 */
export async function ensureCrewTables(): Promise<void> {
  if (!globalForCrew.crewTablesV3Ready) {
    globalForCrew.crewTablesV3Ready = (async () => {
      try {
        await ensureDatabaseExists();
      } catch (err) {
        console.warn('[DB] ensureDatabaseExists skipped or failed:', (err as Error).message);
      }

      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS departments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(80) NOT NULL UNIQUE,
          parent_department_id INT NULL,
          keycloak_group_id VARCHAR(64) NULL,
          keycloak_group_name VARCHAR(120) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_departments_parent
            FOREIGN KEY (parent_department_id) REFERENCES departments(id)
            ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Idempotent migration for existing tables created before parent_department_id existed
      const [colRows] = await pool.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'departments' AND COLUMN_NAME = 'parent_department_id'`
      );
      if (colRows.length === 0) {
        await pool.query(`
          ALTER TABLE departments
          ADD COLUMN parent_department_id INT NULL AFTER name,
          ADD CONSTRAINT fk_departments_parent
            FOREIGN KEY (parent_department_id) REFERENCES departments(id)
            ON DELETE SET NULL
        `);
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS crew_assignments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id VARCHAR(64) NOT NULL,
          department_id INT NOT NULL,
          position VARCHAR(120) NOT NULL DEFAULT '',
          sort_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_user_department (user_id, department_id),
          INDEX idx_crew_assignments_user (user_id),
          CONSTRAINT fk_crew_assignments_department
            FOREIGN KEY (department_id) REFERENCES departments(id)
            ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      // Idempotent migration for sort_order on existing crew_assignments tables
      const [sortOrderRows] = await pool.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crew_assignments' AND COLUMN_NAME = 'sort_order'`
      );
      if (sortOrderRows.length === 0) {
        await pool.query(`
          ALTER TABLE crew_assignments
          ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER position
        `);
      }
    })().catch((err) => {
      globalForCrew.crewTablesV3Ready = undefined;
      throw err;
    });
  }
  return globalForCrew.crewTablesV3Ready;
}

function mapDepartmentRow(row: DepartmentRow): Department {
  return {
    id: row.id,
    name: row.name,
    parentDepartmentId: row.parent_department_id ?? null,
    keycloakGroupId: row.keycloak_group_id ?? null,
    keycloakGroupName: row.keycloak_group_name ?? null,
  };
}

export async function listDepartments(): Promise<Department[]> {
  await ensureCrewTables();
  const pool = getPool();
  const [rows] = await pool.query<DepartmentRow[]>(
    'SELECT id, name, parent_department_id, keycloak_group_id, keycloak_group_name FROM departments ORDER BY name ASC'
  );
  return rows.map(mapDepartmentRow);
}

export async function getDepartmentById(id: number): Promise<Department | null> {
  await ensureCrewTables();
  const pool = getPool();
  const [rows] = await pool.execute<DepartmentRow[]>(
    'SELECT id, name, parent_department_id, keycloak_group_id, keycloak_group_name FROM departments WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] ? mapDepartmentRow(rows[0]) : null;
}

export async function createDepartment(
  name: string,
  parentDepartmentId: number | null = null
): Promise<Department> {
  await ensureCrewTables();
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    'INSERT INTO departments (name, parent_department_id) VALUES (?, ?)',
    [name, parentDepartmentId]
  );
  return {
    id: result.insertId,
    name,
    parentDepartmentId,
    keycloakGroupId: null,
    keycloakGroupName: null,
  };
}

export async function wouldCreateDepartmentCycle(
  departmentId: number,
  proposedParentId: number | null
): Promise<boolean> {
  if (proposedParentId === null) return false;
  if (proposedParentId === departmentId) return true;

  const all = await listDepartments();
  const parentMap = new Map(all.map((d) => [d.id, d.parentDepartmentId]));
  const visited = new Set<number>([departmentId]);

  let current: number | null = proposedParentId;
  while (current !== null) {
    if (visited.has(current)) {
      return true;
    }
    visited.add(current);
    current = parentMap.get(current) ?? null;
  }
  return false;
}

export async function updateDepartment(
  id: number,
  updates: { name?: string; parentDepartmentId?: number | null }
): Promise<Department | null> {
  await ensureCrewTables();
  const pool = getPool();
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.parentDepartmentId !== undefined) {
    fields.push('parent_department_id = ?');
    values.push(updates.parentDepartmentId);
  }
  if (fields.length === 0) {
    return getDepartmentById(id);
  }

  values.push(id);
  const [result] = await pool.execute<ResultSetHeader>(
    `UPDATE departments SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
  if (result.affectedRows === 0) {
    return null;
  }
  return getDepartmentById(id);
}

export async function deleteDepartment(id: number): Promise<boolean> {
  await ensureCrewTables();
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    'DELETE FROM departments WHERE id = ?',
    [id]
  );
  return result.affectedRows > 0;
}

export async function updateDepartmentKeycloakMapping(
  id: number,
  keycloakGroupId: string | null,
  keycloakGroupName: string | null
): Promise<Department | null> {
  await ensureCrewTables();
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    'UPDATE departments SET keycloak_group_id = ?, keycloak_group_name = ? WHERE id = ?',
    [keycloakGroupId, keycloakGroupName, id]
  );
  if (result.affectedRows === 0) {
    return null;
  }
  return getDepartmentById(id);
}

export async function getCrewRolesForUser(userId: string): Promise<UserCrewRole[]> {
  await ensureCrewTables();
  const pool = getPool();
  const [rows] = await pool.execute<CrewAssignmentRow[]>(
    `SELECT ca.department_id, d.name AS department_name, ca.position, ca.sort_order
     FROM crew_assignments ca
     INNER JOIN departments d ON d.id = ca.department_id
     WHERE ca.user_id = ?
     ORDER BY d.name ASC`,
    [userId]
  );
  return rows.map((row) => ({
    departmentId: row.department_id,
    departmentName: row.department_name,
    position: row.position,
    sortOrder: row.sort_order ?? 0,
  }));
}

export async function listAllCrewAssignments(): Promise<CrewAssignment[]> {
  await ensureCrewTables();
  const pool = getPool();
  const [rows] = await pool.query<CrewAssignmentRow[]>(
    `SELECT ca.id, ca.user_id, ca.department_id, d.name AS department_name, ca.position, ca.sort_order
     FROM crew_assignments ca
     INNER JOIN departments d ON d.id = ca.department_id
     ORDER BY d.name ASC, ca.sort_order ASC, ca.id ASC`
  );
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    departmentId: row.department_id,
    departmentName: row.department_name,
    position: row.position,
    sortOrder: row.sort_order ?? 0,
  }));
}

export async function getDepartmentMemberIds(departmentId: number): Promise<string[]> {
  await ensureCrewTables();
  const pool = getPool();
  const [rows] = await pool.execute<UserIdRow[]>(
    'SELECT user_id FROM crew_assignments WHERE department_id = ?',
    [departmentId]
  );
  return rows.map((r) => r.user_id);
}

export async function getMappedGroupIdsForUser(userId: string): Promise<string[]> {
  await ensureCrewTables();
  const pool = getPool();
  const [rows] = await pool.execute<GroupIdRow[]>(
    `SELECT DISTINCT d.keycloak_group_id
     FROM crew_assignments ca
     INNER JOIN departments d ON d.id = ca.department_id
     WHERE ca.user_id = ? AND d.keycloak_group_id IS NOT NULL AND d.keycloak_group_id != ''`,
    [userId]
  );
  return rows.map((r) => r.keycloak_group_id);
}

export async function replaceUserCrewAssignments(
  userId: string,
  assignments: Array<{ departmentId: number; position: string }>
): Promise<void> {
  await ensureCrewTables();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Preserve existing sort_order per department when editing a user's roles
    const [existingRows] = await conn.execute<RowDataPacket[]>(
      'SELECT department_id, sort_order FROM crew_assignments WHERE user_id = ?',
      [userId]
    );
    const existingOrder = new Map<number, number>();
    for (const r of existingRows) {
      existingOrder.set(Number(r.department_id), Number(r.sort_order ?? 0));
    }

    await conn.execute('DELETE FROM crew_assignments WHERE user_id = ?', [userId]);

    for (const item of assignments) {
      let sortOrder = existingOrder.get(item.departmentId);
      if (sortOrder === undefined) {
        const [maxRows] = await conn.execute<RowDataPacket[]>(
          'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM crew_assignments WHERE department_id = ?',
          [item.departmentId]
        );
        sortOrder = Number(maxRows[0]?.next_order ?? 0);
      }

      await conn.execute(
        'INSERT INTO crew_assignments (user_id, department_id, position, sort_order) VALUES (?, ?, ?, ?)',
        [userId, item.departmentId, item.position, sortOrder]
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

/**
 * Update the display/rank order of members within a specific department.
 */
export async function updateDepartmentMemberOrder(
  departmentId: number,
  orderedUserIds: string[]
): Promise<void> {
  await ensureCrewTables();
  const pool = getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (let i = 0; i < orderedUserIds.length; i++) {
      await conn.execute(
        'UPDATE crew_assignments SET sort_order = ? WHERE department_id = ? AND user_id = ?',
        [i, departmentId, orderedUserIds[i]]
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

export async function deleteAllUserCrewAssignments(userId: string): Promise<void> {
  await ensureCrewTables();
  const pool = getPool();
  await pool.execute('DELETE FROM crew_assignments WHERE user_id = ?', [userId]);
}
