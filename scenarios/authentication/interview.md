# Authentication Interview Guide

## 1. Purpose

This document is an interview-preparation guide for the authentication scenario in this repository.

It is intentionally tied to the architecture, API contract, security model, observability design, testing strategy, deployment model, scaling strategy, failure modes, and TypeScript reference implementation in this scenario.

The goal is not to memorize isolated definitions.

The goal is to be able to explain:

- what was designed
- why it was designed that way
- what trade-offs were considered
- how the system behaves under failure
- how security is preserved
- how the system scales
- how the implementation would evolve toward production

A strong system-design interview answer should normally follow this structure:

```text
Requirement
    |
Architecture
    |
Data model
    |
Request flow
    |
Security
    |
Failure handling
    |
Scaling
    |
Observability
    |
Trade-offs
```

---

# 2. How to Use This Guide

For each question:

1. Give the short answer first.
2. Explain the design.
3. Mention the trade-off.
4. Give a concrete example.
5. Be ready for the follow-up question.

Do not start with every implementation detail.

Start with the core architectural decision.

---

# 3. Project Summary

## Question

Explain this authentication system in one minute.

## Short answer

> This is a production-oriented authentication reference architecture using server-managed sessions. The browser receives an opaque session cookie, while authentication state is stored server-side. PostgreSQL is the durable source of truth for users and security-related data, while Redis can be used for sessions, rate limits, and other ephemeral state. The design includes password hashing with Argon2id, validation with Zod, secure cookies, rate limiting, audit events, observability, testing, deployment, scaling, and failure-handling strategies.

## Follow-up

Why did you choose server-managed sessions?

## Answer

> It gives the server direct control over session revocation and lifecycle. It also avoids putting large or sensitive authentication state into a browser-visible token. The trade-off is that the server needs shared session storage when the API scales horizontally.

---

# 4. Explain the Architecture

## Question

Walk me through the architecture.

## Answer

```text
Browser
   |
   v
Next.js / Web Client
   |
   v
Load Balancer
   |
   +--------+--------+
   |        |        |
 API-1    API-2    API-3
   |        |        |
   +--------+--------+
            |
       Auth Service
       /          \
 PostgreSQL       Redis
       |
    Audit/Data

API
 |
Queue
 |
Workers
 |
Email Provider

All components
 |
Observability
```

The browser sends the session cookie with requests.

The API validates the session against shared server-side state.

PostgreSQL stores durable account information.

Redis can handle high-volume ephemeral state.

Background workers handle asynchronous tasks such as email delivery.

---

# 5. Why Separate Authentication From Authorization?

## Short answer

Authentication answers:

> Who are you?

Authorization answers:

> What are you allowed to do?

Example:

```text
Authentication:
user 123 successfully logged in

Authorization:
user 123 may access admin endpoint
```

They are related but different security decisions.

---

# 6. Authentication Flow

## Question

Explain the login flow.

## Answer

```text
Browser
  |
POST /auth/login
  |
Validate input
  |
Find user
  |
Verify Argon2id password
  |
Create session
  |
Store session
  |
Set HttpOnly cookie
  |
Return success
```

The raw password is never stored.

The browser receives an opaque session identifier rather than the password or a durable authorization object.

---

# 7. Registration Flow

## Question

How does registration work?

## Answer

```text
Client
  |
Validate input
  |
Check account uniqueness
  |
Hash password
  |
Create user
  |
Create session if required
  |
Set cookie
  |
Optional email verification
```

The database should enforce uniqueness as an additional correctness layer.

Application-level uniqueness checks alone are not enough because concurrent requests can race.

---

# 8. Why Hash Passwords?

## Question

Why not encrypt passwords?

## Answer

Passwords should normally be hashed rather than reversibly encrypted.

The server does not need to recover the original password.

A password hash allows verification:

```text
password
   |
Argon2id
   |
hash
```

During login:

```text
submitted password
   |
Argon2id verification
   |
compare against stored hash
```

If the database is exposed, a strong password-hashing scheme makes offline cracking substantially more expensive than storing plaintext passwords.

---

# 9. Why Argon2id?

## Short answer

> Argon2id is designed to make password cracking expensive using CPU and memory resources. It is a modern password-hashing choice that provides strong resistance against common offline password attacks when configured appropriately.

The exact parameters should be benchmarked for the production environment.

---

# 10. Why Not SHA-256 for Passwords?

SHA-256 is intentionally fast.

Fast hashing is useful for:

- checksums
- content hashes
- some token hashing use cases

But it is undesirable for password storage because attackers can test huge numbers of guesses quickly.

Password hashing should use a password-specific slow and memory-hard algorithm.

---

# 11. Why Hash Session Tokens?

## Question

Why not store raw session tokens?

## Answer

If the session store is exposed, raw session tokens could potentially be used immediately.

Instead:

```text
raw session token
       |
     hash
       |
stored hash
```

The browser still holds the raw opaque token.

The server stores only the derived representation where appropriate.

---

# 12. Why Server-Managed Sessions?

## Question

What does server-managed session authentication mean?

## Answer

The browser holds an opaque identifier.

The server stores the actual session state.

```text
Cookie:
session=<opaque-token>

Server:
token hash -> user ID -> expiration -> metadata
```

This provides direct server-side control over session revocation and expiration.

---

# 13. Session Lifecycle

A session should have:

- identifier
- associated user
- creation time
- expiration
- revocation state where needed
- optional metadata
- timestamps

Typical lifecycle:

```text
Created
   |
Active
   |
Expired
   |
Deleted/Archived
```

Logout should revoke or delete the session according to the chosen implementation.

---

# 14. Why Use HttpOnly Cookies?

## Answer

`HttpOnly` prevents normal JavaScript from reading the cookie.

This reduces the ability of an XSS payload to directly extract the session cookie.

It does not make XSS harmless.

An attacker may still be able to perform actions through the victim's browser if the application is vulnerable.

Therefore XSS defenses remain necessary.

---

# 15. Why Secure Cookies?

`Secure` instructs the browser to send the cookie only over HTTPS.

Production authentication cookies should use secure transport.

Without HTTPS, an attacker on the network may be able to intercept authentication traffic.

---

# 16. Why SameSite?

`SameSite` controls when cookies are sent in cross-site contexts.

For example:

```text
SameSite=Lax
```

can reduce some cross-site request risks.

The exact setting should match the application's deployment and CSRF strategy.

Cookie configuration alone should not be treated as a complete CSRF defense.

---

# 17. CSRF

## Question

What is CSRF?

Cross-Site Request Forgery occurs when a browser automatically includes authentication credentials with a request initiated from another site.

Example:

```text
Victim logged in
     |
Malicious website
     |
Cross-site request
     |
Authenticated application
```

Cookie-authenticated applications therefore need an appropriate CSRF strategy.

Possible approaches include:

- SameSite cookies
- CSRF tokens
- origin checks
- deployment-specific controls

---

# 18. CORS vs CSRF

## Question

Are CORS and CSRF the same?

No.

CORS controls which browser origins may read cross-origin responses under the browser's cross-origin rules.

CSRF concerns unwanted authenticated state-changing requests.

An application can have a correct CORS configuration and still require CSRF protection.

---

# 19. XSS

## Question

What is XSS?

Cross-Site Scripting occurs when attacker-controlled content is executed as code in a user's browser.

Potential impact includes:

- reading page data
- performing actions
- stealing non-HttpOnly credentials
- abusing active sessions

Defenses include:

- output encoding
- safe rendering
- Content Security Policy where appropriate
- input handling
- framework protections
- avoiding dangerous HTML injection

---

# 20. Session Fixation

## Question

What is session fixation?

An attacker attempts to make a victim use a session identifier known to the attacker.

A good authentication system creates a new session after successful authentication rather than continuing an attacker-controlled pre-authentication session.

---

# 21. Session Hijacking

Session hijacking occurs when an attacker obtains a valid session credential.

Defenses include:

- HTTPS
- Secure cookies
- HttpOnly cookies
- appropriate SameSite policy
- short/appropriate session lifetimes
- server-side revocation
- anomaly detection where appropriate

---

# 22. Session Revocation

## Question

How do you log out a user?

The server invalidates the session.

Conceptually:

```text
Browser
  |
POST /auth/logout
  |
Find session
  |
Revoke/delete session
  |
Clear cookie
```

The browser-side cookie is not sufficient by itself.

Server-side invalidation is important because a copied token should no longer authenticate after revocation.

---

# 23. What If the User Has Multiple Devices?

Each login can create a separate session.

Example:

```text
User
 |
 +-- Laptop session
 |
 +-- Phone session
 |
 +-- Tablet session
```

This enables:

- per-device logout
- session listing
- selective revocation
- revoke-all-sessions

The exact product behavior should be documented.

---

# 24. Password Reset

## Question

Explain password reset.

## Request phase

```text
User submits email
       |
Generic response
       |
Generate random token
       |
Hash token
       |
Store token + expiration
       |
Queue email
```

## Confirmation phase

```text
User clicks reset link
       |
Validate token
       |
Consume token atomically
       |
Update password
       |
Revoke sessions as required
       |
Record audit event
```

---

# 25. Why One-Time Reset Tokens?

If a reset token can be reused, someone who obtains it may repeatedly reset the password.

Therefore reset tokens should generally be:

- random
- short-lived
- single-use
- stored safely
- excluded from logs

---

# 26. Why Avoid Account Enumeration?

Consider:

