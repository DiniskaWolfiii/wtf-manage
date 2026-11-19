import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { auth } from '@/auth';
import { recordAuditLog } from '@/lib/audit';
import { fetchKeycloakUser, updateKeycloakUser } from '@/lib/keycloak';
import { getServerAccessToken } from '@/lib/server-auth';
import { deleteAvatarByUrl, isStorageConfigured, uploadAvatarBuffer } from '@/lib/storage';
import { ALLOWED_AVATAR_MIME_TYPES, MAX_AVATAR_UPLOAD_BYTES } from '@/lib/validation';

const ALLOWED_SHARP_FORMATS = new Set(['png', 'jpeg', 'webp', 'gif']);
const AVATAR_DIMENSION_PX = 256;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: 'Avatar storage is not configured on the server.' },
      { status: 503 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
  }

  if (file.size === 0 || file.size > MAX_AVATAR_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: 'Image must be between 1 byte and 5 MB.' },
      { status: 400 }
    );
  }

  if (file.type && !ALLOWED_AVATAR_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Unsupported image type. Allowed: PNG, JPEG, WEBP, GIF.' },
      { status: 400 }
    );
  }

  let webpBuffer: Buffer;
  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const image = sharp(inputBuffer, { limitInputPixels: 25_000_000 });
    const metadata = await image.metadata();

    if (!metadata.format || !ALLOWED_SHARP_FORMATS.has(metadata.format)) {
      return NextResponse.json(
        { error: 'Invalid image content. Allowed: PNG, JPEG, WEBP, GIF.' },
        { status: 400 }
      );
    }

    webpBuffer = await image
      .rotate()
      .resize(AVATAR_DIMENSION_PX, AVATAR_DIMENSION_PX, {
        fit: 'cover',
        position: 'center',
      })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return NextResponse.json(
      { error: 'Could not process the uploaded image.' },
      { status: 400 }
    );
  }

  const userId = session.user.id;
  const accessToken = await getServerAccessToken();
  const currentProfile = await fetchKeycloakUser(userId, accessToken);
  const previousAvatarUrl = currentProfile?.avatarUrl;

  let newAvatarUrl: string;
  try {
    newAvatarUrl = await uploadAvatarBuffer(userId, webpBuffer);
  } catch (err) {
    console.error('Failed to upload avatar to R2:', err);
    return NextResponse.json(
      { error: 'Failed to store avatar image.' },
      { status: 502 }
    );
  }

  const synced = await updateKeycloakUser(userId, { avatarUrl: newAvatarUrl }, accessToken);
  if (!synced) {
    await deleteAvatarByUrl(newAvatarUrl, userId).catch(() => {});
    return NextResponse.json(
      { error: 'Could not sync avatar URL to WinterFur Identity.' },
      { status: 502 }
    );
  }

  if (previousAvatarUrl && previousAvatarUrl !== newAvatarUrl) {
    await deleteAvatarByUrl(previousAvatarUrl, userId).catch((err) => {
      console.error('Failed to delete previous avatar from R2:', err);
    });
  }

  const actorUsername =
    currentProfile?.username ||
    (session.user as unknown as { username?: string }).username ||
    session.user.name ||
    userId;
  await recordAuditLog({
    category: 'profile',
    action: 'profile.avatar_updated',
    actorUserId: userId,
    actorUsername,
    targetType: 'user',
    targetId: userId,
    targetLabel: actorUsername,
    summary: `Updated profile avatar for "${actorUsername}"`,
    metadata: { operation: 'upload' },
  });

  return NextResponse.json({ avatarUrl: newAvatarUrl });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const accessToken = await getServerAccessToken();
  const currentProfile = await fetchKeycloakUser(userId, accessToken);

  const synced = await updateKeycloakUser(userId, { avatarUrl: '' }, accessToken);
  if (!synced) {
    return NextResponse.json(
      { error: 'Could not remove avatar from WinterFur Identity.' },
      { status: 502 }
    );
  }

  if (currentProfile?.avatarUrl) {
    await deleteAvatarByUrl(currentProfile.avatarUrl, userId).catch((err) => {
      console.error('Failed to delete avatar from R2:', err);
    });
  }

  const actorUsername =
    currentProfile?.username ||
    (session.user as unknown as { username?: string }).username ||
    session.user.name ||
    userId;
  await recordAuditLog({
    category: 'profile',
    action: 'profile.avatar_updated',
    actorUserId: userId,
    actorUsername,
    targetType: 'user',
    targetId: userId,
    targetLabel: actorUsername,
    summary: `Removed profile avatar for "${actorUsername}"`,
    metadata: { operation: 'delete' },
  });

  return NextResponse.json({ success: true, avatarUrl: '' });
}
