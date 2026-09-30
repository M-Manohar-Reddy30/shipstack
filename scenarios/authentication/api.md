# API Contract — Production-Grade Authentication

This document defines the external HTTP API contract for the authentication scenario.

The contract is designed to be:

- predictable for frontend and client developers
- explicit about validation and error behavior
- secure by default
- backward-compatible where practical
- observable through request identifiers
- suitable for implementation with TypeScript, Node.js, PostgreSQL, Redis, and a server-managed session model

---

## 1. Contract Goals

The authentication API must provide:

1. Account registration
2. Secure login
3. Session lookup
4. Logout and session revocation
5. Password reset request
6. Password reset confirmation
7. Authenticated password change
8. Consistent authorization behavior
9. Consistent validation errors
10. Consistent security errors
11. Request correlation
12. Rate-limit visibility
13. Safe retry behavior
14. No accidental leakage of credentials or authentication secrets

The API contract is an interface. Internal implementation details may evolve as long as externally observable behavior remains compatible.

---

## 2. Base URL and Versioning

### Development

```text
http://localhost:4000/api/v1
```

### Production

```text
https://api.example.com/api/v1
```

The hostname is environment-specific.

The `/api/v1` prefix represents the public API version.

### Versioning rules

- Additive response fields are normally backward-compatible.
- Existing fields must not silently change meaning.
- Existing fields should not change type without a version change or migration strategy.
- Removing or renaming a field requires a compatibility plan.
- Security fixes may change behavior when necessary to protect users.
- New authentication mechanisms should preferably be introduced as new capabilities rather than silently changing an existing contract.

---

# 3. HTTP Conventions

## 3.1 HTTP methods

| Method | Purpose |
|---|---|
| GET | Retrieve state |
| POST | Create a resource or perform an authentication action |
| PATCH | Partially update a resource |
| PUT | Replace a resource when explicitly supported |
| DELETE | Remove or revoke a resource |

Authentication actions use `POST` because they can create or revoke server-side state.

---

## 3.2 Content type

Requests containing JSON must send:

```http
Content-Type: application/json
```

Successful JSON responses use:

```http
Content-Type: application/json
```

The API should reject unsupported content types with:

```http
415 Unsupported Media Type
```

---

## 3.3 Character encoding

JSON is UTF-8.

Clients should send:

```http
Accept: application/json
```

The server should return JSON for all documented API endpoints.

---

# 4. Request Identification

Every API request receives or propagates a request identifier.

Client may send:

```http
X-Request-Id: 01JABC123XYZ
```

If absent, the server generates one.

The response includes:

```http
X-Request-Id: 01JABC123XYZ
```

The request ID:

- must not contain credentials
- must not contain session tokens
- should be unique enough for operational correlation
- is safe to expose to the client
- should appear in application logs and traces

Example:

```http
X-Request-Id: req_01JABC123XYZ
```

---

# 5. Authentication Model

The API uses server-recognized sessions.

After successful authentication:

1. The server creates a session.
2. The server generates a high-entropy session secret.
3. The server stores only a secure hash or equivalent verifier of that secret.
4. The raw session secret is sent to the browser in a secure cookie.
5. Subsequent requests present the cookie.
6. The server validates the session before granting authenticated access.

The database must not store the raw session cookie value.

---

# 6. Session Cookie Contract

Recommended production cookie:

```http
Set-Cookie: session=<opaque-secret>; Path=/; HttpOnly; Secure; SameSite=Lax
```

The exact `SameSite` policy depends on deployment requirements.

### Required properties

| Attribute | Requirement |
|---|---|
| HttpOnly | Required |
| Secure | Required in production |
| Path | `/` or appropriately scoped |
| SameSite | Explicitly configured |
| Domain | Avoid unless cross-subdomain behavior requires it |
| Max-Age/Expires | Must match session policy |

### Important

`HttpOnly` reduces JavaScript access to the session cookie.