```text
Email exists:
"Reset email sent."

Email does not exist:
"No account found."
```

An attacker can use this to discover registered users.

Instead, return a generic response such as:

> If an account matches the submitted information, reset instructions will be sent.

The backend can behave differently internally while maintaining a similar public response.

---

# 27. Password Change vs Password Reset

Password change normally requires the current authenticated session.

Password reset is an account-recovery flow that does not require the old password but requires possession of an approved recovery mechanism.

They have different threat models.

---

# 28. Rate Limiting

## Question

Why rate-limit authentication?

To reduce:

- brute force
- credential stuffing
- password spraying
- registration abuse
- reset-email abuse
- resource exhaustion

Rate limits may use multiple dimensions:

```text
IP
account
endpoint
device
network
```

The exact policy depends on the threat model.

---

# 29. Distributed Rate Limiting

## Question

Why is an in-memory rate limiter insufficient after horizontal scaling?

Suppose:

```text
API-1 -> 10 attempts
API-2 -> 10 attempts
API-3 -> 10 attempts
```

Each server has its own counter.

A global limit is not actually global.

A shared store such as Redis can maintain distributed counters.

---

# 30. What If Redis Rate Limiting Fails?

This is a security design decision.

Possible strategies:

- fail closed for high-risk endpoints
- use a temporary local emergency limit
- reject requests until shared protection returns

The system should not silently disable abuse protection without a deliberate policy.

---

# 31. Database Design

## Question

What tables would you use?

Core entities include:

```text
users
sessions
password_reset_tokens
roles
user_roles
audit_events
```

Relationships:

```text
users 1 ---- N sessions

users 1 ---- N password_reset_tokens

users N ---- N roles
        |
     user_roles

users 1 ---- N audit_events
```

---

# 32. Why Separate Roles and Users?

A user can have multiple roles.

Example:

```text
User 123
  |
  +-- user
  +-- moderator
```

A many-to-many relationship provides flexibility.

The database can enforce uniqueness on:

```text
(user_id, role_id)
```

---

# 33. Authentication vs Role Checking

A request can be:

```text
Authenticated
```

but still:

```text
Unauthorized for this resource
```

Example:

```text
GET /admin/users
```

may require an admin role.

The middleware should first establish identity and then evaluate authorization.

---

# 34. IDOR

## Question

What is IDOR?

Insecure Direct Object Reference occurs when a user can manipulate an identifier to access another user's resource.

Example:

```text
GET /users/123
```

User 456 changes it to:

```text
GET /users/457
```

and receives another user's data.

The server must authorize access to the object, not merely validate that the ID exists.

---

# 35. Database Constraints

Application validation is not enough.

For example:

```text
Check email exists
Create user
```

Two concurrent requests can both pass the check.

A database `UNIQUE` constraint provides the final consistency guarantee.

---

# 36. Transactions

## Question

Where are transactions important?

Examples:

- user creation with required related records
- password changes
- reset-token consumption
- session revocation plus security events
- role changes

A transaction helps ensure a related set of changes succeeds or rolls back together where appropriate.

---

# 37. Atomic Reset Token Consumption

A dangerous implementation is:

```text
SELECT token
UPDATE token as used
```

without proper concurrency control.

Two requests may race.

A safer design uses an atomic transaction/update so only one request can successfully consume the token.

---

# 38. API Design

## Question

What endpoints exist?

Core endpoints:

```text
POST /auth/register
POST /auth/login
POST /auth/logout
GET  /auth/me

POST /auth/password-reset/request
POST /auth/password-reset/confirm
POST /auth/password/change
```

The API uses versioning such as:

```text
/api/v1/auth/...
```

---

# 39. Why Version APIs?

Versioning allows the API contract to evolve.

Example:

```text
/api/v1/auth/login
/api/v2/auth/login
```

The exact strategy may instead use header-based or other compatibility mechanisms.

The important requirement is controlled contract evolution.

---

# 40. HTTP Status Codes

Examples:

```text
201 Created
200 OK
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
429 Too Many Requests
500 Internal Server Error
503 Service Unavailable
```

Use status codes consistently with the API contract.

---

# 41. 401 vs 403

## 401 Unauthorized

The request does not have valid authentication credentials.

Examples:

- missing session
- expired session
- invalid session

## 403 Forbidden

The user is authenticated but lacks permission.

Example:

```text
authenticated user
+
admin-only endpoint
+
user is not admin
=
403
```

---

# 42. Why Request IDs?

Every request can receive an identifier such as:

```text
X-Request-Id: req_123
```

This allows a request to be traced across:

```text
Client
 -> API
 -> database
 -> worker
 -> logs
```

It is especially useful during incidents.

---

# 43. What Should Never Be Logged?

Never log:

- plaintext passwords
- raw session tokens
- password-reset tokens
- authorization headers
- secret keys
- database credentials
- sensitive personal information unnecessarily

Security-sensitive logs should contain enough information for investigation without becoming another credential store.

---

# 44. Observability

## Question

What would you monitor?

### API

- request rate
- latency
- error rate
- CPU
- memory

### Authentication

- login success/failure
- registration rate
- reset requests
- session failures
- password verification duration

### Database

- query latency
- connections
- locks
- CPU
- replication lag

### Redis

- latency
- memory
- operations
- errors

### Queue

- depth
- oldest job age
- retries
- dead letters

---

# 45. Logs vs Metrics vs Traces

## Logs

Detailed individual events.

Example:

```text
requestId=req_123 dependency_timeout postgres
```

## Metrics

Aggregated measurements.

Example:

```text
login_failure_total = 1200
```

## Traces

Show the path of a request across services.

Example:

```text
API
 |
PostgreSQL
 |
Redis
```

All three complement each other.

---

# 46. Why p95 and p99?

Average latency can hide slow requests.

Example:

```text
Average = 100 ms
p99 = 3 seconds
```

Most requests look healthy while a significant tail is slow.

Authentication systems should monitor tail latency for critical endpoints.

---

# 47. Health vs Readiness

## Health

> Is the process alive?

## Readiness

> Should this instance receive traffic?

A process can be alive but unable to safely serve traffic because a required dependency is unavailable.

---

# 48. Horizontal Scaling

## Question

How would you scale this system?

```text
Load Balancer
      |
 API API API
      |
 +----+----+
 |         |
Redis   PostgreSQL
            |
         replicas
```

The API must not depend on local process memory for durable authentication state.

---

# 49. Why Stateless APIs?

Stateless API instances allow:

- load balancing
- autoscaling
- rolling deployment
- instance replacement
- failure recovery

Any healthy instance can process the next request.

---

# 50. Why Not Sticky Sessions?

Sticky sessions can keep users on one instance, but they do not solve:

- instance failure
- durable state
- scaling
- reliable failover

Shared session storage is generally more robust for horizontally scaled systems.

---

# 51. PostgreSQL Scaling

Start with:

- indexes
- efficient queries
- connection pooling
- transaction optimization
- monitoring

Then consider:

- read replicas
- partitioning
- sharding

only when measured requirements justify them.

---

# 52. Read Replica Problem

Suppose:

```text
Password changed
     |
Primary updated
     |
Replica still stale
```

A subsequent security-sensitive read from the replica may see old state.

Therefore replicas require explicit consistency rules.

---

# 53. Connection Pooling

Too many API instances can create too many database connections.

Example:

```text
20 API instances
x
30 connections
=
600 possible connections
```

The database may not safely support that number.

Pool size must be planned across all application instances and workers.

---

# 54. Redis Scaling

Redis can be used for:

- sessions
- rate limits
- temporary state
- caching

Important concerns:

- memory
- TTL
- hot keys
- high availability
- failure behavior

---

# 55. Cache vs Source of Truth

A cache is an optimization.

A database or other authoritative store is the source of truth.

Never design security decisions around a cache that can disappear or become stale without understanding the consequences.

---

# 56. Queue and Workers

Email should usually be asynchronous:

```text
API
 |
Queue
 |
Worker
 |
Email Provider
```

This prevents a slow external provider from blocking authentication requests.

---

# 57. Retry Strategy

Retries should use:

- exponential backoff
- jitter
- maximum attempts
- error classification

Do not retry permanent failures.

Do not retry infinitely.

---

# 58. Idempotency

Distributed systems can process an event more than once.

Example:

```text
Worker sends email
Worker crashes
Job retries
Email may be sent again
```

Design operations so duplicate processing does not create unsafe state.

---

# 59. Failure Handling

## Question

What happens if PostgreSQL goes down?

Answer:

> The API uses bounded timeouts and returns controlled failures for operations that require the database. It must not claim that a security-sensitive write succeeded when it did not. A production deployment can use PostgreSQL high availability and failover, but the application still needs to verify recovery.

---

# 60. What If Redis Goes Down?

Answer:

> It depends on the Redis workload. Cache failures may be handled by bypassing the cache. Session or rate-limit failures require an explicit security policy. The system should not treat an inability to validate a security-sensitive session as proof that the session is valid.

---

# 61. Cascading Failures

A cascading failure occurs when one dependency causes resource pressure elsewhere.

Example:

```text
Email provider slows
      |
workers wait
      |
queue grows
      |
resources consumed
      |
API affected
```

Controls include:

- timeouts
- concurrency limits
- queues
- bulkheads
- bounded retries
- circuit breakers

---

# 62. Graceful Degradation

Not every feature has equal importance.

For example:

```text
Analytics unavailable
      |
authentication continues
```

may be acceptable.

