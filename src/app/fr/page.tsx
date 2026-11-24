import { getSessionWithPermissions } from '@/lib/server-auth';
import { redirect } from 'next/navigation';

export default async function FrIndexPage() {
  const user = await getSessionWithPermissions();

  if (!user) {
    redirect('/login?callbackUrl=/fr/crew');
  }

  if (!user.permissions.includes('fr.read') && !user.permissions.includes('fr.write')) {
    redirect('/profile');
  }

  redirect('/fr/crew');
}