`Secure` prevents transmission over ordinary HTTP.

`SameSite` reduces some cross-site request risks, but it must not be treated as a universal replacement for CSRF defenses.

If the application permits cross-site authenticated requests, explicit CSRF protection is required.

---

# 7. Standard Success Response

Responses should use a predictable envelope.

Example:

```json
{
  "data": {
    "user": {
      "id": "usr_01JABC",
      "email": "user@example.com",
      "display_name": "Example User"
    }
  },
  "request_id": "req_01JXYZ"
}
```

`data` contains endpoint-specific data.

`request_id` allows the client and support team to correlate the response with server-side logs.

---

# 8. Standard Error Response

All documented errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request could not be processed.",
    "details": [],
    "request_id": "req_01JXYZ"
  }
}
```

### Fields

| Field | Type | Required | Meaning |
|---|---|---:|---|
| `error.code` | string | Yes | Stable machine-readable code |
| `error.message` | string | Yes | Safe human-readable message |
| `error.details` | array | Yes | Structured optional details |
| `error.request_id` | string | Yes | Request correlation ID |

The error message must not expose:

- password hashes
- session tokens
- password-reset tokens
- database credentials
- internal stack traces
- sensitive infrastructure details
- whether a password belongs to a specific account when doing so enables enumeration

---

# 9. Error Detail Format

Validation errors may include:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "details": [
      {
        "field": "email",
        "code": "INVALID_EMAIL",
        "message": "Enter a valid email address."
      }
    ],
    "request_id": "req_01JXYZ"
  }
}
```

The `field` value identifies the request field.

The API should not echo sensitive field values.

---

# 10. Common HTTP Status Codes

| Status | Meaning |
|---:|---|
| 200 | Request succeeded |
| 201 | Resource created |
| 204 | Request succeeded with no body |
| 400 | Malformed or invalid request |
| 401 | Authentication required or authentication failed |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 409 | Request conflicts with current resource state |
| 415 | Unsupported content type |
| 422 | Semantically invalid input, if adopted |
| 429 | Rate limit exceeded |
| 500 | Unexpected server failure |
| 503 | Temporary service unavailability |

The implementation should use one consistent validation convention: either `400` or `422` for semantic validation failures. This scenario standardizes on `400` for malformed/invalid authentication requests to keep the public contract simple.

---

# 11. Authentication Endpoints

## Endpoint summary

| Method | Endpoint | Authentication |
|---|---|---|
| POST | `/auth/register` | Public |
| POST | `/auth/login` | Public |
| POST | `/auth/logout` | Session |
| GET | `/auth/me` | Session |
| POST | `/auth/password-reset/request` | Public |
| POST | `/auth/password-reset/confirm` | Reset token |
| POST | `/auth/password/change` | Session |

---

# 12. POST /auth/register

Creates a new user account.

## Request

```http
POST /api/v1/auth/register
Content-Type: application/json
Accept: application/json
```

Body:

```json
{
  "email": "user@example.com",
  "password": "correct horse battery staple",
  "display_name": "Example User"
}
```

## Request fields

| Field | Type | Required | Rules |
|---|---|---:|---|
| `email` | string | Yes | Valid email format; normalized |
| `password` | string | Yes | Must satisfy password policy |
| `display_name` | string | Yes | Length and character limits apply |

### Email normalization

The server should:

1. trim surrounding whitespace
2. normalize according to the application's documented email policy
3. compare normalized addresses consistently
4. enforce uniqueness at the database level

The implementation must avoid unsafe provider-specific transformations such as blindly modifying every email address with provider-specific alias rules.

---

# 13. Registration Password Rules

The API must enforce a documented password policy.

Recommended baseline:

- minimum 12 characters
- maximum accepted length sufficiently high for passphrases
- no requirement to contain arbitrary character classes solely for complexity
- reject known compromised passwords where a breach-password service is available
- never store plaintext passwords
- never log passwords

