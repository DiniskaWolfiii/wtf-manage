import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchKeycloakUser, updateKeycloakUser, UserProfileData } from '@/lib/keycloak';
import { getServerAccessToken } from '@/lib/server-auth';
import { sanitizeProfileUpdate } from '@/lib/validation';

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

    const success = await updateKeycloakUser(userId, sanitizedBody, accessToken);

    return NextResponse.json({
      success,
      message: success ? 'Profile updated in WinterFur Identity' : 'Could not sync to WinterFur Identity backend',
    });
  } catch (err) {
    console.error('Failed to update profile:', err);
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
