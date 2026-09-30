import { randomUUID } from "node:crypto";

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  roles: string[];
  createdAt: Date;
}

const users = new Map<string, UserRecord>();

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return users.get(email) ?? null;
}

export async function findUserById(id: string): Promise<UserRecord | null> {
  for (const user of users.values()) {
    if (user.id === id) return user;
  }
  return null;
}

export async function createUser(input: {
  email: string;
  displayName: string;
  passwordHash: string;
}): Promise<UserRecord> {
  const user: UserRecord = {
    id: `usr_${randomUUID()}`,
    email: input.email,
    displayName: input.displayName,
    passwordHash: input.passwordHash,
    roles: ["user"],
    createdAt: new Date()
  };

  users.set(user.email, user);
  return user;
}

export async function updatePassword(
  userId: string,
  passwordHash: string
): Promise<boolean> {
  const user = await findUserById(userId);
  if (!user) return false;
  user.passwordHash = passwordHash;
  return true;
}
