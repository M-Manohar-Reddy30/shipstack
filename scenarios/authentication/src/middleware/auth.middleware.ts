import type { NextFunction, Request, Response } from "express";

import { env } from "../config/env.js";
import { findActiveSession } from "../repositories/session.repository.js";
import { findUserById } from "../repositories/user.repository.js";
import { hashSessionSecret } from "../utils/session.js";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: {
        userId: string;
        sessionId: string;
      };
    }
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const secret = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;

  if (!secret) {
    res.status(401).json({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication is required.",
        details: [],
        request_id: req.requestId
      }
    });
    return;
  }

  const session = await findActiveSession(hashSessionSecret(secret));

  if (!session) {
    res.status(401).json({
      error: {
        code: "SESSION_INVALID",
        message: "Authentication is required.",
        details: [],
        request_id: req.requestId
      }
    });
    return;
  }

  const user = await findUserById(session.userId);

  if (!user) {
    res.status(401).json({
      error: {
        code: "SESSION_INVALID",
        message: "Authentication is required.",
        details: [],
        request_id: req.requestId
      }
    });
    return;
  }

  req.auth = {
    userId: user.id,
    sessionId: session.id
  };

  next();
}