The final implementation may use a stronger policy.

The maximum password length must be enforced before expensive password hashing to reduce resource-exhaustion risk.

---

# 14. Successful Registration

Recommended response:

```http
HTTP/1.1 201 Created
Content-Type: application/json
```

```json
{
  "data": {
    "user": {
      "id": "usr_01JABC",
      "email": "user@example.com",
      "display_name": "Example User"
    }
  },
  "request_id": "req_01JXYZ"
}
```

Whether registration automatically creates a session is an implementation decision.

If email verification is required, registration should instead create an unverified account and return a response representing the verification state.

---

# 15. Duplicate Registration

The database must enforce a unique constraint on the normalized email.

Possible response:

```http
409 Conflict
```

```json
{
  "error": {
    "code": "ACCOUNT_ALREADY_EXISTS",
    "message": "An account with these details already exists.",
    "details": [],
    "request_id": "req_01JXYZ"
  }
}
```

If account-enumeration resistance is a higher priority for a specific product, the registration flow may use a generic response instead.

The externally visible behavior must be selected deliberately and documented with the product's threat model.

---

# 16. Registration Validation Error

Example:

```http
400 Bad Request
```

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "details": [
      {
        "field": "email",
        "code": "INVALID_EMAIL",
        "message": "Enter a valid email address."
      },
      {
        "field": "password",
        "code": "PASSWORD_TOO_SHORT",
        "message": "Password does not meet the minimum requirements."
      }
    ],
    "request_id": "req_01JXYZ"
  }
}
```

---

# 17. POST /auth/login

Authenticates a user and creates a server-side session.

## Request

```http
POST /api/v1/auth/login
Content-Type: application/json
Accept: application/json
```

Body:

```json
{
  "email": "user@example.com",
  "password": "correct horse battery staple"
}
```

---

# 18. Login Processing

The server should:

1. Validate request shape.
2. Normalize the email according to the account policy.
3. Locate the account.
4. Perform password verification.
5. Apply account security checks.
6. Apply rate limits.
7. Create a session only after successful authentication.
8. Set the session cookie.
9. Return the authenticated user representation.

Authentication failure responses should avoid revealing whether:

- the email exists
- the password was almost correct
- the account has a particular internal state

---

# 19. Successful Login

```http
HTTP/1.1 200 OK
Set-Cookie: session=<opaque-secret>; Path=/; HttpOnly; Secure; SameSite=Lax
```

Body:

```json
{
  "data": {
    "user": {
      "id": "usr_01JABC",
      "email": "user@example.com",
      "display_name": "Example User"
    }
  },
  "request_id": "req_01JXYZ"
}
```

---

# 20. Failed Login

Recommended response:

```http
401 Unauthorized
```

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect.",
    "details": [],
    "request_id": "req_01JXYZ"
  }
}
```

The message should remain generic.

The API must not return:

```text
User does not exist.
```

for one case and:

```text
Wrong password.
```

for another case.

---

# 21. POST /auth/logout

Revokes the current authenticated session.

## Request

```http
POST /api/v1/auth/logout
Cookie: session=<opaque-secret>
```

Successful response:

```http
204 No Content
Set-Cookie: session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0
```

The server should revoke the session before clearing the browser cookie.

Logout should be safe to retry.

If the session is already invalid, the endpoint may still return `204`.

---

# 22. GET /auth/me

Returns the currently authenticated user.

## Request

```http
GET /api/v1/auth/me
Accept: application/json
Cookie: session=<opaque-secret>
```

## Success

```http
200 OK
```

```json
{
  "data": {
    "user": {
      "id": "usr_01JABC",
      "email": "user@example.com",
      "display_name": "Example User",
      "roles": [
        "user"
      ]
    }
  },
  "request_id": "req_01JXYZ"
}
```

Only fields approved for client exposure may be returned.

Never expose:

