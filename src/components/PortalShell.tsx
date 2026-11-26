'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  ActionIcon,
  AppShell,
  Avatar,
  Box,
  Burger,
  Group,
  NavLink,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconAward,
  IconBuilding,
  IconHistory,
  IconLogout,
  IconPaw,
  IconSettings,
  IconSitemap,
  IconUser,
  IconUsersGroup,
} from '@tabler/icons-react';
import type { UserCrewRole } from '@/lib/crew';
import type { UserCrewSkill } from '@/lib/skills';
import type { UserProfileData } from '@/lib/keycloak';
import type { PortalPermission } from '@/lib/permission-types';
import {
  DEFAULT_PORTAL_SETTINGS,
  type IdentityDisplayConfig,
  type PortalSettings,
} from '@/lib/portal-config';
import { getSafeAvatarUrl } from '@/lib/validation';
import { FrWorkspace } from '@/components/FrWorkspace';
import { OrgChartWorkspace } from '@/components/OrgChartWorkspace';
import { AuditLogsWorkspace } from '@/components/AuditLogsWorkspace';
import {
  ProfileWorkspace,
  type SecurityData,
} from '@/components/profile/ProfileWorkspace';
import { CrewDashboardWorkspace } from '@/components/crew/CrewDashboardWorkspace';
import { AdminSettingsWorkspace } from '@/components/admin/AdminSettingsWorkspace';

export type { SecurityData };

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  username: string;
  image: string;
  permissions: PortalPermission[];
}

function NavSectionLabel({ children }: { children: string }) {
  return (
    <Text size="xs" fw={700} tt="uppercase" c="dimmed" px="xs" pb={4}>
      {children}
    </Text>
  );
}

