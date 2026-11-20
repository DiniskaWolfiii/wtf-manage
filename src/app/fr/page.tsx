import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function FrIndexPage() {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    redirect('/login?callbackUrl=/fr/crew');
  }

  const roles = (session.user as unknown as { roles?: string[] }).roles || [];
  if (!roles.includes('furry_ressources') && !roles.includes('furry_ressources_admin')) {
    redirect('/profile');
  }

  redirect('/fr/crew');
}