But:

```text
Cannot validate authentication
      |
accept request anyway
```

may be unsafe.

Security-critical functions need stricter failure policies.

---

# 63. Deployment Strategy

A production deployment can use rolling updates:

```text
API-1 old
API-2 old
API-3 old

API-1 new
API-2 old
API-3 old

API-1 new
API-2 new
API-3 old

All new
```

The load balancer should stop sending traffic to instances that are not ready.

---

# 64. Graceful Shutdown

On shutdown:

1. stop receiving new traffic
2. finish active requests
3. stop background work safely
4. close database connections
5. close Redis connections
6. exit

This reduces dropped requests and partial operations.

---

# 65. Bad Deployment

## Question

What would you do if a new deployment causes login failures?

Answer:

1. stop rollout
2. identify the changed component
3. inspect metrics/logs
4. rollback if safe
5. verify login
6. verify sessions
7. verify database compatibility
8. investigate root cause after stabilization

---

# 66. Database Migration Safety

Avoid destructive migrations that require all application instances to upgrade simultaneously.

Use expand-and-contract:

```text
Add new structure
       |
Deploy compatible code
       |
Migrate/backfill
       |
Switch reads
       |
Remove old structure later
```

---

# 67. Capacity Planning

A simple planning model:

```text
Required capacity
=
peak load
x growth assumption
x failure headroom
```

These are planning assumptions, not guarantees.

Actual capacity must be validated through load testing.

---

# 68. Load Testing

Test:

- login success
- login failure
- registration
- session validation
- logout
- password reset
- mixed production-like traffic

Do not test only `/health`.

---

# 69. Stress vs Load Test

## Load test

Expected production traffic.

## Stress test

Traffic beyond expected capacity.

## Spike test

Sudden traffic increase.

## Soak test

Long-duration load to find:

- leaks
- connection problems
- gradual degradation

---

# 70. Password Hashing and Scaling

Password hashing is intentionally expensive.

If login traffic grows:

```text
more logins
   |
more Argon2 work
   |
higher CPU/memory
```

Possible responses:

- add compute
- control concurrency
- investigate abuse
- optimize infrastructure

Do not simply weaken password hashing to increase throughput.

---

# 71. Multi-Region

Multi-region deployment introduces complexity around:

- session state
- password changes
- revocation
- global rate limits
- database consistency
- failover

It should only be introduced when geographic latency, disaster recovery, or availability requirements justify it.

---

# 72. Active-Active vs Active-Passive

## Active-passive

One region serves traffic.

Another region is prepared for failover.

Simpler consistency model.

## Active-active

Both regions serve traffic.

Higher complexity because state synchronization and consistency become more difficult.

---

# 73. RTO and RPO

## RTO

Recovery Time Objective:

> How quickly should the service be restored?

## RPO

Recovery Point Objective:

> How much data loss is acceptable?

Both should be explicitly defined.

---

# 74. Backup vs High Availability

Backups and high availability solve different problems.

### High availability

Helps keep the service running during infrastructure failure.

### Backup

Helps recover data after corruption, deletion, or other data-loss scenarios.

A production system needs both appropriate to its requirements.

---

# 75. Security Threat Model

Important threats include:

- credential stuffing
- brute force
- password spraying
- session theft
- session fixation
- CSRF
- XSS
- account enumeration
- reset-token theft
- IDOR
- privilege escalation
- secret exposure
- dependency compromise

The system should map each threat to controls.

---

# 76. Supply-Chain Security

Third-party packages can introduce risk.

Controls include:

- dependency review
- lockfiles
- vulnerability scanning
- controlled updates
- minimal dependencies
- package provenance where available

Do not blindly upgrade production dependencies without testing.

---

# 77. Why Zod?

Zod provides runtime validation at the API boundary.

TypeScript types alone do not validate runtime input.

Example:

```text
Client JSON
   |
Zod
   |
Validated object
   |
Business logic
```

This prevents malformed external input from being treated as trusted application data.

---

# 78. Why Helmet?

Helmet provides security-related HTTP headers for Express applications.

Headers can help reduce browser-side risks.

It is one layer of defense, not a complete security solution.

---

# 79. Why CORS Allowlisting?

Instead of:

```text
Access-Control-Allow-Origin: *
```

a controlled application can allow known origins.

Example:

```text
https://app.example.com
https://admin.example.com
```

The exact configuration depends on whether credentials are used and how the frontend is deployed.

---

# 80. Why Environment Variables?

Configuration such as:

- database URLs
- session secrets
- trusted origins
- provider credentials

should not be hard-coded into source code.

Production secrets should preferably be managed by a dedicated secret-management system.

---

# 81. Current Reference Implementation Limitations

## Question

Is this repository implementation production-ready?

Answer:

> No. It is intentionally a reference implementation. The current code uses in-memory users and sessions and demonstrates the application contract and security patterns. Production deployment would replace in-memory persistence with PostgreSQL/Redis, add durable reset-token handling, asynchronous email, distributed rate limiting, secret management, production observability, and infrastructure-level TLS/high availability.

This answer is important.

Do not claim production readiness that the implementation does not have.

---

# 82. Why Start With In-Memory Storage?

For a reference implementation, in-memory state keeps the code easy to run and understand.

It demonstrates:

- route structure
- middleware
- validation
- password hashing
- session lifecycle
- error handling
- testing

The production architecture is documented separately.

---

# 83. What Would You Change First for Production?

A strong answer:

1. PostgreSQL for durable users and security state.
2. Redis or another shared store for sessions/rate limits where appropriate.
3. Durable password-reset token storage.
4. Async email delivery.
5. Distributed rate limiting.
6. Production secret management.
7. TLS and infrastructure controls.
8. Production monitoring and alerting.
9. Database backups and recovery testing.
10. Load and abuse testing.

---

# 84. Explain the Current Middleware

The reference implementation has middleware for:

- authentication
- errors
- request IDs
- security headers
- cookie parsing
- CORS

Authentication middleware:

```text
Request
  |
Read cookie
  |
Validate session
  |
Attach user
  |
Next handler
```

An invalid or missing session results in an authentication error for protected endpoints.

---

# 85. Error Middleware

Centralized error handling provides:

- consistent responses
- controlled status codes
- safe production errors
- centralized logging
- request correlation

The client should not receive internal stack traces in production.

---

# 86. Why Centralized Validation?

Without centralized validation, every route may implement slightly different rules.

That creates:

- inconsistent behavior
- security gaps
- duplicate code

Schemas provide a reusable boundary.

---

# 87. Testing Strategy

The authentication test suite should cover:

### Unit behavior

- password utilities
- session utilities
- validation

### Integration behavior

- registration
- login
- `/auth/me`
- logout
- reset flow

### Security behavior

- invalid credentials
- session revocation
- enumeration protection
- malformed input
- authorization failures

### Failure behavior

- dependency failures
- timeout behavior
- rate-limit behavior

---

# 88. Why Integration Tests Matter

Authentication is a multi-component workflow.

Testing individual functions is not enough.

Example:

```text
login
 -> password verification
 -> session creation
 -> cookie
 -> /auth/me
```

An integration test verifies that these pieces work together.

---

# 89. Test Case: Duplicate Registration

Expected behavior:

```text
First registration -> success
Second same email -> conflict
```

The database should enforce uniqueness in production.

---

# 90. Test Case: Invalid Credentials

The API should not reveal whether the account exists.

For example:

```text
Invalid email/password
```

rather than:

```text
Email exists but password is wrong
```

The exact response should follow the API contract.

---

# 91. Test Case: Logout

Test:

```text
Login
  |
Get /me -> success
  |
Logout
  |
Get /me -> 401
```

This verifies server-side session invalidation.

---

# 92. Test Case: Expired Session

An expired session should not authenticate.

The server should validate expiration rather than trusting the browser.

---

# 93. Test Case: Replayed Reset Token

Test:

```text
Reset token
  |
First use -> success
  |
Second use -> rejected
```

This validates one-time consumption.

---

# 94. Test Case: CSRF

Test that state-changing requests without the required CSRF protection are rejected when the deployment model requires CSRF protection.

---

# 95. Test Case: Rate Limiting

Test:

```text
Allowed attempts
   |
threshold
   |
429
```

Also test reset behavior after the configured window.

---

# 96. API Contract Question

## Question

Why standardize error responses?

Because clients need predictable behavior.

Example:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Authentication failed",
    "requestId": "req_123"
  }
}
```

Clients can use stable machine-readable codes while operators use request IDs for troubleshooting.

---

# 97. Why Include Request ID in Errors?

A request ID allows a user or support engineer to provide:

```text
req_123
```

and the engineering team can locate corresponding logs/traces.

It avoids exposing internal stack traces.

---

# 98. API Idempotency

Some authentication operations may be safe to retry.

Others need special handling.

For example:

```text
Password reset request
```

may tolerate duplicate requests with carefully designed semantics.

A state-changing operation that creates external side effects may need an idempotency key.

---

# 99. Login Idempotency

Login is not identical to a generic idempotent HTTP operation because it may create a new session on each successful request.

The product can decide whether repeated login should:

- reuse an existing session
- create another session
- rotate sessions

The important part is that session creation remains secure and predictable.

---

# 100. Session Rotation

Session identifiers should be rotated when security boundaries change.

Important event:

```text
Unauthenticated
      |
Successful authentication
      |
New authenticated session
```

This helps prevent session fixation.

---

# 101. Authorization Checks

A protected route should conceptually perform:

```text
Is session valid?
      |
