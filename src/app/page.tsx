import { auth } from '@/auth';
import { PortalShell } from '@/components/PortalShell';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await auth();

  if (!session || !session.user) {
    redirect('/api/auth/signin?callbackUrl=/');
  }

  const user = {
    id: session.user.id || '',
    name: session.user.name || '',
    email: session.user.email || '',
    image: session.user.image || '',
    username: (session.user as unknown as { username?: string }).username || session.user.name || '',
    roles: (session.user as unknown as { roles?: string[] }).roles || [],
  };

  return <PortalShell sessionUser={user} />;
}
