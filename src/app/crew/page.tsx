import { auth } from '@/auth';
import { getCrewRolesForUser } from '@/lib/crew';
import { getCrewSkillsForUser } from '@/lib/skills';
import { fetchKeycloakUser, fetchUserCredentials } from '@/lib/keycloak';
import { getServerAccessToken } from '@/lib/server-auth';
import { getIdentityDisplayConfig, getPortalSettings } from '@/lib/settings';
import { PortalShell } from '@/components/PortalShell';
import { redirect } from 'next/navigation';

export default async function CrewPage() {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    redirect('/login?callbackUrl=/crew');
  }

  const roles = (session.user as unknown as { roles?: string[] }).roles || [];
  if (!roles.includes('crew')) {
    redirect('/profile');
  }

  const accessToken = await getServerAccessToken();
  const [initialProfile, initialSecurity, initialSettings, initialCrewRoles, initialCrewSkills] =
    await Promise.all([
      fetchKeycloakUser(session.user.id, accessToken),
      fetchUserCredentials(session.user.id),
      getPortalSettings(),
      getCrewRolesForUser(session.user.id),
      getCrewSkillsForUser(session.user.id),
    ]);
  const identityConfig = getIdentityDisplayConfig();

  const user = {
    id: session.user.id,
    name: session.user.name || '',
    email: session.user.email || '',
    image: session.user.image || '',
    username: (session.user as unknown as { username?: string }).username || session.user.name || '',
    roles: (session.user as unknown as { roles?: string[] }).roles || [],
  };

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