Who is the user?
      |
What roles/permissions does the user have?
      |
Is this action allowed?
      |
Perform operation
```

Do not rely on frontend authorization.

---

# 102. Frontend vs Backend Authorization

Frontend checks improve user experience.

Backend checks provide security.

An attacker can bypass:

```text
React button hidden
```

but cannot bypass a correctly enforced server-side authorization policy.

---

# 103. Admin Authentication

Admin access should have stronger controls where appropriate.

Potential controls:

- separate admin roles
- stronger authentication
- MFA
- stricter rate limits
- audit logging
- privileged-session controls

The exact requirements depend on the system.

---

# 104. MFA Follow-Up

## Interviewer

How would you add MFA?

## Answer

Add a second authentication factor after primary credential verification.

Possible flow:

```text
Password valid
    |
MFA challenge
    |
Code/passkey/security key
    |
Create fully authenticated session
```

The authentication state should distinguish:

```text
password authenticated
```

from:

```text
fully authenticated
```

when the product requires it.

---

# 105. OAuth Follow-Up

## Interviewer

How would you support Google/GitHub login?

## Answer

Use an OAuth/OIDC provider.

Conceptually:

```text
Application
   |
Authorization request
   |
Identity Provider
   |
Authorization code
   |
Backend
   |
Token exchange
   |
Verify identity
   |
Map provider identity to local user
   |
Create application session
```

The application should still have its own user/session model.

---

# 106. JWT Follow-Up

## Question

Why not JWT?

JWTs can be useful, especially for certain distributed APIs.

However, server-managed sessions provide straightforward:

- revocation
- session lifecycle
- server-side state control

JWTs introduce trade-offs around:

- revocation
- token lifetime
- token storage
- claim freshness
- key rotation
- token size

There is no universal authentication mechanism that is best for every architecture.

---

# 107. Session vs JWT

| Topic | Server session | JWT |
|---|---|---|
| Revocation | straightforward server-side | more involved |
| Server state | required | less required |
| Token contents | opaque | claims |
| Token size | small | can be larger |
| Horizontal scaling | shared session store | can be easier for some use cases |
| Immediate claim changes | straightforward | may require expiration/refresh strategy |
| Logout | server revocation | requires token strategy |

The choice should follow system requirements.

---

# 108. Refresh Tokens

If using access/refresh-token architecture:

```text
Short-lived access token
        +
Longer-lived refresh token
```

The refresh token needs strong protection and rotation/revocation strategy.

Do not introduce refresh tokens merely because they are common.

---

# 109. Threat Modeling Question

## Question

How would you threat-model this system?

Answer:

Start with assets:

- user accounts
- password hashes
- session credentials
- reset tokens
- roles
- audit data

Then identify trust boundaries:

```text
Browser
   |
Internet
   |
API
   |
Database
   |
Redis
   |
External providers
```

Then enumerate threats and controls.

---

# 110. Trust Boundaries

Important boundaries include:

```text
Untrusted browser
       |
       v
Public API
       |
       v
Internal services
       |
       +--> PostgreSQL
       +--> Redis
       +--> Email provider
```

Never assume data crossing a boundary is trustworthy.

---

# 111. Principle of Least Privilege

Services and database users should have only the permissions required.

For example:

- API database user should not automatically have unrestricted administrative access.
- Workers should not receive unrelated secrets.
- Admin endpoints should require privileged authorization.

---

# 112. Secret Rotation

Secrets should be rotatable without requiring insecure source-code changes.

Production systems may use:

- cloud secret managers
- vault systems
- managed key stores

The architecture should define:

- who can access secrets
- how they are rotated
- how applications reload them
- how old secrets are revoked

---

# 113. Encryption at Rest

Sensitive data should be protected at rest using appropriate infrastructure/database controls.

Password hashes are not plaintext passwords, but they remain security-sensitive.

Other sensitive records may require encryption depending on the data classification.

---

# 114. Encryption in Transit

Production traffic should use HTTPS/TLS.

Internal service communication should also use appropriate transport security based on the threat model.

---

# 115. Data Retention

Not all authentication data should be retained forever.

Examples:

- expired sessions
- reset tokens
- audit records
- security logs

Define retention periods according to:

- security requirements
- operational needs
- legal/compliance requirements
- storage cost

---

# 116. Audit Events

Useful events include:

```text
USER_REGISTERED
LOGIN_SUCCEEDED
LOGIN_FAILED
LOGOUT
PASSWORD_CHANGED
PASSWORD_RESET_REQUESTED
PASSWORD_RESET_COMPLETED
SESSION_REVOKED
ROLE_CHANGED
```

Audit events should contain enough context for investigation without exposing credentials.

---

# 117. Security vs Privacy

Authentication systems collect information that can reveal user behavior.

Logging should follow data minimization.

Do not collect or retain data simply because it is technically possible.

---

# 118. What If a User Deletes Their Account?

Define behavior for:

- sessions
- reset tokens
- roles
- audit events
- related resources

Some audit/security records may need different retention treatment from ordinary user profile data.

The exact policy depends on product and legal requirements.

---

# 119. Database Deletion Strategy

Possible approaches:

- hard delete
- soft delete
- anonymization
- retention-based deletion

Authentication state must remain internally consistent.

For example, deleting a user should not leave an active session that can still authenticate.

---

# 120. Scaling Interview Scenario

## Question

Your API handles 100 requests/sec and now receives 1,000 requests/sec. What do you do?

Answer:

> I would not immediately add ten servers. First I would identify the bottleneck using CPU, memory, database latency, Redis latency, request latency, and traces. If the API tier is the bottleneck and instances are stateless, I would scale horizontally. If the database is saturated, I would optimize queries or database capacity instead. The change should be validated with load testing.

---

# 121. Database Saturation Scenario

## Question

API CPU is only 30%, but requests are slow. What do you check?

Answer:

- database CPU
- query latency
- connection pool wait
- locks
- slow queries
- replication lag
- network latency

The API itself may not be the bottleneck.

---

# 122. Redis Saturation Scenario

## Question

What if Redis latency increases?

Answer:

Check:

- CPU
- memory
- command rate
- hot keys
- network
- connection count
- slow commands
- eviction behavior

Then determine whether Redis is used for cache, sessions, rate limits, or all three.

The mitigation depends on the workload.

---

# 123. Queue Saturation Scenario

## Question

The password-reset queue is growing. What do you do?

Answer:

Measure:

```text
arrival rate
processing rate
worker count
provider latency
retry rate
```

If arrival rate exceeds processing rate, increase safe worker capacity or improve processing throughput.

Also investigate whether traffic is legitimate or abusive.

---

# 124. Credential Attack Scenario

## Question

Login traffic suddenly increases 20x. Is it automatically a scaling problem?

No.

It could be:

- legitimate traffic
- credential stuffing
- password spraying
- a client bug
- a deployment issue

Investigate traffic characteristics and apply appropriate abuse controls.

---

# 125. Security Incident Scenario

## Question

You discover session tokens in logs. What do you do?

Answer:

1. treat the tokens as compromised
2. restrict access to affected logs
3. preserve evidence
4. identify affected sessions if possible
5. revoke affected sessions
6. rotate relevant secrets if needed
7. remove unsafe logging
8. assess exposure
9. follow security incident procedures

Do not simply delete logs before preserving required evidence.

---

# 126. Production Readiness Question

## Question

What is missing from the current reference implementation?

Answer:

> The current implementation intentionally uses in-memory state. For production I would add PostgreSQL persistence, shared session storage, durable reset tokens, distributed rate limiting, asynchronous email, secret management, production TLS/infrastructure, audit persistence, session cleanup, database backups, high availability, monitoring, alerting, and load/abuse testing.

---

# 127. Why Documentation Is Part of the Project

A reusable engineering repository should not only contain source code.

It should explain:

- requirements
- architecture
- API contract
- data model
- security
- observability
- testing
- deployment
- scaling
- failure handling
- implementation
- interview reasoning

This makes the scenario reusable by other engineers.

---

# 128. Explain a Trade-Off

## Question

What is one trade-off in your design?

Answer:

> Server-managed sessions require shared session storage when the API scales horizontally. That adds an infrastructure dependency such as Redis or PostgreSQL. In exchange, the server gets direct control over session revocation and lifecycle, which is valuable for authentication.

---

# 129. Another Trade-Off

## Question

Why not put everything in PostgreSQL?

Answer:

> PostgreSQL is a strong durable source of truth, but high-volume ephemeral workloads such as sessions and rate-limit counters may benefit from Redis because of low-latency access and native TTL behavior. The trade-off is operating another dependency.

---

# 130. Another Trade-Off

## Question

Why not use Redis for everything?

Answer:

> Redis is excellent for fast ephemeral state, but durable account data and security-critical records often need stronger persistence and transactional semantics. PostgreSQL is better suited as the durable source of truth for those records.

---

# 131. Another Trade-Off

## Question

Why not make everything asynchronous?

Answer:

> Security-critical state transitions such as password changes need authoritative synchronous persistence. Asynchronous processing is better suited to secondary effects such as email, analytics, and notifications.

---

# 132. Another Trade-Off

## Question

Why not use microservices?

Answer:

> A modular architecture can provide clear boundaries without immediately introducing distributed-system complexity. Microservices add network calls, deployment complexity, observability requirements, and new failure modes. I would split services when workload, organizational ownership, or reliability boundaries justify it.

---

# 133. Design Extension: MFA

Possible additions:

```text
mfa_factors
mfa_challenges
```

Flow:

```text
Password verification
       |
