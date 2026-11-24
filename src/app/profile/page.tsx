import { fetchKeycloakUser, fetchUserCredentials } from '@/lib/keycloak';
import { getServerAccessToken, getSessionWithPermissions } from '@/lib/server-auth';
import { getIdentityDisplayConfig, getPortalSettings } from '@/lib/settings';
import { PortalShell } from '@/components/PortalShell';
import { redirect } from 'next/navigation';

export default async function ProfilePage() {
  const user = await getSessionWithPermissions();

  if (!user) {
    redirect('/login?callbackUrl=/profile');
  }

  const accessToken = await getServerAccessToken();
  const [initialProfile, initialSecurity, initialSettings] = await Promise.all([
    fetchKeycloakUser(user.id, accessToken),
    fetchUserCredentials(user.id),
    getPortalSettings(),
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
