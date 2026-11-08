import { NextResponse } from 'next/server';
import { auth } from '@/auth';
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

  const success = await deleteUserCredential(session.user.id, credentialId);

  return NextResponse.json({ success });
}