MFA challenge
       |
Verify second factor
       |
Create full session
```

Audit events should record meaningful security transitions.

---

# 134. Design Extension: Email Verification

Possible entity:

```text
email_verification_tokens
```

Flow:

```text
Registration
    |
Generate token
    |
Hash token
    |
Store expiration
    |
Queue email
    |
Verify
    |
Mark email verified
```

Use one-time, expiring tokens.

---

# 135. Design Extension: Account Locking

Account lockout can reduce brute force but can also enable denial-of-service if attackers intentionally trigger lockouts.

Alternatives include:

- progressive delays
- rate limiting
- risk-based controls
- temporary challenges

The policy should balance abuse prevention and availability.

---

# 136. Design Extension: Passkeys

Passkeys/WebAuthn can provide phishing-resistant authentication.

A passkey architecture introduces:

- credential registration
- challenge generation
- challenge verification
- credential public keys
- authenticator metadata

The server stores public credential data rather than the private key.

---

# 137. Design Extension: Social Login

Store external identity mapping:

```text
user_id
provider
provider_subject
```

A provider subject should be treated as the stable external identifier.

Do not rely only on display names or email strings for identity mapping.

---

# 138. System Design: Design Authentication for 10 Million Users

A structured answer:

### Requirements

- secure login
- registration
- sessions
- reset
- high availability
- abuse protection

### Architecture

```text
Global Edge
   |
Regional Load Balancers
   |
Stateless API
   |
Session Store
   |
PostgreSQL
   |
Async Queue
   |
Workers
```

### Scaling

- horizontal API
- distributed sessions
- database replicas
- partitioning where justified
- distributed rate limits
- worker scaling

### Security

- Argon2id
- secure cookies
- CSRF controls
- rate limiting
- audit logs
- secret management

### Reliability

- multi-zone
- backups
- failover
- tested recovery

### Important

Do not claim a specific technology or topology is mandatory without workload requirements.

---

# 139. System Design: Design for 100,000 Logins per Second

The first question should be:

> Is 100,000 successful password verifications per second actually required?

If yes, password hashing becomes a major capacity challenge.

Discuss:

- hardware
- Argon2id cost
- concurrency
- distributed API capacity
- abuse controls
- credential-store lookup capacity
- database architecture
- queueing where appropriate

Do not solve this by simply making password hashing weak.

---

# 140. System Design: Global Authentication

Discuss:

- regional routing
- session placement
- revocation propagation
- database replication
- consistency
- global rate limits
- disaster recovery
- RTO/RPO

A global authentication system is fundamentally a distributed-consistency problem as well as an HTTP/API problem.

---

# 141. Debugging Question: Login Returns 401

Investigation:

```text
1. Does user exist?
2. Is password verification failing?
3. Is session creation failing?
4. Is cookie being set?
5. Is cookie being returned?
6. Is session lookup succeeding?
7. Is session expired?
8. Is the request reaching the correct API?
```

Use request IDs and structured logs.

---

# 142. Debugging Question: Login Works, `/auth/me` Returns 401

Check:

- Set-Cookie response
- browser cookie storage
- cookie Path
- Secure flag
- SameSite behavior
- request origin
- cookie transmission
- session-store lookup
- session expiration

This is often a cookie/session issue rather than password verification.

---

# 143. Debugging Question: Works Locally, Fails in Production

Check:

- environment variables
- HTTPS
- cookie `Secure`
- trusted origins
- reverse proxy behavior
- CORS
- database connectivity
- Redis connectivity
- secret configuration
- hostname/domain
- production build configuration

Do not assume application code is the only difference.

---

# 144. Debugging Question: Only Some Users Fail

Potential causes:

- regional routing
- one unhealthy API instance
- account-specific data
- specific browser/cookie behavior
- replica lag
- rate limits
- corrupted session records

Compare successful and failing request traces.

---

# 145. Debugging Question: All Users Suddenly Logged Out

Investigate:

- session-store failure
- session-secret/configuration change
- cookie domain/path change
- TTL configuration
- database migration
- deployment
- Redis flush/restart
- session schema change

Check whether sessions still exist before assuming users need to log in again.

---

# 146. Debugging Question: Password Reset Emails Delayed

Check:

```text
API request rate
    |
queue depth
    |
worker health
    |
provider latency
    |
provider rate limit
```

The problem may not be the API.

---

# 147. Debugging Question: CPU Suddenly 100%

For authentication:

Check:

- login volume
- password verification duration
- credential attack
- registration volume
- Argon2 configuration
- number of workers
- autoscaling
- recent deployment

Do not immediately increase CPU without checking traffic and security signals.

---

# 148. Interviewer Follow-Up Chain

A common interview pattern:

### Interviewer

Why sessions?

### Candidate

Server-side revocation and lifecycle control.

### Interviewer

How do you scale sessions?

### Candidate

Shared Redis/PostgreSQL.

### Interviewer

What if Redis fails?

### Candidate

Explicit fail-closed or trusted fallback policy.

### Interviewer

How do rate limits scale?

### Candidate

Distributed shared counters.

### Interviewer

What if Redis is down for both?

### Candidate

Emergency security policy.

### Interviewer

What if the database is overloaded?

### Candidate

Connection budgeting, query optimization, replicas where appropriate.

### Interviewer

What if replicas lag?

### Candidate

Security-sensitive reads use appropriate consistency.

This demonstrates architectural depth.

---

# 149. Another Follow-Up Chain

### Interviewer

Why Argon2id?

> Memory-hard password hashing.

### Interviewer

Why not reduce its cost if login is slow?

> Preserve security requirements; scale compute and control concurrency first.

### Interviewer

What if CPU is still saturated?

> Separate hashing workload, add capacity, investigate abuse, and benchmark configuration.

### Interviewer

What if attackers generate millions of login requests?

> Edge protection plus distributed rate limiting and abuse detection.

---

# 150. Another Follow-Up Chain

### Interviewer

Why PostgreSQL?

> Strong relational consistency and transactional semantics for durable account state.

### Interviewer

Why Redis?

> Fast shared ephemeral state and TTL-based workloads.

### Interviewer

Why not Redis for users?

> Durable relational account data benefits from transactional persistence and stronger source-of-truth semantics.

### Interviewer

Why not PostgreSQL for sessions?

> It can work, especially at smaller scale. Redis becomes attractive when session access volume and TTL-oriented workload justify it.

---

# 151. Another Follow-Up Chain

### Interviewer

Why asynchronous email?

> External provider latency should not block the authentication request.

### Interviewer

What if the queue fails?

> Follow the operation-specific durability policy.

### Interviewer

What if the email provider fails?

> Retry with bounded backoff.

### Interviewer

What if retries create duplicates?

> Use idempotency/deduplication where practical and ensure duplicate processing cannot create unsafe authentication state.

---

# 152. Strong Interview Answer Pattern

When asked:

> Why did you choose X?

Answer:

```text
I chose X because...
The requirement was...
The alternative was...
The trade-off is...
I would reconsider X if...
```

Example:

> I chose server-managed sessions because the requirement emphasizes direct revocation and server-side control. JWTs are another option, but they introduce different revocation and claim-freshness trade-offs. I would reconsider the choice if the system had a specific distributed-token requirement that justified those trade-offs.

---

# 153. Weak Interview Answer Pattern

Avoid:

> Redis is faster, so I used Redis.

This is incomplete.

Better:

> Redis is useful for low-latency ephemeral state with TTLs. I would use it for sessions or rate limits when the traffic profile justifies it, while keeping durable account state in PostgreSQL. The trade-off is operating another dependency and defining failure behavior.

---

# 154. How to Explain Security Without Overclaiming

Avoid:

> This system is completely secure.

No serious system can make that guarantee.

Say:

> The design addresses the major authentication threats through password hashing, secure session cookies, validation, rate limiting, CSRF controls, authorization checks, auditability, and controlled secret handling. Production security still requires infrastructure controls, monitoring, testing, and ongoing threat assessment.

---

# 155. How to Explain Production Readiness

Avoid:

> It is 100% production-ready.

Instead:

> The architecture is production-oriented, while the repository implementation is intentionally a runnable reference skeleton. The remaining production work is explicitly documented, including durable persistence, shared session infrastructure, distributed rate limiting, asynchronous email, secret management, high availability, and operational controls.

---

# 156. Project-Specific Question: What Did You Personally Build?

A strong answer should be truthful and specific.

Example:

> I designed the authentication scenario as a reusable engineering reference. I defined the requirements, architecture, data model, API contract, security controls, observability model, testing strategy, deployment approach, scaling strategy, and failure modes. I also built the TypeScript/Express reference implementation with validation, Argon2id password hashing, session cookies, authentication middleware, centralized errors, and integration tests.

Only claim work you actually performed.

---

# 157. Project-Specific Question: What Was Hardest?

A strong answer:

> The difficult part was not creating a login endpoint. The challenging part was designing the system around the failure and security boundaries: session revocation, password reset, distributed rate limiting, database consistency, scaling, observability, and dependency failures.

---

# 158. Project-Specific Question: What Would You Improve?

Answer:

> I would move the current in-memory state to PostgreSQL and Redis, add durable reset-token persistence, asynchronous email delivery, distributed rate limiting, production secret management, stronger infrastructure-level observability, high availability, and controlled load/abuse testing.

---

# 159. Project-Specific Question: Why Did You Write So Much Documentation?

Answer:

> The repository is intended as a reusable engineering reference rather than a single demo application. A production feature needs more than code. It needs requirements, contracts, security decisions, failure behavior, deployment guidance, scaling strategy, and testing guidance.

---

# 160. Project-Specific Question: How Is This Different From a Basic Login Project?

Answer:

> A basic login project usually demonstrates registration and login. This scenario treats authentication as a production system and covers the complete engineering lifecycle: security, data modeling, API contracts, observability, testing, deployment, scaling, failure handling, and operational trade-offs.

---

# 161. Architecture Whiteboard Exercise

If asked to draw the system, draw:

```text
                 Browser
                    |
                    v
              Load Balancer
                    |
             +------+------+------+
             |      |      |
           API-1  API-2  API-3
             |      |      |
             +------+------+
                    |
             Authentication
                    |
          +---------+---------+
          |                   |
      PostgreSQL             Redis
          |
       Replicas

