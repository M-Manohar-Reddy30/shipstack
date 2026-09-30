import { Router } from "express";

import {
  loginController,
  logoutController,
  meController,
  passwordChangeController,
  passwordResetConfirmController,
  passwordResetRequestController,
  registerController
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const authRouter = Router();

authRouter.post("/register", registerController);
authRouter.post("/login", loginController);
authRouter.post("/logout", requireAuth, logoutController);
authRouter.get("/me", requireAuth, meController);
authRouter.post("/password-reset/request", passwordResetRequestController);
authRouter.post("/password-reset/confirm", passwordResetConfirmController);
authRouter.post("/password/change", requireAuth, passwordChangeController);
