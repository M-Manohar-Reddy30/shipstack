import type { ErrorRequestHandler } from "express";

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown[];
}

export const errorHandler: ErrorRequestHandler = (
  error,
  req,
  res,
  _next
) => {
  const requestId = req.requestId;

  const apiError = error as ApiError;
  const statusCode = apiError.statusCode ?? 500;
  const code = apiError.code ?? "INTERNAL_ERROR";

  if (statusCode >= 500) {
    console.error({
      event: "request_error",
      requestId,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  res.status(statusCode).json({
    error: {
      code,
      message:
        statusCode >= 500
          ? "An unexpected error occurred."
          : apiError.message,
      details: apiError.details ?? [],
      request_id: requestId
    }
  });
};