API
 |
Queue
 |
Workers
 |
Email Provider

All services
 |
Observability
```

Then explain each arrow.

---

# 162. Data Model Whiteboard

Draw:

```text
users
 |
 +----< sessions
 |
 +----< password_reset_tokens
 |
 +----< audit_events
 |
 +----< user_roles >---- roles
```

Then explain:

- cardinality
- indexes
- constraints
- deletion
- retention
- security

---

# 163. Login Sequence Whiteboard

Draw:

```text
Browser
  |
  | POST /login
  v
API
  |
  | validate
  v
User Store
  |
  | password hash
  v
Argon2id
  |
  | success
  v
Session Store
  |
  | session created
  v
Cookie
  |
  v
Browser
```

Mention rate limiting and audit events around the flow.

---

# 164. Password Reset Whiteboard

Draw:

```text
Request
  |
Generic response
  |
Generate token
  |
Hash token
  |
Persist token
  |
Queue
  |
Email
  |
User clicks link
  |
Validate token
  |
Consume atomically
  |
Update password
  |
Revoke sessions
```

---

# 165. Failure Whiteboard

Draw:

```text
API
 |
 +---- PostgreSQL X
 |
 +---- Redis X
 |
 +---- Queue X
 |
 +---- Email X
```

For each dependency explain:

```text
What fails?
What does the user see?
What is the security policy?
What recovers automatically?
What requires operator action?
```

---

# 166. Scaling Whiteboard

Start:

```text
API -> PostgreSQL
```

Then:

```text
LB
 |
API API API
 |
PostgreSQL
```

Then:

```text
LB
 |
API API API
 |
Redis + PostgreSQL
 |
Queue + Workers
```

Then introduce replicas/regions only if requirements justify them.

---

# 167. Security Whiteboard

Mark trust boundaries:

```text
UNTRUSTED
Browser
   |
   | TLS
   v
API
   |
   +--> DB
   +--> Redis
   +--> Queue
```

Ask:

- What can the browser control?
- What must the server validate?
- What secrets exist?
- Where can tokens appear?
- What can an attacker replay?

---

# 168. Common Interview Mistakes

Avoid:

### Mistake 1

Calling authentication and authorization the same thing.

### Mistake 2

Saying passwords are encrypted instead of hashed.

### Mistake 3

Claiming HttpOnly prevents XSS.

### Mistake 4

Treating CORS as CSRF protection.

### Mistake 5

Saying JWT is always better than sessions.

### Mistake 6

Using Redis as a universal database.

### Mistake 7

Ignoring database connection limits.

### Mistake 8

Saying read replicas are always safe.

### Mistake 9

Reducing password-hash cost to solve CPU saturation.

### Mistake 10

Claiming the reference implementation is production-ready.

---

# 169. Quick-Fire Questions

## What is authentication?

Verifying identity.

## What is authorization?

Determining permissions.

## What is a session?

Server-recognized state associated with an authenticated client.

## Why hash passwords?

To avoid storing recoverable plaintext passwords.

## Why Argon2id?

Memory-hard password hashing designed for password security.

## Why HttpOnly?

Reduces direct JavaScript access to cookies.

## Why Secure?

Restricts cookie transmission to secure transport.

## What is CSRF?

Unwanted authenticated cross-site state-changing action.

## What is XSS?

Injection/execution of attacker-controlled script in a user's browser.

## What is session fixation?

Forcing a victim to use an attacker-known session identifier.

## What is IDOR?

Unauthorized access to another object's resource through manipulated references.

## Why rate-limit login?

Reduce brute force and abuse.

## Why Redis?

Fast shared ephemeral state and TTL workloads.

## Why PostgreSQL?

Durable relational state and transactions.

## Why queues?

Decouple slow/asynchronous work.

## Why request IDs?

Correlate requests across logs and systems.

## Why p99?

Expose tail latency.

---

# 170. Advanced Quick-Fire

## Why not store passwords encrypted?

The application does not need to recover them.

## Why not store raw session tokens?

A store compromise could expose immediately usable credentials.

## Why not trust frontend authorization?

Clients are attacker-controlled.

## Why not use one database connection per request?

Connection creation is expensive and database capacity is finite.

## Why not unlimited retries?

Retries can create cascading failures.

## Why not use replicas for every read?

Replication lag can produce stale security decisions.

## Why not cache authorization forever?

Permissions can change.

## Why not make everything synchronous?

Slow dependencies increase request latency and failure propagation.

## Why not make everything asynchronous?

Security-critical state transitions need authoritative completion.

---

# 171. Scenario Question: Attacker Has a Valid Session Token

What can the system do?

- revoke session
- invalidate all sessions if necessary
- investigate access
- rotate related credentials where appropriate
- increase monitoring
- require reauthentication for sensitive actions

The exact response depends on incident severity.

---

# 172. Scenario Question: User Changes Password

Should existing sessions remain?

This is a product/security policy decision.

A security-sensitive system may revoke other sessions after password change.

The important part is to document the policy and implement it consistently.

---

# 173. Scenario Question: User Logs Out on One Device

Should every session be revoked?

Not necessarily.

Per-session revocation allows:

```text
Laptop -> logged out
Phone  -> remains logged in
```

A separate "log out everywhere" action can revoke all sessions.

---

# 174. Scenario Question: Database Is Read-Only

Reads may work.

Writes fail.

The application must not pretend that:

```text
registration succeeded
password changed
```

when the write did not commit.

---

# 175. Scenario Question: Email Provider Returns 429

Interpret it as provider-side rate limiting.

The worker should:

- respect retry/backoff guidance
- avoid immediate repeated attempts
- monitor queue growth
- avoid overwhelming the provider

---

# 176. Scenario Question: Redis Is Slow, Not Down

This can be more dangerous than an immediate failure because requests may accumulate.

Use:

- Redis timeouts
- request deadlines
- bounded concurrency
- circuit breaking where appropriate

---

# 177. Scenario Question: Database CPU Is Low but Queries Are Slow

Check:

- locks
- I/O
- network
- connection waits
- query plan
- disk latency
- replica state

CPU alone does not describe database health.

---

# 178. Scenario Question: API CPU Is Low but Latency Is High

Likely causes include:

- database waits
- Redis waits
- network
- external providers
- connection pools
- lock contention

Use tracing to identify where request time is spent.

---

# 179. Scenario Question: Memory Grows During Login Spike

Possible cause:

```text
Too many concurrent Argon2 operations
```

Investigate:

- hash concurrency
- process memory
- worker limits
- garbage collection
- request queue

Scale and control concurrency rather than weakening password security.

---

# 180. Scenario Question: Users Report Random Logouts

Investigate:

- session expiration
- Redis/session-store failures
- cookie configuration
- deployment changes
- session-secret rotation
- clock skew
- load-balancer behavior

Compare affected and unaffected users.

---

# 181. Scenario Question: Only Safari Users Fail

Do not immediately change backend authentication.

Investigate:

- cookie behavior
- SameSite
- domain
- Secure
- browser privacy restrictions
- frontend origin

Use browser/network traces.

---

# 182. Scenario Question: Login Works in Postman but Not Browser

Likely areas:

- cookies
- CORS
- CSRF
- origin
- Secure flag
- browser cookie policy

Postman does not reproduce all browser security behavior.

---

# 183. Scenario Question: Login Works Locally but Not HTTPS Production

Check:

```text
Secure cookie
SameSite
Domain
Path
reverse proxy
TLS termination
trusted origins
```

A cookie that worked over local HTTP may behave differently under production HTTPS and domains.

---

# 184. Scenario Question: User Receives Two Reset Emails

Possible cause:

- duplicate user requests
- worker retry
- provider retry
- queue redelivery

The security property that matters is whether multiple emails create multiple valid reset credentials.

The reset-token lifecycle must remain safe.

---

# 185. Scenario Question: Reset Token Is Valid After Password Change

This indicates an invalid lifecycle design.

A password change/reset should invalidate appropriate outstanding reset tokens.

---

# 186. Scenario Question: User Deleted but Session Still Works

This is a serious correctness/security issue.

User deletion should invalidate or make unusable associated authentication state.

Possible controls:

- revoke sessions
- foreign keys
- authorization checks
- deletion transactions

---

# 187. Scenario Question: Role Removed but User Still Has Access

Potential causes:

- stale authorization cache
- replica lag
- long-lived token claims
- missing authorization check

Security-sensitive permission changes require an explicit consistency policy.

---

# 188. Scenario Question: How Would You Add Audit Logs?

Record security events with:

- event type
- timestamp
- user ID where available
- request ID
- source/context appropriate to the threat model
- outcome

Do not record raw credentials.

---

# 189. Scenario Question: How Would You Detect Credential Stuffing?

Look for patterns such as:

- unusually high login failures
- many accounts from a small set of sources
- repeated credentials across accounts where detection is privacy-safe
- unusual request velocity
- geographic/device anomalies where legitimately available

Use multiple signals.

---

# 190. Scenario Question: How Would You Protect Login Without Locking Out Users?

Use layered controls:

- IP/network rate limits
- account-aware rate limits
- progressive delays
- bot detection
- anomaly detection
- MFA challenges where appropriate

Avoid a simple permanent account lock triggered by a small number of failures because attackers can weaponize it.

---

# 191. Scenario Question: What Is the Most Important Security Boundary?

The public API boundary is critical because client input is untrusted.

Every value crossing it must be:

- validated
- normalized where appropriate
- authorized
- safely handled

---

# 192. Scenario Question: What Is the Most Important Data Boundary?

Credentials and authentication state.

Protect:

- password hashes
- session state
- reset tokens
- authorization data
- audit records

---

# 193. Scenario Question: What Is the Most Important Operational Boundary?

Shared dependencies.

A single database or Redis outage can affect many API instances.

Therefore dependency health and capacity must be monitored independently.

---

# 194. Scenario Question: What Would You Monitor First?

For an authentication service:

```text
Error rate
Latency
Login success/failure
Database health
Redis health
CPU/memory
Connection pools
Queue depth
Security anomalies
```

These provide a fast view of both reliability and abuse.

---

# 195. Scenario Question: What Would You Alert On?

Examples:

- elevated 5xx
- sustained high p99
- database connection exhaustion
- Redis failures
- queue backlog
- authentication failure anomalies
- password verification saturation
- certificate expiration
- backup failure

Alert thresholds should be based on service objectives and historical behavior.

---

# 196. Scenario Question: How Do You Avoid Alert Fatigue?

Alerts should represent actionable conditions.

Bad:

```text
CPU = 70%
```

Good:

```text
Authentication p99 exceeds service objective
for sustained period
and error rate is elevated
```

The exact threshold depends on the service.

---

# 197. Scenario Question: What Is a Good SLO?

There is no universal number.

An SLO should be:

- measurable
- meaningful to users
- achievable
- tied to business requirements

Example:

```text
99.9% of authentication requests
under the defined latency objective
during the measurement window.
```

---

# 198. Scenario Question: What Would You Load Test Before Launch?

At minimum:

- expected login peak
- registration peak
- session-validation traffic
- reset traffic
- mixed workload
- invalid credential traffic
- database behavior
- Redis behavior
- queue behavior
- failure recovery

---

# 199. Scenario Question: What Would You Chaos Test?

Examples:

```text
Kill API instance
Stop Redis
Add database latency
Fail database over
Stop workers
Slow email provider
Block network path
```

Only controlled environments should be used unless an organization has mature production chaos practices and explicit safeguards.

---

# 200. Scenario Question: How Do You Know Recovery Worked?

Check multiple layers:

```text
Edge
 |
