export interface DepartmentItem {
  id: number;
  name: string;
  parentDepartmentId: number | null;
  keycloakGroupId: string | null;
  keycloakGroupName: string | null;
}

export interface CrewRoleItem {
  departmentId: number;
  departmentName: string;
  position: string;
  sortOrder: number;
}

export interface SkillCatalogItem {
  id: number;
  name: string;
  category: string;
  levels: string[];
}

export interface CrewSkillItem {
  skillId: number;
  skillName: string;
  category: string;
  level: string;
}

export interface FrUserItem {
  id: string;
  username: string;
  avatarUrl?: string;
  isCrew: boolean;
  roles: CrewRoleItem[];
  skills: CrewSkillItem[];
}

export type FrSection = 'crew' | 'departments' | 'skills';

export interface FrStatusMessage {
  type: 'success' | 'error';
  text: string;
}

export const DARK_MODAL_STYLES = {
  content: { backgroundColor: 'var(--mantine-color-dark-7)' },
  header: { backgroundColor: 'var(--mantine-color-dark-7)', color: '#fff' },
};
