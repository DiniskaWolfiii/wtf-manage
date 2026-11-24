export type PortalPermission =
  | 'crew.dashboard.view'
  | 'fr.crew.view'
  | 'fr.crew.manage'
  | 'fr.departments.view'
  | 'fr.departments.manage'
  | 'fr.skills.view'
  | 'fr.skills.manage'
  | 'logs.fr.view'
  | 'logs.admin.view'
  | 'logs.all.view'
  | 'admin.portal.manage';

export type PermissionSection =
  | 'Crew & Org Chart'
  | 'Furry Resources'
  | 'Audit Logs'
  | 'Administration';

export interface PermissionDefinition {
  key: PortalPermission;
  section: PermissionSection;
  label: string;
  description: string;
}

export const PERMISSION_SECTIONS: PermissionSection[] = [
  'Crew & Org Chart',
  'Furry Resources',
  'Audit Logs',
  'Administration',
];

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  {
    key: 'crew.dashboard.view',
    section: 'Crew & Org Chart',
    label: 'View Crew & Org Chart',
    description: 'Access to the Crew Dashboard (/crew) and Organization Chart (/crew/org-chart).',
  },
  {
    key: 'fr.crew.view',
    section: 'Furry Resources',
    label: 'View FR Crew Management',
    description: 'Read-only access to /fr/crew and crew member master data.',
  },
  {
    key: 'fr.crew.manage',
    section: 'Furry Resources',
    label: 'Manage FR Crew',
    description: 'Onboard/offboard crew, assign roles & skills, and edit crew master data.',
  },
  {
    key: 'fr.departments.view',
    section: 'Furry Resources',
    label: 'View Departments',
    description: 'Read-only access to /fr/departments and department rankings.',
  },
  {
    key: 'fr.departments.manage',
    section: 'Furry Resources',
    label: 'Manage Departments',
    description: 'Create, rename, reorder, and delete departments.',
  },
  {
    key: 'fr.skills.view',
    section: 'Furry Resources',
    label: 'View Skills',
    description: 'Read-only access to /fr/skills, skill catalog, and skill finder.',
  },
  {
    key: 'fr.skills.manage',
    section: 'Furry Resources',
    label: 'Manage Skills',
    description: 'Create, edit, and delete skills and proficiency levels in the catalog.',
  },
  {
    key: 'logs.fr.view',
    section: 'Audit Logs',
    label: 'View FR Logs',
    description: 'Access to /logs filtered to Furry Resources entries.',
  },
  {
    key: 'logs.admin.view',
    section: 'Audit Logs',
    label: 'View Admin Logs',
    description: 'Access to /logs filtered to Administration entries.',
  },
  {
    key: 'logs.all.view',
    section: 'Audit Logs',
    label: 'View All Logs',
    description: 'Full access to all audit log categories (including profile & security logs).',
  },
  {
    key: 'admin.portal.manage',
    section: 'Administration',
    label: 'Manage Admin Portal',
    description: 'Access to /admin, portal settings, department mappings, and permissions.',
  },
];

export const ALL_PERMISSIONS: PortalPermission[] = PERMISSION_DEFINITIONS.map((d) => d.key);

export type PermissionMappings = Record<PortalPermission, string[]>;

export const DEFAULT_PERMISSION_MAPPINGS: PermissionMappings = {
  'crew.dashboard.view': [],
  'fr.crew.view': [],
  'fr.crew.manage': [],
  'fr.departments.view': [],
  'fr.departments.manage': [],
  'fr.skills.view': [],
  'fr.skills.manage': [],
  'logs.fr.view': [],
  'logs.admin.view': [],
  'logs.all.view': [],
  'admin.portal.manage': [],
};

export const LEGACY_PERMISSION_MIGRATION: Record<string, PortalPermission> = {
  'crew.view': 'crew.dashboard.view',
  'fr.read': 'fr.crew.view',
  'fr.write': 'fr.crew.manage',
  'departments.read': 'fr.departments.view',
  'departments.write': 'fr.departments.manage',
  'skills.read': 'fr.skills.view',
  'skills.write': 'fr.skills.manage',
  'logs.view_fr': 'logs.fr.view',
  'logs.view_admin': 'logs.admin.view',
  'logs.view_all': 'logs.all.view',
  'admin.manage': 'admin.portal.manage',
};

/**
 * Normalizes a Keycloak group path or name by trimming whitespace and leading/trailing slashes.
 */
export function normalizeGroupIdentifier(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '');
}

export function isValidPermission(value: string): value is PortalPermission {
  return ALL_PERMISSIONS.includes(value as PortalPermission);
}
