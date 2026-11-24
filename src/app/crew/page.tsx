import { getCrewRolesForUser } from '@/lib/crew';
import { getCrewSkillsForUser } from '@/lib/skills';
import { fetchKeycloakUser, fetchUserCredentials } from '@/lib/keycloak';
import { getServerAccessToken, getSessionWithPermissions } from '@/lib/server-auth';
import { getIdentityDisplayConfig, getPortalSettings } from '@/lib/settings';
import { PortalShell } from '@/components/PortalShell';
import { redirect } from 'next/navigation';

export default async function CrewPage() {
  const user = await getSessionWithPermissions();

  if (!user) {
    redirect('/login?callbackUrl=/crew');
  }

  if (!user.permissions.includes('crew.view')) {
    redirect('/profile');
  }

  const accessToken = await getServerAccessToken();
  const [initialProfile, initialSecurity, initialSettings, initialCrewRoles, initialCrewSkills] =
    await Promise.all([
      fetchKeycloakUser(user.id, accessToken),
      fetchUserCredentials(user.id),
      getPortalSettings(),
      getCrewRolesForUser(user.id),
      getCrewSkillsForUser(user.id),
    ]);
  const identityConfig = getIdentityDisplayConfig();

  return (
    <PortalShell
      sessionUser={user}
      initialProfile={initialProfile || undefined}
      initialSecurity={initialSecurity}
      initialSettings={initialSettings}
      identityConfig={identityConfig}
      initialCrewRoles={initialCrewRoles}
      initialCrewSkills={initialCrewSkills}
    />
  );
}
