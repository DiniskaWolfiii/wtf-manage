const VERIFY_EMAIL_COOLDOWN_MS = 60 * 1000;
const MAX_COOLDOWN_ENTRIES = 1000;

const globalForVerifyCooldown = globalThis as unknown as {
  verifyEmailCooldownMap?: Map<string, number>;
};

function getCooldownMap(): Map<string, number> {
  if (!globalForVerifyCooldown.verifyEmailCooldownMap) {
    globalForVerifyCooldown.verifyEmailCooldownMap = new Map<string, number>();
  }
  return globalForVerifyCooldown.verifyEmailCooldownMap;
}

function pruneCooldowns(map: Map<string, number>, now: number): void {
  for (const [uid, ts] of map.entries()) {
    if (now - ts >= VERIFY_EMAIL_COOLDOWN_MS) {
      map.delete(uid);
    }
  }
  while (map.size >= MAX_COOLDOWN_ENTRIES) {
    const oldest = map.keys().next().value;
    if (!oldest) break;
    map.delete(oldest);
  }
}

/**
 * Returns the remaining cooldown in seconds before another verification email
 * may be sent for `userId`, or `0` if sending is currently permitted.
 */
export function getVerifyEmailRetryAfterSec(userId: string): number {
  const map = getCooldownMap();
  const now = Date.now();
  pruneCooldowns(map, now);

  const lastSent = map.get(userId);
  if (!lastSent || now - lastSent >= VERIFY_EMAIL_COOLDOWN_MS) {
    return 0;
  }
  return Math.ceil((VERIFY_EMAIL_COOLDOWN_MS - (now - lastSent)) / 1000);
}

/**
 * Records that a verification email was just dispatched for `userId`.
 */
export function markVerifyEmailSent(userId: string): void {
  const map = getCooldownMap();
  const now = Date.now();
  pruneCooldowns(map, now);
  map.set(userId, now);
}
