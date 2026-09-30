import { randomBytes } from "node:crypto";

import { env } from "../config/env.js";
import {
  createUser,
  findUserByEmail,
  findUserById,
  updatePassword,
  type UserRecord
} from "../repositories/user.repository.js";
import {
  createSession,
  revokeAllUserSessions,
  revokeSession
} from "../repositories/session.repository.js";
import {
  hashPassword,
  verifyPassword
} from "../utils/password.js";
import {
  generateSessionSecret,
  hashSessionSecret
} from "../utils/session.js";
import type {
  LoginInput,
  PasswordChangeInput,
  RegisterInput
} from "../schemas/auth.schemas.js";

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly details: unknown[] = []
  ) {
    super(message);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function publicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    display_name: user.displayName,
    roles: user.roles
  };
}

export async function register(input: RegisterInput) {
  const email = normalizeEmail(input.email);
  const existing = await findUserByEmail(email);

  if (existing) {
    throw new AuthServiceError(
      "An account with these details already exists.",
      409,
      "ACCOUNT_ALREADY_EXISTS"
    );
  }

  const passwordHash = await hashPassword(input.password);

  const user = await createUser({
    email,
    displayName: input.display_name,
    passwordHash
  });

  return publicUser(user);
}

export async function login(input: LoginInput) {
  const email = normalizeEmail(input.email);
  const user = await findUserByEmail(email);

  if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
    throw new AuthServiceError(
      "Email or password is incorrect.",
      401,
      "INVALID_CREDENTIALS"
    );
  }

  const secret = generateSessionSecret();

  await createSession(
    user.id,
    hashSessionSecret(secret),
    env.SESSION_TTL_SECONDS
  );

  return {
    user: publicUser(user),
    sessionSecret: secret
  };
}

export async function logout(sessionId: string): Promise<void> {
  await revokeSession(sessionId);
}

export async function getCurrentUser(userId: string) {
  const user = await findUserById(userId);

  if (!user) {
    throw new AuthServiceError(
      "Authentication is required.",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  }

  return publicUser(user);
}

export async function changePassword(
  userId: string,
  input: PasswordChangeInput
): Promise<void> {
  const user = await findUserById(userId);

  if (!user) {
    throw new AuthServiceError(
      "Authentication is required.",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  }

  const currentPasswordValid = await verifyPassword(
    user.passwordHash,
    input.current_password
  );

  if (!currentPasswordValid) {
    throw new AuthServiceError(
      "The current password is incorrect.",
      401,
      "INVALID_CURRENT_PASSWORD"
    );
  }

  const newPasswordHash = await hashPassword(input.new_password);

  await updatePassword(user.id, newPasswordHash);
  await revokeAllUserSessions(user.id);
}

export async function requestPasswordReset(emailInput: string) {
  const email = normalizeEmail(emailInput);
  const user = await findUserByEmail(email);

  // Reference implementation: generate only for an existing account.
  // Production delivery must be asynchronous and must never log this token.
  if (!user) {
    return;
  }

  const token = randomBytes(32).toString("base64url");

  // TODO: persist only a hash of token with an expiry and single-use state.
  // TODO: enqueue an email containing the raw token.
  void token;
}

export async function confirmPasswordReset(
  _token: string,
  _newPassword: string
): Promise<void> {
  // TODO: look up a hashed, unexpired, unused reset token.
  // TODO: atomically consume the token and update the password.
  // TODO: revoke active sessions after successful reset.
  throw new AuthServiceError(
    "The password reset flow is not implemented in this reference skeleton.",
    501,
    "NOT_IMPLEMENTED"
  );
}
