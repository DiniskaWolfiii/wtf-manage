import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { recordAuditLog } from '@/lib/audit';
import { getExpectedAppOrigin } from '@/lib/csrf';
import { fetchKeycloakUser, sendKeycloakVerifyEmail } from '@/lib/keycloak';
import { getServerAccessToken } from '@/lib/server-auth';
import {
  getVerifyEmailRetryAfterSec,
  markVerifyEmailSent,
} from '@/lib/verify-email-cooldown';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const retryAfterSec = getVerifyEmailRetryAfterSec(userId);
  if (retryAfterSec > 0) {
    return NextResponse.json(
      { error: `Please wait ${retryAfterSec}s before requesting another verification email.` },
      { status: 429 }
    );
  }

  const accessToken = await getServerAccessToken();
  const profile = await fetchKeycloakUser(userId, accessToken);
  if (!profile?.email) {
    return NextResponse.json({ error: 'No email address configured on your profile.' }, { status: 400 });
  }
  if (profile.emailVerified) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const redirectUri = new URL('/profile', getExpectedAppOrigin(req.url)).toString();
  const sent = await sendKeycloakVerifyEmail(userId, redirectUri);
  if (!sent) {
    return NextResponse.json(
      { error: 'Failed to send verification email via WinterFur Identity.' },
      { status: 502 }
    );
  }

  markVerifyEmailSent(userId);

  const actorUsername =
    profile.username ||
    (session.user as unknown as { username?: string }).username ||
    session.user.name ||
    userId;

  await recordAuditLog({
    category: 'profile',
    action: 'profile.email_verification_sent',
    actorUserId: userId,
    actorUsername,
    targetType: 'user',
    targetId: userId,
    targetLabel: actorUsername,
    summary: `Requested email verification link for "${actorUsername}"`,
    metadata: { triggeredBy: 'self_service' },
  });

  return NextResponse.json({ ok: true, sent: true });
}