API
 |
Database
 |
Redis
 |
Queue
 |
External providers
```

Then run functional smoke tests:

- login
- `/auth/me`
- logout
- password reset

Do not rely only on infrastructure health.

---

# 201. Scenario Question: What If Observability Is Down?

The core authentication path should not necessarily depend on the monitoring backend.

The service can continue if safe while emitting best-effort telemetry.

However, an extended observability outage should be treated as an operational risk because diagnosis becomes harder.

---

# 202. Scenario Question: What If Logging Is Down?

Avoid blocking authentication requests indefinitely while trying to write logs.

Use:

- bounded buffers
- local temporary handling where appropriate
- telemetry pipelines
- clear loss policies

Security-critical audit requirements may need stronger guarantees.

---

# 203. Scenario Question: What If the Database Is Slow?

Do not simply increase request timeouts.

Increasing timeouts can allow more requests to accumulate.

Investigate:

- query performance
- connections
- locks
- I/O
- traffic
- recent changes

---

# 204. Scenario Question: What If Redis Is Slow?

Similarly, do not allow requests to wait indefinitely.

Use bounded Redis timeouts and explicit fallback behavior.

---

# 205. Scenario Question: What If the Queue Is Full?

The system must define backpressure.

Possible options:

- reject non-critical work
- delay work
- prioritize critical jobs
- increase worker capacity
- rate-limit producers

Do not allow unlimited queue growth.

---

# 206. Scenario Question: What If Email Is Down for an Hour?

Authentication should ideally remain functional for operations that do not require immediate email delivery.

Password-reset delivery can remain queued if the product's recovery model permits it.

Monitor:

- queue age
- retries
- provider status

---

# 207. Scenario Question: How Do You Prevent Duplicate Security Events?

Use:

- unique event IDs
- idempotency keys
- transactional writes where appropriate
- deduplication

Do not assume distributed systems provide exactly-once execution automatically.

---

# 208. Scenario Question: How Do You Handle Concurrent Logins?

Each successful login can create a separate session.

If there are limits on concurrent sessions, enforce them transactionally.

Example:

```text
Find active sessions
   |
If limit exceeded
   |
Revoke oldest
   |
Create new session
```

Concurrency control is required to avoid races.

---

# 209. Scenario Question: How Do You Handle Concurrent Password Resets?

Use:

- one-time tokens
- expiration
- atomic consumption
- password update transaction
- session revocation policy

Only one reset token use should succeed.

---

# 210. Scenario Question: How Do You Handle Concurrent Role Changes?

Authorization state must have a consistency strategy.

If role changes are security-sensitive, avoid serving stale authorization state beyond the allowed policy.

---

# 211. Scenario Question: What If Two Users Register the Same Email Simultaneously?

The database `UNIQUE` constraint should enforce one winner.

The application catches the constraint violation and returns the API's defined conflict response.

---

# 212. Scenario Question: Why Not Rely on Application Validation?

Because concurrent requests can race.

Application validation improves user experience.

Database constraints enforce correctness.

Both are useful.

---

# 213. Scenario Question: How Do You Handle Account Deletion?

Within the defined policy:

1. authenticate the request
2. authorize deletion
3. revoke sessions
4. invalidate reset tokens
5. remove/anonymize related data
6. preserve required audit/security records
7. commit transactionally where appropriate

---

# 214. Scenario Question: What Happens to Audit Events After Deletion?

This depends on retention and legal requirements.

Security audit records may need to survive account deletion in an appropriately minimized/anonymized form.

Do not assume every record must be physically deleted immediately.

---

# 215. Scenario Question: How Would You Secure Admin APIs?

Use:

- strong authentication
- role/permission checks
- least privilege
- stricter rate limits
- audit logging
- session controls
- MFA where appropriate

---

# 216. Scenario Question: How Would You Protect Secrets?

Use:

- environment/configuration separation
- secret manager
- least privilege
- rotation
- access auditing
- no secrets in source control
- no secrets in logs

---

# 217. Scenario Question: What Happens If a Secret Leaks?

Treat it as compromised.

Typical response:

1. revoke/rotate secret
2. determine exposure
3. identify affected systems
4. preserve evidence
5. inspect access logs
6. restore secure configuration
7. document incident

---

# 218. Scenario Question: How Would You Secure the Database?

Controls include:

- private networking
- TLS
- least-privilege DB accounts
- strong credentials
- encryption at rest
- backups
- monitoring
- restricted administrative access

---

# 219. Scenario Question: How Would You Secure Redis?

Controls include:

- private networking
- authentication
- TLS where appropriate
- least privilege
- access restrictions
- memory limits
- monitoring
- secure key design

---

# 220. Scenario Question: How Would You Secure the Queue?

Use:

- authenticated producers/consumers
- authorization
- encrypted transport
- controlled payloads
- retention policies
- monitoring

Do not put secrets into job payloads unnecessarily.

---

# 221. Scenario Question: How Would You Protect Email Links?

Use:

- random high-entropy tokens
- short expiration
- one-time use
- HTTPS
- no token logging
- careful referrer behavior
- session/recovery policy

---

# 222. Scenario Question: What If a Reset Link Is Clicked Twice?

First use succeeds.

Second use should fail because the token is already consumed or expired.

---

# 223. Scenario Question: What If a Reset Token Expires During the Request?

The server should evaluate expiration as part of the authoritative token validation.

If expired, reject it.

Do not rely only on client-side timers.

---

# 224. Scenario Question: What If the Browser Deletes the Cookie?

The session may still exist server-side.

The user simply loses the browser's credential and must authenticate again unless another session mechanism exists.

---

# 225. Scenario Question: What If the Session Cookie Is Stolen?

The attacker may be able to authenticate until the session expires or is revoked.

Mitigations include:

- secure transport
- HttpOnly
- appropriate SameSite
- session expiration
- revocation
- reauthentication for sensitive actions

---

# 226. Scenario Question: Should Every Request Hit the Database?

Not necessarily.

A session store such as Redis can reduce database pressure.

However, caching must preserve security and consistency requirements.

---

# 227. Scenario Question: Can You Cache `/auth/me`?

Possibly, but carefully.

User/session state can change.

Caching must define:

- TTL
- invalidation
- stale-data tolerance
- authorization implications

For security-sensitive state, aggressive caching is risky.

---

# 228. Scenario Question: Why Is Session Revocation Hard With JWT?

A self-contained JWT can remain cryptographically valid until expiration unless the system adds revocation state, short lifetimes, or another mechanism.

Server-managed sessions naturally provide centralized revocation.

---

# 229. Scenario Question: Why Use Opaque Session Tokens?

They reveal little information to the client and keep authentication state server-controlled.

The server maps:

```text
opaque token
   |
