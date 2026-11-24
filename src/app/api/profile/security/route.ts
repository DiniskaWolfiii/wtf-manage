import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { recordAuditLog } from '@/lib/audit';
import { fetchUserCredentials, deleteUserPasskeyCredential } from '@/lib/keycloak';

export async function GET() {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const status = await fetchUserCredentials(session.user.id);
  return NextResponse.json(status);
}

export async function DELETE(req: Request) {
  const session = await auth();

  if (!session || !session.user || !session.user.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const credentialId = searchParams.get('credentialId');

  if (!credentialId) {
    return NextResponse.json({ error: 'Missing credentialId' }, { status: 400 });
  }

  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(credentialId)) {
    return NextResponse.json({ error: 'Invalid credentialId' }, { status: 400 });
  }

  const result = await deleteUserPasskeyCredential(session.user.id, credentialId);

  if (result === 'forbidden') {
    return NextResponse.json(
      { error: 'Only passkey credentials can be removed from this endpoint' },
      { status: 403 }
    );
  }
  if (result === 'not_found') {
    return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
  }
  if (result !== 'deleted') {
    return NextResponse.json(
      { error: 'Failed to remove passkey credential' },
      { status: 502 }
    );
  }

  const actorUsername =
    (session.user as unknown as { username?: string }).username ||
    session.user.name ||
    session.user.id;
  await recordAuditLog({
    category: 'profile',
    action: 'profile.passkey_deleted',
    actorUserId: session.user.id,
    actorUsername,
    targetType: 'credential',
    targetId: credentialId,
    targetLabel: actorUsername,
    summary: `Removed passkey credential (${credentialId}) for "${actorUsername}"`,
    metadata: { credentialId },
  });

  return NextResponse.json({ success: true });
}

