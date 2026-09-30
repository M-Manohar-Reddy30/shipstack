import { randomUUID } from "node:crypto";

interface SessionRecord {
  id: string;
  userId: string;
  secretHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

const sessions = new Map<string, SessionRecord>();

export async function createSession(
  userId: string,
  secretHash: string,
  ttlSeconds: number
): Promise<SessionRecord> {
  const session: SessionRecord = {
    id: `ses_${randomUUID()}`,
    userId,
    secretHash,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    revokedAt: null
  };

  sessions.set(session.id, session);
  return session;
}

export async function findActiveSession(
  secretHash: string
): Promise<SessionRecord | null> {
  for (const session of sessions.values()) {
    if (
      session.secretHash === secretHash &&
      session.revokedAt === null &&
      session.expiresAt.getTime() > Date.now()
    ) {
      return session;
    }
  }
  return null;
}

export async function revokeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (session) session.revokedAt = new Date();
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  for (const session of sessions.values()) {
    if (session.userId === userId && session.revokedAt === null) {
      session.revokedAt = new Date();
    }
  }
}