- password hashes
- reset tokens
- session hashes
- internal security metadata
- private audit information

---

# 23. Unauthenticated /auth/me

```http
401 Unauthorized
```

```json
{
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "Authentication is required.",
    "details": [],
    "request_id": "req_01JXYZ"
  }
}
```

---

# 24. POST /auth/password-reset/request

Starts a password-reset flow.

## Request

```http
POST /api/v1/auth/password-reset/request
Content-Type: application/json
```

Body:

```json
{
  "email": "user@example.com"
}
```

---

# 25. Password Reset Request Security

This endpoint must not reveal whether an account exists.

For both an existing and non-existing address, the API should return the same externally observable success response where practical.

Example:

```http
202 Accepted
```

```json
{
  "data": {
    "message": "If an account matches this email address, password reset instructions will be sent."
  },
  "request_id": "req_01JXYZ"
}
```

The server may internally decide whether to send an email.

---

# 26. Password Reset Token

The reset token should be:

- cryptographically random
- high entropy
- short-lived
- single-use
- invalidated after successful password reset
- stored only as a hash or equivalent verifier
- excluded from logs
- excluded from analytics
- excluded from normal database exports where practical

The raw token is delivered through the password-reset channel.

---

# 27. POST /auth/password-reset/confirm

Completes a password reset.

## Request

```http
POST /api/v1/auth/password-reset/confirm
Content-Type: application/json
```

Body:

```json
{
  "token": "one-time-reset-secret",
  "new_password": "new secure passphrase"
}
```

The token should be submitted in the request body rather than placed in a URL when practical.

URLs may be logged by infrastructure and observability systems, so reset secrets should not be placed in query parameters.

---

# 28. Successful Password Reset

```http
200 OK
```

```json
{
  "data": {
    "message": "Password has been reset successfully."
  },
  "request_id": "req_01JXYZ"
}
```

All sessions associated with the account should normally be invalidated after a successful password reset unless the product explicitly documents another security policy.

---

# 29. Invalid Password Reset Token

```http
400 Bad Request
```

```json
{
  "error": {
    "code": "INVALID_OR_EXPIRED_RESET_TOKEN",
    "message": "The password reset link is invalid or has expired.",
    "details": [],
    "request_id": "req_01JXYZ"
  }
}
```

Do not reveal whether the token:

- never existed
- was already consumed
- expired
- belonged to another account

when that distinction provides unnecessary information.

---

# 30. POST /auth/password/change

Changes the password for an authenticated user.

## Request

```http
POST /api/v1/auth/password/change
Content-Type: application/json
Cookie: session=<opaque-secret>
```

Body:

```json
{
  "current_password": "old secure passphrase",
  "new_password": "new secure passphrase"
}
```

The current password should normally be required to prevent an unattended authenticated session from being used to silently change credentials.

---

# 31. Successful Password Change

```http
200 OK
```

```json
{
  "data": {
    "message": "Password changed successfully."
  },
  "request_id": "req_01JXYZ"
}
```

The session policy after password change must be explicit.

A secure default is to:

1. change the password
2. revoke other active sessions
3. preserve the current session only if the product requires continuity
4. record an audit event

For higher-security applications, revoking all sessions and requiring a fresh login may be preferable.

---

# 32. Password Change Errors

Incorrect current password:

```http
401 Unauthorized
```

```json
{
  "error": {
    "code": "INVALID_CURRENT_PASSWORD",
    "message": "The current password is incorrect.",
    "details": [],
    "request_id": "req_01JXYZ"
  }
}
```

Invalid new password:

```http
400 Bad Request
```

```json
{
  "error": {
    "code": "INVALID_PASSWORD",
    "message": "The new password does not meet the password requirements.",
    "details": [],
    "request_id": "req_01JXYZ"
  }
}
```

---

# 33. Authorization Contract

Authentication answers:

```text
Who are you?
```

Authorization answers:

```text
Are you allowed to perform this action?
```

