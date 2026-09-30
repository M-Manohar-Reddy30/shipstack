import type { Request, Response } from "express";

import { env } from "../config/env.js";
import {
  loginSchema,
  passwordChangeSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema
} from "../schemas/auth.schemas.js";
import {
  AuthServiceError,
  changePassword,
  confirmPasswordReset,
  getCurrentUser,
  login,
  logout,
  register,
  requestPasswordReset
} from "../services/auth.service.js";

function validationError(requestId: string, error: unknown): AuthServiceError {
  return new AuthServiceError(
    "One or more fields are invalid.",
    400,
    "VALIDATION_ERROR",
    [
      {
        message: error instanceof Error ? error.message : "Invalid request."
      }
    ]
  );
}

export async function registerController(req: Request, res: Response): Promise<void> {
  try {
    const input = registerSchema.parse(req.body);
    const user = await register(input);

    res.status(201).json({
      data: { user },
      request_id: req.requestId
    });
  } catch (error) {
    if (error instanceof AuthServiceError) throw error;
    throw validationError(req.requestId, error);
  }
}

export async function loginController(req: Request, res: Response): Promise<void> {
  try {
    const input = loginSchema.parse(req.body);
    const result = await login(input);

    res.cookie(env.SESSION_COOKIE_NAME, result.sessionSecret, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: env.SESSION_TTL_SECONDS * 1000
    });

    res.status(200).json({
      data: { user: result.user },
      request_id: req.requestId
    });
  } catch (error) {
    if (error instanceof AuthServiceError) throw error;
    throw validationError(req.requestId, error);
  }
}

export async function logoutController(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    throw new AuthServiceError(
      "Authentication is required.",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  }

  await logout(req.auth.sessionId);

  res.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  res.status(204).send();
}

export async function meController(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    throw new AuthServiceError(
      "Authentication is required.",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  }

  const user = await getCurrentUser(req.auth.userId);

  res.status(200).json({
    data: { user },
    request_id: req.requestId
  });
}

export async function passwordResetRequestController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const input = passwordResetRequestSchema.parse(req.body);
    await requestPasswordReset(input.email);

    res.status(202).json({
      data: {
        message:
          "If an account matches this email address, password reset instructions will be sent."
      },
      request_id: req.requestId
    });
  } catch (error) {
    if (error instanceof AuthServiceError) throw error;
    throw validationError(req.requestId, error);
  }
}

export async function passwordResetConfirmController(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const input = passwordResetConfirmSchema.parse(req.body);
    await confirmPasswordReset(input.token, input.new_password);

    res.status(200).json({
      data: {
        message: "Password has been reset successfully."
      },
      request_id: req.requestId
    });
  } catch (error) {
    if (error instanceof AuthServiceError) throw error;
    throw validationError(req.requestId, error);
  }
}

export async function passwordChangeController(
  req: Request,
  res: Response
): Promise<void> {
  if (!req.auth) {
    throw new AuthServiceError(
      "Authentication is required.",
      401,
      "AUTHENTICATION_REQUIRED"
    );
  }

  try {
    const input = passwordChangeSchema.parse(req.body);
    await changePassword(req.auth.userId, input);

    res.status(200).json({
      data: {
        message: "Password changed successfully."
      },
      request_id: req.requestId
    });
  } catch (error) {
    if (error instanceof AuthServiceError) throw error;
    throw validationError(req.requestId, error);
  }
}
