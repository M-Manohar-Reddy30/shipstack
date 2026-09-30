import { randomUUID } from "node:crypto";

import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { authRouter } from "./routes/auth.routes.js";

const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(express.json({ limit: "32kb" }));
app.use(cookieParser());

app.use((req, _res, next) => {
  req.requestId = req.header("X-Request-Id")?.trim() || `req_${randomUUID()}`;
  next();
});

app.use((req, res, next) => {
  const origin = req.header("Origin");

  if (origin && env.trustedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, X-Request-Id"
    );
    res.status(204).send();
    return;
  }

  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    data: {
      status: "ok"
    }
  });
});

app.use("/api/v1/auth", authRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: "Resource not found.",
      details: [],
      request_id: res.req.requestId
    }
  });
});

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Authentication API listening on port ${env.PORT}`);
});