The API must perform authorization checks on the server.

The frontend must never be treated as the security boundary.

Example:

```http
GET /api/v1/admin/users
Cookie: session=<opaque-secret>
```

A normal authenticated user should receive:

```http
403 Forbidden
```

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action.",
    "details": [],
    "request_id": "req_01JXYZ"
  }
}
```

---

# 34. Role Representation

A user may have roles such as:

```json
{
  "roles": [
    "user",
    "admin"
  ]
}
```

Role names are application-defined identifiers.

The API must not trust a client-provided role.

This is unsafe:

```json
{
  "role": "admin"
}
```

Authorization state must come from trusted server-side data.

---

# 35. Authentication Header

The scenario does not use a bearer access token for browser authentication.

Browser authentication uses the server-managed session cookie.

If a future API consumer requires token-based access, it should be introduced as a separately documented authentication mechanism rather than silently replacing the browser session contract.

---

# 36. CSRF Contract

Cookie-based authentication creates a CSRF consideration because browsers automatically attach cookies.

For state-changing endpoints such as:

```text
POST /auth/logout
POST /auth/password/change
POST /auth/password-reset/confirm
POST /auth/register
```

the deployment must use an appropriate CSRF strategy when cross-site requests could be possible.

Possible strategies include:

- SameSite cookie restrictions
- synchronizer tokens
- signed double-submit tokens
- origin checking
- strict trusted-origin validation

The exact mechanism belongs in the implementation and security documentation.

---

# 37. Origin Validation

For browser-facing state-changing requests, the server may validate:

```http
Origin
```

and, where appropriate:

```http
Referer
```

against an explicit trusted-origin allowlist.

Origin validation must not rely on a user-controlled arbitrary allowlist.

---

# 38. Rate Limiting

Authentication endpoints must be rate-limited.

High-risk endpoints include:

```text
POST /auth/login
POST /auth/register
POST /auth/password-reset/request
POST /auth/password-reset/confirm
POST /auth/password/change
```

Rate limiting should consider:

- IP address
- account identifier where appropriate
- device/session signals where available
- distributed deployments
- abuse patterns

The exact thresholds belong to the security configuration rather than the public API contract.

---

# 39. Rate Limit Response

When a request is rejected because of rate limiting:

```http
429 Too Many Requests
Retry-After: 60
```

Body:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later.",
    "details": [],
    "request_id": "req_01JXYZ"
  }
}
```

Do not expose internal rate-limit implementation details.

---

# 40. Retry Behavior

Clients should distinguish between:

### Safe to retry

Requests that failed because of transient infrastructure errors may be retried using bounded exponential backoff.

### Not automatically retryable

Authentication failures should not be blindly retried.

Password-reset requests may be repeated, but clients should avoid generating excessive requests.

Logout is designed to be idempotent from the client's perspective.

---

# 41. Idempotency

Authentication APIs should not claim full idempotency unless it is actually implemented.

For high-value mutation endpoints that may be retried after network failure, an optional:

```http
Idempotency-Key: <client-generated-key>
```

mechanism can be introduced.

If implemented, the server must define:

- key lifetime
- scope
- request-body binding
- replay behavior
- storage
- conflict behavior

The initial authentication implementation does not require idempotency keys for every endpoint.

---

# 42. Request Size Limits

Authentication endpoints should impose strict request-body limits.

For example:

```text
JSON body <= configured small maximum
```

The exact limit should be chosen based on the accepted password maximum, field sizes, and framework overhead.

Oversized requests should be rejected before expensive processing.

---

# 43. Input Validation

Validation occurs at the API boundary.

The server validates:

- JSON syntax
- required fields
- field types
- string lengths
- email structure
- password length
- display-name limits
- token presence
- unexpected fields where strict validation is desired

Validation must happen before database writes.

---

# 44. Output Serialization

Response serializers must explicitly select fields.

