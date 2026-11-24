import { fetchKeycloakUser, fetchUserCredentials } from '@/lib/keycloak';
import { getServerAccessToken, getSessionWithPermissions } from '@/lib/server-auth';
import { getIdentityDisplayConfig, getPortalSettingsForPermissions } from '@/lib/settings';
import { PortalShell } from '@/components/PortalShell';
import { redirect } from 'next/navigation';

export default async function FrCrewPage() {
  const user = await getSessionWithPermissions();

  if (!user) {
    redirect('/login?callbackUrl=/fr/crew');
  }

  if (!user.permissions.includes('fr.crew.view') && !user.permissions.includes('fr.crew.manage')) {
    redirect('/profile');
  }

  const accessToken = await getServerAccessToken();
  const [initialProfile, initialSecurity, initialSettings] = await Promise.all([
    fetchKeycloakUser(user.id, accessToken),
    fetchUserCredentials(user.id),
    getPortalSettingsForPermissions(user.permissions),
  ]);
  const identityConfig = getIdentityDisplayConfig();

  return (
    <PortalShell
      sessionUser={user}
      initialProfile={initialProfile || undefined}
      initialSecurity={initialSecurity}
      initialSettings={initialSettings}
      identityConfig={identityConfig}
    />
  );
}
