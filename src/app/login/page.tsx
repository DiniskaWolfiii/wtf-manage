import { auth } from '@/auth';
import { LoginView } from '@/components/LoginView';
import { redirect } from 'next/navigation';

function getSafeCallbackUrl(raw?: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return '/profile';
  }
  try {
    const parsed = new URL(raw, 'https://placeholder.local');
    if (parsed.origin !== 'https://placeholder.local') {
      return '/profile';
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '/profile';
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; loggedOut?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = getSafeCallbackUrl(params.callbackUrl);
  const session = await auth();

  if (session?.user?.id) {
    redirect(callbackUrl);
  }

  return (
    <LoginView
      callbackUrl={callbackUrl}
      error={params.error}
      loggedOut={params.loggedOut === '1'}
    />
  );
}