Avoid returning database objects directly.

Unsafe pattern:

```text
return user;
```

Preferred pattern:

```text
return {
  id,
  email,
  display_name,
  roles
};
```

This prevents accidental exposure of future sensitive fields.

---

# 45. Sensitive Data Handling

The API must never return:

```text
password_hash
session_hash
reset_token_hash
raw_session_token
raw_reset_token
internal_security_metadata
```

Sensitive values must not appear in:

- application logs
- request traces
- metrics labels
- error messages
- analytics payloads
- support dashboards

---

# 46. Authentication Failure Observability

The system should record security-relevant events internally, such as:

- login success
- login failure
- logout
- password reset request
- password reset completion
- password change
- session revocation
- authorization denial
- rate-limit events

Audit records should contain enough context for investigation without storing secrets.

---

# 47. Account Enumeration Protection

Enumeration risks occur when an attacker can determine whether an account exists.

The API should use generic responses for particularly sensitive flows, especially:

```text
POST /auth/password-reset/request
```

Login failures should also use a generic credential failure message.

Registration behavior must be selected deliberately because duplicate-account feedback and enumeration resistance can conflict.

---

# 48. Database Failure Behavior

If PostgreSQL is unavailable during authentication:

```http
503 Service Unavailable
```

Example:

```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "The authentication service is temporarily unavailable.",
    "details": [],
    "request_id": "req_01JXYZ"
  }
}
```

The response must not expose database connection strings or stack traces.

---

# 49. Redis Failure Behavior

If Redis is used for rate limiting or temporary authentication state, the application must define whether Redis is:

- security-critical fail-closed infrastructure
- performance infrastructure that may temporarily degrade

For security-sensitive controls such as login abuse prevention, the implementation should avoid silently disabling protections because a distributed dependency failed.

The exact fallback policy belongs in `failure-modes.md`.

---

# 50. Email Provider Failure

If password-reset email delivery fails, the public endpoint should not reveal internal provider details.

The system may return:

```http
202 Accepted
```

for the password-reset request while recording the delivery failure internally.

A retryable email-delivery failure should be handled by the asynchronous delivery system where available.

---

# 51. Cache-Control

Authenticated identity responses should not be publicly cached.

For sensitive responses, use appropriate headers such as:

```http
Cache-Control: no-store
```

especially for:

```text
/auth/me
```

and other authentication-sensitive responses.

---

# 52. CORS

If the frontend and API are on different origins, CORS must use an explicit allowlist.

Avoid:

```http
Access-Control-Allow-Origin: *
```

for credentialed browser authentication.

For cookie-based authentication, the server must configure:

```http
Access-Control-Allow-Credentials: true
```

only when required, with explicit trusted origins.

---

# 53. Preflight Requests

When CORS is enabled, the server should correctly handle:

```http
OPTIONS
```

requests.

The preflight policy must not allow arbitrary origins or methods.

---

# 54. API Error Taxonomy

Recommended stable error codes:

```text
VALIDATION_ERROR
INVALID_EMAIL
INVALID_PASSWORD
PASSWORD_TOO_SHORT
ACCOUNT_ALREADY_EXISTS
INVALID_CREDENTIALS
AUTHENTICATION_REQUIRED
FORBIDDEN
SESSION_INVALID
SESSION_EXPIRED
RATE_LIMITED
INVALID_OR_EXPIRED_RESET_TOKEN
INVALID_CURRENT_PASSWORD
SERVICE_UNAVAILABLE
INTERNAL_ERROR
```

Error codes are intended for machine handling.

Clients should not depend on exact human-readable messages.

---

# 55. Internal Error Handling

Unexpected exceptions must become:

```http
500 Internal Server Error
```

Example:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred.",
    "details": [],
    "request_id": "req_01JXYZ"
  }
}
```

The client receives the request ID.

The server logs the actual exception securely.

Stack traces must not be returned to clients in production.

---

# 56. Authentication State Machine

Conceptually:

```text
Anonymous
   |
   | valid login
   v
