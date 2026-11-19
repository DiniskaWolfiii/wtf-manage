import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { recordAuditLog } from '@/lib/audit';
import { fetchUserCredentials, deleteUserCredential } from '@/lib/keycloak';

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

  const success = await deleteUserCredential(session.user.id, credentialId);

  if (success) {
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
      summary: `Removed security credential (${credentialId}) for "${actorUsername}"`,
      metadata: { credentialId },
    });
  }

  return NextResponse.json({ success });
}

