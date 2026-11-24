import { getSessionWithPermissions } from '@/lib/server-auth';
import { redirect } from 'next/navigation';

export default async function FrIndexPage() {
  const user = await getSessionWithPermissions();

  if (!user) {
    redirect('/login?callbackUrl=/fr/crew');
  }

  if (user.permissions.includes('fr.crew.view') || user.permissions.includes('fr.crew.manage')) {
    redirect('/fr/crew');
  }

  if (
    user.permissions.includes('fr.departments.view') ||
    user.permissions.includes('fr.departments.manage')
  ) {
    redirect('/fr/departments');
  }

  if (user.permissions.includes('fr.skills.view') || user.permissions.includes('fr.skills.manage')) {
    redirect('/fr/skills');
  }

  redirect('/profile');
}