Authenticated
   |
   | logout / revoke / expiry
   v
Anonymous
```

Password reset:

```text
Reset Requested
      |
      | valid one-time token
      v
Password Changed
      |
      | sessions revoked
      v
Authenticated after fresh login
```

The implementation must prevent invalid state transitions.

---

# 57. Session Expiration

The implementation must define:

- idle timeout
- absolute lifetime
- renewal policy
- revocation behavior
- concurrent session behavior

The API itself does not expose session secrets.

An expired session behaves like an unauthenticated request:

```http
401 Unauthorized
```

---

# 58. Session Rotation

A new session should be created after successful login.

The system must avoid session fixation.

When authentication state changes significantly, such as privilege elevation, the server should consider rotating the session identifier.

---

# 59. Privilege Changes

If a user's roles change, authorization must use current trusted server-side state according to the chosen consistency model.

For high-risk systems, role changes should invalidate or refresh relevant sessions.

The API must never rely exclusively on a stale role stored in a client-controlled token.

---

# 60. Client Integration Example

A browser client can call:

```text
POST /api/v1/auth/login
```

with:

```json
{
  "email": "user@example.com",
  "password": "correct horse battery staple"
}
```

The server responds with a secure cookie.

The client then calls:

```text
GET /api/v1/auth/me
```

The browser automatically includes the session cookie.

The frontend uses the returned user object to render authenticated UI.

The backend remains the authority for access control.

---

# 61. Example Fetch Request

```ts
const response = await fetch("/api/v1/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  credentials: "include",
  body: JSON.stringify({
    email,
    password,
  }),
});
```

For same-origin browser requests, `credentials: "include"` makes the intended cookie behavior explicit.

---

# 62. Example Error Handling

```ts
const body = await response.json();

if (!response.ok) {
  throw new Error(body.error?.code ?? "REQUEST_FAILED");
}
```

A production frontend should map stable error codes to user-facing messages instead of depending on server message text.

---

# 63. API Contract Testing

The implementation should test:

- successful registration
- invalid registration
- duplicate registration
- successful login
- invalid login
- logout
- authenticated `/auth/me`
- unauthenticated `/auth/me`
- password reset request
- password reset confirmation
- expired reset token
- reused reset token
- password change
- invalid current password
- unauthorized role access
- malformed JSON
- unsupported content type
- rate limiting
- session expiry
- session revocation
- database failure
- Redis failure
- email delivery failure

---

# 64. Security Contract Tests

Tests should verify that:

1. Passwords never appear in API responses.
2. Session tokens never appear in API responses.
3. Reset tokens never appear in logs.
4. Password hashes never appear in API responses.
5. Login errors do not reveal account existence.
6. Password-reset requests do not reveal account existence.
7. Authorization is enforced server-side.
8. Cookies have required security attributes.
9. Expired sessions receive `401`.
10. Revoked sessions receive `401`.
11. Rate limits cannot be bypassed by trivial request variation.
12. Cross-origin behavior matches the configured policy.

---

# 65. OpenAPI Direction

The API should eventually have a machine-readable OpenAPI 3.1 specification.

The generated OpenAPI document should define:

- paths
- operations
- parameters
- request bodies
- response bodies
- schemas
- error schemas
- security schemes
- cookie authentication
- status codes
- examples

This Markdown document remains the human-readable contract and source of design intent.

The machine-readable OpenAPI specification should be generated or maintained alongside implementation so that documentation and behavior do not drift.

---

# 66. Suggested OpenAPI Security Scheme

Conceptually:

```yaml
components:
  securitySchemes:
    sessionCookie:
      type: apiKey
      in: cookie
      name: session
