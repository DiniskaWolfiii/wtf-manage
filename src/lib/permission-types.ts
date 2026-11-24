export type PortalPermission =
  | 'crew.view'
  | 'fr.read'
  | 'fr.write'
  | 'logs.view_fr'
  | 'logs.view_admin'
  | 'logs.view_all'
  | 'admin.manage';

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
    key: 'crew.view',
    section: 'Crew & Org Chart',
    label: 'View Crew & Org Chart',
    description: 'Access to the Crew Dashboard (/crew) and Organization Chart (/crew/org-chart).',
  },
  {
    key: 'fr.read',
    section: 'Furry Resources',
    label: 'View Furry Resources',
    description: 'Read-only access to /fr, crew master data, departments, and skills.',
  },
  {
    key: 'fr.write',
    section: 'Furry Resources',
    label: 'Manage Furry Resources',
    description: 'Create and edit crew roles, master data, departments, and skills.',
  },
  {
    key: 'logs.view_fr',
    section: 'Audit Logs',
    label: 'View FR Logs',
    description: 'Access to /logs filtered to Furry Resources entries.',
  },
  {
    key: 'logs.view_admin',
    section: 'Audit Logs',
    label: 'View Admin Logs',
    description: 'Access to /logs filtered to Administration entries.',
  },
  {
    key: 'logs.view_all',
    section: 'Audit Logs',
    label: 'View All Logs',
    description: 'Full access to all audit log categories (including profile & security logs).',
  },
  {
    key: 'admin.manage',
    section: 'Administration',
    label: 'Manage Admin Portal',
    description: 'Access to /admin, portal settings, department mappings, and permissions.',
  },
];

export const ALL_PERMISSIONS: PortalPermission[] = PERMISSION_DEFINITIONS.map((d) => d.key);

export type PermissionMappings = Record<PortalPermission, string[]>;

export const DEFAULT_PERMISSION_MAPPINGS: PermissionMappings = {
  'crew.view': ['crew'],
  'fr.read': ['furry_ressources', 'furry_ressources_admin'],
  'fr.write': ['furry_ressources_admin'],
  'logs.view_fr': ['furry_ressources', 'furry_ressources_admin'],
  'logs.view_admin': [],
  'logs.view_all': [],
  'admin.manage': [],
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
