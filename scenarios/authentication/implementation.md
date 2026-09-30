# Authentication — Reference Implementation

## 1. Purpose

This directory contains a TypeScript/Node.js reference implementation of the authentication scenario documented in this directory.

The implementation demonstrates:

- User registration
- Password hashing with Argon2id
- User login
- Server-managed sessions
- Secure session cookies
- Authenticated user lookup
- Logout and session revocation
- Request validation with Zod
- Authentication middleware
- Centralized error handling
- Request ID generation
- Security headers with Helmet
- CORS allowlisting
- Automated integration tests

The implementation is intentionally small and understandable so the engineering decisions can be studied, tested, and extended.

---

## 2. Scope

This is a **reference implementation**, not a complete production deployment.

The production architecture documented in this scenario is designed to evolve toward PostgreSQL, Redis, persistent password-reset infrastructure, distributed rate limiting, email delivery, audit persistence, observability, and production deployment infrastructure.

The current executable implementation uses in-memory repositories so it can run locally without external infrastructure.

---

## 3. Technology Stack

### Runtime

- Node.js
- TypeScript
- Express 5

### Security

- Argon2id password hashing
- HTTP-only session cookies
- Helmet
- Zod validation
- Cryptographically secure random session tokens
- SHA-256 hashing for stored session identifiers

### Testing

- Node.js test runner
- `tsx`
- TypeScript compilation

---

## 4. Source Structure

```text
src/
├── config/
│   └── env.ts
├── controllers/
│   └── auth.controller.ts
├── middleware/
│   ├── auth.middleware.ts
│   └── error.middleware.ts
├── repositories/
│   ├── session.repository.ts
│   └── user.repository.ts
├── routes/
│   └── auth.routes.ts
├── schemas/
│   └── auth.schemas.ts
├── services/
│   └── auth.service.ts
├── utils/
│   ├── password.ts
│   └── session.ts
└── server.ts

---

## 11. Authorization

Authentication answers:

> Who is this user?

Authorization answers:

> Is this user allowed to perform this action?

The scenario data model supports role-based authorization through:

- `roles`
- `user_roles`

The current executable implementation focuses primarily on authentication. Production authorization policies should be enforced explicitly at protected resource boundaries.

---

## 12. Password Reset

The API contract includes password-reset endpoints because password recovery is part of a complete authentication system.

The current reference implementation does **not** provide a complete persistent password-reset workflow.

A production implementation should use:

- Cryptographically random reset tokens
- Hashed token storage
- Short token expiration
- One-time token consumption
- Token invalidation after successful use
- Rate limiting
- Generic responses to prevent account enumeration
- Secure asynchronous email delivery
- Audit events

The current implementation should therefore not be presented as having a complete production password-reset system.

---

## 13. Rate Limiting

Rate limiting is part of the production security architecture.

The current executable reference implementation does not include a distributed rate limiter.

Production deployments should apply rate limiting to sensitive operations such as:

- Registration
- Login
- Password reset requests
- Password reset confirmation
- Password changes

For horizontally scaled deployments, shared infrastructure such as Redis can provide distributed rate-limit state.

---

## 14. Persistence

The current reference implementation uses in-memory repositories.

This keeps local execution simple and makes the example self-contained.

Production persistence should use PostgreSQL for durable authentication data.

The documented production model includes:

- Users
- Sessions
- Password reset tokens
- Roles
- User-role relationships
- Audit events

The repository boundary allows the in-memory implementation to be replaced by database-backed repositories.

---

## 15. Error Handling

The application uses centralized error handling.

Errors are converted into consistent API responses.

Authentication failures should avoid revealing whether a particular account exists.

Unexpected errors should be logged with an appropriate request ID while avoiding:

- Passwords
- Session tokens
- Password-reset tokens
- Other secrets

Internal implementation details should not be returned to clients.

---

## 16. Request IDs

Requests receive a request ID.

If a valid `X-Request-Id` header is provided, the application can use it for correlation. Otherwise, it generates a request ID.

The response includes the request ID.

This allows application logs, traces, and client-reported errors to be correlated.

---

## 17. Security Headers

Helmet is enabled to provide common HTTP security headers.

Security headers are only one layer of the security model and should be combined with:

- Secure cookies
- TLS
- CSRF protection where applicable
- Input validation
- Output encoding
- Dependency management
- Access control
- Rate limiting
- Monitoring

---

## 18. CORS

The application supports an explicit trusted-origin configuration.

Production deployments should use a strict allowlist rather than permitting arbitrary origins.

CORS should not be treated as an authentication mechanism.

---

## 19. Environment Configuration

Configuration is loaded through environment variables.

The repository includes:

```text
.env.example

---

## 20. Testing

The current integration test suite verifies the main authentication lifecycle.

Covered scenarios include:

- Health endpoint
- Successful registration
- Duplicate registration
- Invalid registration input
- Invalid login credentials
- Successful login
- Session cookie creation
- Authenticated `/me`
- Unauthenticated `/me`
- Logout
- Session revocation
- Password-reset request behavior
- Unknown routes

Run the complete test suite with:

```bash
npm test
```

---

## 21. Local Development

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Run type checking:

```bash
npm run typecheck
```

Build the application:

```bash
npm run build
```

Run tests:

```bash
npm test
```

---

## 22. Production Evolution

The current reference implementation uses TypeScript, Express, Argon2id, server-managed sessions, secure cookies, in-memory repositories, and automated tests.

A production evolution should introduce PostgreSQL for durable persistence, Redis for distributed state where appropriate, persistent password-reset tokens, distributed rate limiting, email delivery, audit persistence, secret management, TLS, security scanning, load testing, abuse testing, operational alerts, and backup/recovery procedures.

---

## 23. Known Limitations

The executable reference implementation intentionally has these limitations:

- In-memory user storage
- In-memory session storage
- No PostgreSQL integration
- No Redis integration
- No distributed rate limiting
- No persistent password-reset tokens
- No real email delivery
- No production audit-event persistence
- No production secret-management integration
- No complete deployment infrastructure

These limitations are deliberate and should remain visible when presenting the project.

---

## 24. Documentation Relationship

The scenario documentation describes the complete engineering design, while the executable implementation demonstrates the core authentication flow locally. The implementation is intentionally smaller than the complete production design.

The intended progression is:

```text
requirements -> architecture -> data-model -> api -> implementation
-> security -> testing -> observability -> deployment -> scaling
-> failure-modes -> interview
```

---

## 25. Verification

Before committing changes, run:

```bash
npm run typecheck
npm run build
npm test
```

All three commands should complete successfully.

---

## 26. Engineering Principle

The goal is not to maximize code volume. The goal is to demonstrate how a small authentication service can be structured so that it can evolve toward production without hiding important security, reliability, scalability, and operational concerns.