```

Protected operations reference the scheme.

Public authentication operations do not.

---

# 67. Compatibility Rules

A compatible API change can include:

- adding an optional request field
- adding a response field
- adding a new endpoint
- adding a new documented error code where clients already handle unknown errors safely

Potentially breaking changes include:

- removing fields
- renaming fields
- changing field types
- changing authentication semantics
- changing required fields
- changing status codes in a way clients depend upon
- changing security behavior without migration

---

# 68. Deprecation

Deprecated endpoints should provide a documented migration path.

Where appropriate, responses may include:

```http
Deprecation: true
```

and documentation should state:

- what is deprecated
- why
- replacement endpoint
- migration deadline
- compatibility period

Security-sensitive deprecated behavior may need earlier removal.

---

# 69. API Documentation Requirements

Every endpoint implementation should document:

- method
- path
- authentication requirement
- request headers
- request body
- validation
- success status
- success schema
- failure statuses
- error codes
- security implications
- rate-limit behavior
- retry behavior

No endpoint should be considered complete merely because its route exists.

---

# 70. Contract Review Checklist

Before implementation is considered complete:

### Request

- [ ] HTTP method is correct
- [ ] Path is versioned
- [ ] Content type is documented
- [ ] Required fields are documented
- [ ] Validation is documented
- [ ] Maximum sizes are defined

### Response

- [ ] Success status is documented
- [ ] Response schema is explicit
- [ ] Sensitive fields are excluded
- [ ] Request ID is included

### Errors

- [ ] Error envelope is consistent
- [ ] Stable error code exists
- [ ] HTTP status is correct
- [ ] Sensitive implementation details are hidden

### Security

- [ ] Authentication requirement is explicit
- [ ] Authorization behavior is explicit
- [ ] Session behavior is explicit
- [ ] CSRF implications are addressed
- [ ] Rate limiting is addressed
- [ ] Sensitive values are excluded from logs

### Reliability

- [ ] Retry behavior is defined
- [ ] Idempotency behavior is defined where needed
- [ ] Dependency failures have a documented behavior

### Compatibility

- [ ] Versioning is clear
- [ ] Backward compatibility is considered
- [ ] Deprecation path exists if needed

---

# 71. Endpoint Contract Matrix

| Endpoint | Auth | Success | Main failures |
|---|---|---|---|
| `POST /auth/register` | Public | 201 | 400, 409, 429 |
| `POST /auth/login` | Public | 200 | 400, 401, 429, 503 |
| `POST /auth/logout` | Session | 204 | 429, 503 |
| `GET /auth/me` | Session | 200 | 401, 503 |
| `POST /auth/password-reset/request` | Public | 202 | 400, 429, 503 |
| `POST /auth/password-reset/confirm` | Reset token | 200 | 400, 429, 503 |
| `POST /auth/password/change` | Session | 200 | 400, 401, 429, 503 |

---

# 72. Final API Principles

The authentication API follows these principles:

1. The server is the security authority.
2. Authentication state is represented by a server-managed session.
3. Raw session secrets are not persisted.
4. Passwords are never stored or returned in plaintext.
5. Reset tokens are short-lived and single-use.
6. Error responses are predictable.
7. Security failures do not leak unnecessary account information.
8. Rate limits protect high-risk operations.
9. Request IDs make failures traceable.
10. API behavior is documented before implementation.
11. Clients depend on stable error codes rather than message text.
12. Frontend state is never treated as proof of authorization.
13. Sensitive authentication operations are designed around failure and abuse, not only the happy path.
14. The contract must evolve without silently weakening security.

---

# 73. Next Engineering Step

After this API contract is reviewed, the implementation should proceed from the documented contract rather than inventing routes during coding.

Next:

```text
API Contract
     ↓
Implementation
     ↓
Security Verification
     ↓
Testing
     ↓
Observability
     ↓
Deployment
     ↓
Scaling
     ↓
Failure Modes
     ↓
Interview Readiness
```

The API is considered complete when its behavior can be implemented, tested, observed, and defended from the contract alone.