export function PortalShell({
  sessionUser,
  initialProfile,
  initialSecurity,
  initialSettings,
  identityConfig,
  initialCrewRoles,
  initialCrewSkills,
}: {
  sessionUser?: SessionUser;
  initialProfile?: UserProfileData;
  initialSecurity?: SecurityData;
  initialSettings?: PortalSettings;
  identityConfig?: IdentityDisplayConfig;
  initialCrewRoles?: UserCrewRole[];
  initialCrewSkills?: UserCrewSkill[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const permissions = sessionUser?.permissions ?? [];
  const isAdmin = permissions.includes('admin.portal.manage');
  const isCrew = permissions.includes('crew.dashboard.view');
  const isFrAdmin = permissions.includes('fr.crew.manage');
  const canReadFrCrew = permissions.includes('fr.crew.view') || isFrAdmin;
  const canWriteDepartments = permissions.includes('fr.departments.manage');
  const canReadDepartments =
    permissions.includes('fr.departments.view') || canWriteDepartments;
  const canWriteSkills = permissions.includes('fr.skills.manage');
  const canReadSkills = permissions.includes('fr.skills.view') || canWriteSkills;
  const hasFurryResources = canReadFrCrew || canReadDepartments || canReadSkills;
  const canViewFrLogs = permissions.includes('logs.fr.view');
  const canViewAdminLogs = permissions.includes('logs.admin.view');
  const canViewAllLogs = permissions.includes('logs.all.view');
  const canViewLogs = canViewFrLogs || canViewAdminLogs || canViewAllLogs;
  const frCrewDetailMatch = pathname.match(/^\/fr\/crew\/([^/]+)$/);
  const frCrewDetailUserId = frCrewDetailMatch
    ? decodeURIComponent(frCrewDetailMatch[1])
    : null;

  const activeTab:
    | 'profile'
    | 'crew'
    | 'org-chart'
    | 'fr-crew'
    | 'fr-departments'
    | 'fr-skills'
    | 'admin'
    | 'logs' =
    pathname.startsWith('/crew/org-chart') && isCrew
      ? 'org-chart'
      : pathname.startsWith('/crew') && isCrew
      ? 'crew'
      : pathname.startsWith('/fr/departments') && canReadDepartments
      ? 'fr-departments'
      : pathname.startsWith('/fr/skills') && canReadSkills
      ? 'fr-skills'
      : pathname.startsWith('/fr') && canReadFrCrew
      ? 'fr-crew'
      : pathname.startsWith('/logs') && canViewLogs
      ? 'logs'
      : pathname.startsWith('/admin') && isAdmin
      ? 'admin'
      : 'profile';

  const [mobileNavOpened, { toggle: toggleMobileNav, close: closeMobileNav }] =
    useDisclosure(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(!initialProfile);
  const [isLoadingSecurity, setIsLoadingSecurity] = useState(!initialSecurity);

  const [security, setSecurity] = useState<SecurityData>(
    initialSecurity || {
      hasPassword: true,
      passwordUpdated: 'Configured',
      hasTotp: false,
      passkeys: [],
    }
  );

  const [profile, setProfile] = useState<UserProfileData>(() => {
    if (initialProfile) return initialProfile;
    return {
      id: sessionUser?.id || '',
      username: sessionUser?.username || '',
      firstName: sessionUser?.name?.split(' ')[0] || '',
      lastName: sessionUser?.name?.split(' ').slice(1).join(' ') || '',
      email: sessionUser?.email || '',
      emailVerified: false,
      nickname: sessionUser?.name || sessionUser?.username || '',
      telegram: '',
      species: 'Other',
      pronouns: '',
      phone: '',
      street: '',
      zip: '',
      city: '',
      country: 'Germany',
      dob: '',
      avatarUrl: sessionUser?.image || '',
    };
  });

  const [settings, setSettings] = useState<PortalSettings>(() => ({
    conventionName:
      initialSettings?.conventionName ?? DEFAULT_PORTAL_SETTINGS.conventionName,
    quickLinks: initialSettings?.quickLinks ?? DEFAULT_PORTAL_SETTINGS.quickLinks,
  }));

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!initialProfile) {
      fetch('/api/profile')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setProfile(data);
        })
        .catch((err) => console.error('Failed to load profile:', err))
        .finally(() => setIsLoadingProfile(false));
    }

    if (!initialSecurity) {
      fetch('/api/profile/security')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setSecurity(data);
        })
        .catch((err) => console.error('Failed to load security info:', err))
        .finally(() => setIsLoadingSecurity(false));
    }
  }, [initialProfile, initialSecurity]);

  const navigate = (href: string) => {
    closeMobileNav();
    router.push(href);
  };

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { logoutUrl?: string };
        if (data.logoutUrl) {
          window.location.href = data.logoutUrl;
          return;
        }
      }
    } catch {
      // Fallback to local signout
    }
    window.location.href = '/api/auth/signout';
  };

  const initials = (profile.nickname || profile.username || '?')
    .slice(0, 2)
    .toUpperCase();

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{
        width: 240,
        breakpoint: 'sm',
        collapsed: { mobile: !mobileNavOpened },
      }}
      bg="var(--mantine-color-dark-8)"
    >
      <AppShell.Header bg="var(--mantine-color-dark-7)">
        <Group
          h="100%"
          px={{ base: 'sm', sm: 'lg' }}
          justify="space-between"
          wrap="nowrap"
          gap="xs"
        >
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <Burger
              opened={mobileNavOpened}
              onClick={toggleMobileNav}
              hiddenFrom="sm"
              size="sm"
              aria-label="Toggle navigation"
              style={{ flexShrink: 0 }}
            />
            <ThemeIcon
              variant="light"
              color="cyan"
              size="md"
              radius="sm"
              style={{ flexShrink: 0 }}
            >
              <Text size="xs" fw={800}>
                WF
              </Text>
            </ThemeIcon>
            <Text fw={700} size="sm" truncate style={{ minWidth: 0 }}>
              WinterFur Manage
            </Text>
          </Group>

          <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
            <Avatar
              src={getSafeAvatarUrl(profile.avatarUrl)}
              radius="xl"
              size={30}
              color="cyan"
              style={{ flexShrink: 0 }}
            >
              {initials}
            </Avatar>
            <Text size="sm" fw={500} visibleFrom="sm">
              {profile.nickname || profile.username}
            </Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Sign out of WinterFur Manage"
              title="Sign out"
              style={{ flexShrink: 0 }}
              onClick={() => void handleLogout()}
            >
              <IconLogout size={16} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm" bg="var(--mantine-color-dark-7)">
        <Stack gap="md">
          <div>
            <NavSectionLabel>Account</NavSectionLabel>
            <NavLink
              label="My Profile"
              leftSection={<IconUser size={16} />}
              active={activeTab === 'profile'}
              onClick={() => navigate('/profile')}
            />
          </div>

          {isCrew && (
            <div>
              <NavSectionLabel>Crew</NavSectionLabel>
              <NavLink
                label="Crew Dashboard"
                leftSection={<IconPaw size={16} />}
                active={activeTab === 'crew'}
                onClick={() => navigate('/crew')}
              />
              <NavLink
                label="Org Chart"
                leftSection={<IconSitemap size={16} />}
                active={activeTab === 'org-chart'}
                onClick={() => navigate('/crew/org-chart')}
              />
            </div>
          )}

          {hasFurryResources && (
            <div>
              <NavSectionLabel>Furry Resources</NavSectionLabel>
              {canReadFrCrew && (
                <NavLink
                  label="Crew Management"
                  leftSection={<IconUsersGroup size={16} />}
                  active={activeTab === 'fr-crew'}
                  onClick={() => navigate('/fr/crew')}
                />
              )}
              {canReadDepartments && (
                <NavLink
                  label="Departments"
                  leftSection={<IconBuilding size={16} />}
                  active={activeTab === 'fr-departments'}
                  onClick={() => navigate('/fr/departments')}
                />
              )}
              {canReadSkills && (
                <NavLink
                  label="Skills"
                  leftSection={<IconAward size={16} />}
                  active={activeTab === 'fr-skills'}
                  onClick={() => navigate('/fr/skills')}
                />
              )}
              {!isAdmin && canViewLogs && (
                <NavLink
                  label="Audit Logs"
                  leftSection={<IconHistory size={16} />}
                  active={activeTab === 'logs'}
                  onClick={() => navigate('/logs')}
                />
              )}
            </div>
          )}

          {!isAdmin && !hasFurryResources && canViewLogs && (
            <div>
              <NavSectionLabel>Logs</NavSectionLabel>
              <NavLink
                label="Audit Logs"
                leftSection={<IconHistory size={16} />}
                active={activeTab === 'logs'}
                onClick={() => navigate('/logs')}
              />
            </div>
          )}

          {isAdmin && (
            <div>
              <NavSectionLabel>Administration</NavSectionLabel>
              <NavLink
                label="Portal Settings"
                leftSection={<IconSettings size={16} />}
                active={activeTab === 'admin'}
                onClick={() => navigate('/admin')}
              />
              {canViewLogs && (
                <NavLink
                  label="Audit Logs"
                  leftSection={<IconHistory size={16} />}
                  active={activeTab === 'logs'}
                  onClick={() => navigate('/logs')}
                />
              )}
            </div>
          )}
        </Stack>
      </AppShell.Navbar>

      <AppShell.Main bg="var(--mantine-color-dark-8)">
        <Box
          maw={activeTab === 'org-chart' ? '100%' : 1360}
          mx="auto"
          p={{ base: 'md', sm: activeTab === 'org-chart' ? 'lg' : 'xl' }}
        >
          {activeTab === 'profile' && (
            <ProfileWorkspace
              profile={profile}
              onProfileChange={setProfile}
              security={security}
              onSecurityChange={setSecurity}
              isLoadingProfile={isLoadingProfile}
              isLoadingSecurity={isLoadingSecurity}
            />
          )}

          {activeTab === 'crew' && isCrew && (
            <CrewDashboardWorkspace
              nickname={profile.nickname || profile.username}
              quickLinks={settings.quickLinks}
              crewRoles={initialCrewRoles ?? []}
              crewSkills={initialCrewSkills ?? []}
            />
          )}

          {activeTab === 'org-chart' && isCrew && <OrgChartWorkspace />}

          {((activeTab === 'fr-crew' && canReadFrCrew) ||
            (activeTab === 'fr-departments' && canReadDepartments) ||
            (activeTab === 'fr-skills' && canReadSkills)) && (
            <FrWorkspace
              currentUserId={sessionUser?.id}
              isFrAdmin={isFrAdmin}
              canWriteDepartments={canWriteDepartments}
              canWriteSkills={canWriteSkills}
              detailUserId={frCrewDetailUserId ?? undefined}
              section={
                activeTab === 'fr-departments'
                  ? 'departments'
                  : activeTab === 'fr-skills'
                  ? 'skills'
                  : 'crew'
              }
            />
          )}

          {activeTab === 'admin' && isAdmin && (
            <AdminSettingsWorkspace
              conventionName={settings.conventionName}
              quickLinks={settings.quickLinks}
              identityConfig={identityConfig}
              onSettingsUpdated={setSettings}
            />
          )}

          {activeTab === 'logs' && canViewLogs && (
            <AuditLogsWorkspace
              canViewFr={canViewFrLogs}
              canViewAdmin={canViewAdminLogs}
              canViewAll={canViewAllLogs}
            />
          )}
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
