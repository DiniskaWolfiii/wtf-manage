import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { recordAuditLog } from '@/lib/audit';
import { syncKeycloakSnapshotIfExists } from '@/lib/crew-profiles';
import { getExpectedAppOrigin } from '@/lib/csrf';
import {
  fetchKeycloakUser,
  sendKeycloakVerifyEmail,
  updateKeycloakUser,
  UserProfileData,
} from '@/lib/keycloak';
import { getServerAccessToken } from '@/lib/server-auth';
import { sanitizeProfileUpdate } from '@/lib/validation';
import {
  getVerifyEmailRetryAfterSec,
  markVerifyEmailSent,
} from '@/lib/verify-email-cooldown';

export async function GET() {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const accessToken = await getServerAccessToken();

  // Try to fetch real profile from Keycloak
  const profile = await fetchKeycloakUser(userId, accessToken);

  if (profile) {
    return NextResponse.json(profile);
  }

  // Graceful fallback to session data if Keycloak Admin API is unreachable
  const fallbackProfile: UserProfileData = {
    id: userId,
    username: (session.user as unknown as { username?: string }).username || session.user.name || 'User',
    firstName: session.user.name?.split(' ')[0] || '',
    lastName: session.user.name?.split(' ').slice(1).join(' ') || '',
    email: session.user.email || '',
    nickname: (session.user as unknown as { username?: string }).username || session.user.name || 'User',
    telegram: '',
    species: 'Other',
    pronouns: '',
    phone: '',
    street: '',
    zip: '',
    city: '',
    country: 'Germany',
    dob: '',
    avatarUrl: session.user.image || '',
  };

  return NextResponse.json(fallbackProfile);
}

export async function PUT(req: Request) {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rawBody: unknown = await req.json();
    const sanitizedBody = sanitizeProfileUpdate(rawBody);
    if (!sanitizedBody) {
      return NextResponse.json({ error: 'Invalid profile payload' }, { status: 400 });
    }

    const userId = session.user.id;
    const accessToken = await getServerAccessToken();
    const previousProfile = await fetchKeycloakUser(userId, accessToken);

    const emailChanged =
      typeof sanitizedBody.email === 'string' &&
      sanitizedBody.email.length > 0 &&
      sanitizedBody.email.toLowerCase() !== (previousProfile?.email || '').trim().toLowerCase();

    const success = await updateKeycloakUser(userId, sanitizedBody, accessToken);

    let verificationEmailSent = false;
    let verificationCooldownSec = 0;
    if (success) {
      await syncKeycloakSnapshotIfExists(userId, sanitizedBody);

      if (emailChanged) {
        verificationCooldownSec = getVerifyEmailRetryAfterSec(userId);
        if (verificationCooldownSec === 0) {
          const redirectUri = new URL('/profile', getExpectedAppOrigin(req.url)).toString();
          verificationEmailSent = await sendKeycloakVerifyEmail(userId, redirectUri);
          if (verificationEmailSent) {
            markVerifyEmailSent(userId);
          }
        }
      }

      const changedFields: string[] = [];
      for (const [key, nextVal] of Object.entries(sanitizedBody)) {
        if (typeof nextVal !== 'string') continue;
        const prevVal = previousProfile
          ? String((previousProfile as unknown as Record<string, unknown>)[key] ?? '')
          : '';
        if (prevVal !== nextVal) {
          changedFields.push(key);
        }
      }

      const actorUsername =
        previousProfile?.username ||
        (session.user as unknown as { username?: string }).username ||
        session.user.name ||
        userId;

      await recordAuditLog({
        category: 'profile',
        action: 'profile.updated',
        actorUserId: userId,
        actorUsername,
        targetType: 'user',
        targetId: userId,
        targetLabel: actorUsername,
        summary: `Updated profile fields (${changedFields.join(', ') || 'no changes'})`,
        metadata: {
          changedFields,
          ...(emailChanged ? { emailChanged: true, verificationEmailSent } : {}),
        },
      });
    }

    return NextResponse.json({
      success,
      emailChanged: success && emailChanged,
      emailVerified: success && emailChanged ? false : previousProfile?.emailVerified,
      verificationEmailSent,
      message: success
        ? emailChanged
          ? verificationEmailSent
            ? 'Profile saved! Please verify your new email address via the verification link we sent you.'
            : verificationCooldownSec > 0
            ? `Profile saved! Please wait ${verificationCooldownSec}s and use "Resend Verification" to verify your new email.`
            : 'Profile saved, but the verification email could not be sent automatically. Please use "Resend Verification".'
          : 'Profile updated in WinterFur Identity'
        : 'Could not sync to WinterFur Identity backend',
    });
  } catch (err) {
    console.error('Failed to update profile:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
