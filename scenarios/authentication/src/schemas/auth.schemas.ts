import { z } from "zod";

const emailSchema = z.string().trim().email().max(320);

const passwordSchema = z.string().min(12).max(256);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  display_name: z.string().trim().min(1).max(100)
}).strict();

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256)
}).strict();

export const passwordResetRequestSchema = z.object({
  email: emailSchema
}).strict();

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(32).max(512),
  new_password: passwordSchema
}).strict();

export const passwordChangeSchema = z.object({
  current_password: z.string().min(1).max(256),
  new_password: passwordSchema
}).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