session record
   |
user
```

---

# 230. Scenario Question: What Makes a Good Session Token?

It should be:

- unpredictable
- high entropy
- sufficiently long
- generated with a cryptographically secure random generator
- treated as a credential
- protected in transport/storage/logging

---

# 231. Scenario Question: What Makes a Good Reset Token?

Same principles:

- high entropy
- cryptographically random
- short-lived
- one-time
- stored safely
- not logged

---

# 232. Scenario Question: What Is Entropy?

Entropy describes the unpredictability of a value.

More unpredictable random values are harder for attackers to guess.

Use a cryptographically secure random source for session and reset credentials.

---

# 233. Scenario Question: Why Use `crypto.randomBytes`?

It provides cryptographically secure random bytes in Node.js.

These can be encoded into an opaque token.

Do not use predictable values such as:

```text
Math.random()
timestamp
user ID
```

for security credentials.

---

# 234. Scenario Question: Why Hash Tokens With SHA-256?

A random session/reset token already has high entropy.

A fast cryptographic hash such as SHA-256 can be appropriate for storing a derived token representation because the goal is different from password hashing.

Do not confuse token hashing with password hashing.

---

# 235. Scenario Question: Why Not Use Argon2 for Session Tokens?

It is generally unnecessary for high-entropy random tokens.

The security model differs:

```text
Password:
low-entropy human-chosen secret
```

versus:

```text
Session token:
high-entropy random secret
```

---

# 236. Scenario Question: What Is Defense in Depth?

Using multiple independent controls.

Example:

```text
HTTPS
+
Secure cookie
+
HttpOnly
+
SameSite
+
CSRF protection
+
rate limiting
+
session expiration
+
revocation
+
audit logs
```

No single control is expected to stop every attack.

---

# 237. Scenario Question: What Is Least Privilege?

Give each user/service only the permissions required.

This limits damage if a credential or component is compromised.

---

# 238. Scenario Question: What Is Fail Closed?

When a security decision cannot be safely validated, reject access rather than grant it.

Example:

```text
Cannot validate session
      |
Reject authenticated request
```

---

# 239. Scenario Question: When Can Fail Open Be Acceptable?

Only when the operation is non-security-critical and the business risk is understood.

For example, an optional analytics service can fail open.

Authentication and authorization should be much stricter.

---

# 240. Scenario Question: What Is a Blast Radius?

The amount of the system affected by one failure or compromise.

Good architecture tries to limit blast radius through:

- isolation
- least privilege
- separate workloads
- redundancy
- bounded resources

---

# 241. Scenario Question: What Is a Bulkhead?

A bulkhead isolates resource pools so one workload cannot consume all resources.

Example:

```text
API resources
+
Worker resources
```

rather than allowing background jobs to consume the entire API capacity.

---

# 242. Scenario Question: What Is a Circuit Breaker?

A mechanism that stops repeatedly calling a failing dependency for a period.

States commonly include:

```text
Closed
Open
Half-open
```

It can prevent cascading failure for some dependency patterns.

---

# 243. Scenario Question: What Is Backpressure?

Backpressure prevents producers from overwhelming consumers.

Example:

```text
API
 |
Queue
 |
Workers
```

If workers cannot keep up, the producer may need to limit or reject new work.

---

# 244. Scenario Question: What Is Graceful Degradation?

Continuing critical functionality while temporarily reducing non-critical functionality.

Example:

```text
Analytics disabled
Authentication remains available
```

---

# 245. Scenario Question: What Is a SLO?

Service Level Objective.

A measurable reliability/performance target.

It should represent what users need, not simply an arbitrary infrastructure number.

---

# 246. Scenario Question: What Is an Error Budget?

The amount of unreliability allowed by the SLO.

It helps teams balance:

- feature velocity
- reliability work
- operational risk

---

# 247. Scenario Question: What Is RTO?

Recovery Time Objective.

How quickly a service should recover after a disruptive failure.

---

# 248. Scenario Question: What Is RPO?

Recovery Point Objective.

How much data loss can be tolerated after a failure.

---

# 249. Scenario Question: Why Test Recovery?

Because a theoretical runbook is not evidence that recovery works.

Recovery tests reveal:

- missing credentials
- outdated documentation
- broken backups
- hidden dependencies
- incorrect assumptions

---

# 250. Final Interview Checklist

Before presenting this project, be able to explain:

## Fundamentals

- [ ] Authentication
- [ ] Authorization
- [ ] Sessions
- [ ] Cookies
- [ ] Password hashing
- [ ] Argon2id

## Security

- [ ] CSRF
- [ ] CORS
- [ ] XSS
- [ ] Session fixation
- [ ] Session hijacking
- [ ] IDOR
- [ ] Rate limiting
- [ ] Account enumeration
- [ ] Reset-token security

## Data

- [ ] Users
- [ ] Sessions
- [ ] Reset tokens
- [ ] Roles
- [ ] Audit events
- [ ] Indexes
- [ ] Constraints
- [ ] Transactions

## API

- [ ] Endpoints
- [ ] Status codes
- [ ] Error envelopes
- [ ] Request IDs
- [ ] Validation
- [ ] Versioning

## Operations

- [ ] Logging
- [ ] Metrics
- [ ] Tracing
- [ ] Health checks
- [ ] Readiness
- [ ] Alerts

## Scaling

- [ ] Stateless API
- [ ] Load balancing
- [ ] Redis
- [ ] PostgreSQL
- [ ] Connection pooling
- [ ] Read replicas
- [ ] Queues
- [ ] Workers
- [ ] Capacity planning

## Reliability

- [ ] API failure
- [ ] Database failure
- [ ] Redis failure
- [ ] Queue failure
- [ ] Email failure
- [ ] Deployment failure
- [ ] Migration failure
- [ ] Disaster recovery

## Implementation

- [ ] TypeScript
- [ ] Express
- [ ] Zod
- [ ] Argon2
- [ ] Cookie handling
- [ ] Middleware
- [ ] Tests

## Honesty

- [ ] Know current implementation limitations
- [ ] Do not claim unimplemented production features
- [ ] Explain future production evolution

---

# 251. 30-Second Project Answer

> I built a reusable authentication reference architecture rather than just a login demo. The design uses server-managed sessions, secure cookies, Argon2id password hashing, PostgreSQL for durable state, Redis for scalable ephemeral state, distributed rate limiting, asynchronous email, and structured observability. I documented the complete engineering lifecycle including requirements, API contracts, security, testing, deployment, scaling, and failure recovery, and I implemented a runnable TypeScript/Express reference version to demonstrate the core flow.

---

# 252. 60-Second Project Answer

> The project is a production-oriented authentication reference system designed around server-managed sessions. A browser receives an opaque HttpOnly secure cookie, while the server keeps the session state, allowing explicit revocation and horizontal scaling through shared storage. PostgreSQL is the durable source of truth for users and security data, while Redis can handle sessions, rate limits, and other ephemeral workloads. The system covers registration, login, logout, current-user lookup, password change, and password reset, with Argon2id hashing, validation, CSRF/CORS considerations, audit events, observability, testing, deployment, scaling, and failure handling. The repository implementation is intentionally a reference skeleton using in-memory state, and the documentation explicitly describes the production evolution needed for PostgreSQL, Redis, asynchronous email, distributed rate limiting, high availability, and operational controls.

---

# 253. 2-Minute System Design Answer

> I would start by clarifying the requirements: registration, login, logout, session validation, password reset, secure password storage, revocation, abuse protection, and an availability target.
>
> I would use a stateless API layer behind a load balancer. The browser would authenticate with an opaque server-managed session cookie. The API would validate that session against shared session storage. PostgreSQL would hold durable user, credential, role, reset-token, and audit data. Redis could handle high-volume ephemeral state such as sessions and rate limits.
>
> Passwords would be hashed with Argon2id. Inputs would be validated at the API boundary. Cookies would use appropriate Secure, HttpOnly, and SameSite settings. State-changing cookie-authenticated requests would use an appropriate CSRF strategy. Authentication endpoints would be rate-limited to reduce brute force and credential-stuffing risk.
>
> Password-reset email would be asynchronous through a queue and worker system so provider latency does not block the API. Observability would include structured logs, metrics, traces, request IDs, and authentication-specific signals.
>
> For scaling, I would first optimize PostgreSQL queries and connection pools, then scale the stateless API horizontally. Read replicas could be added where consistency allows. I would introduce partitioning or sharding only if measured workload requires it.
>
> For reliability, I would define explicit failure behavior for PostgreSQL, Redis, queues, workers, and email providers, use bounded timeouts and retries, and test recovery. For a larger deployment, I would consider multi-zone and eventually multi-region architecture based on RTO, RPO, latency, and consistency requirements.

---

# 254. Final Principle

The strongest answer in an authentication interview is rarely:

> "I know the technology."

It is:

> "I understand the requirement, I can explain the design, I know its trade-offs, I know how it fails, I know how it scales, and I know exactly what remains to make the reference implementation production-ready."

That is the standard this scenario is designed to demonstrate.
