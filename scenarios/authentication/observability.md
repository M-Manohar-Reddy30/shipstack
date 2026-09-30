# Authentication Observability

## 1. Purpose

Observability makes the authentication system understandable while it is running.

The goal is not to collect every possible piece of data. The goal is to answer, quickly and safely:

- Is authentication working?
- Are users experiencing failures?
- Which endpoint is failing?
- Is the failure caused by the application, database, cache, email provider, or network?
- Are authentication attacks increasing?
- Which requests and security events are related?
- What changed before the problem started?
- Can an engineer investigate without exposing credentials or personal data?

This document defines an observability model for the authentication scenario.

The reference architecture uses:

```text
Browser
   |
   v
Next.js / Web App
   |
   v
Node.js API
   |
   +---- Auth Service
   |
   +---- PostgreSQL
   |
   +---- Redis
   |
   +---- Email Provider
   |
   +---- Observability Platform
```

The observability layer should provide three complementary signals:

```text
Logs    -> detailed event context
Metrics -> system behavior over time
Traces  -> request/dependency path
```

Security and audit events provide an additional layer:

```text
Audit Events -> durable record of important security actions
```

These signals should be correlated through request IDs, trace IDs, user/session references that are safe to expose, and timestamps.

---

# 2. Observability Goals

The authentication platform should make the following questions answerable.

## 2.1 Availability

Can users:

- register?
- log in?
- log out?
- retrieve their current session?
- request password reset?
- complete password reset?
- change their password?

## 2.2 Performance

Can we determine:

- request latency?
- database latency?
- Redis latency?
- password hashing duration?
- email-provider latency?
- slow endpoints?
- latency percentiles such as p50, p95, and p99?

## 2.3 Reliability

Can we detect:

- elevated 4xx responses?
- elevated 5xx responses?
- dependency failures?
- timeouts?
- connection-pool exhaustion?
- application crashes?
- readiness failures?

## 2.4 Security

Can we identify:

- credential stuffing?
- repeated failed logins?
- password-reset abuse?
- suspicious session activity?
- authorization failures?
- unusual geographic or network patterns when such telemetry is legally and operationally appropriate?
- spikes in rate-limited requests?

## 2.5 Debuggability

Can an engineer move from:

```text
Alert
  -> Metric
  -> Request
  -> Trace
  -> Log
  -> Audit event
```

without manually guessing which event belongs to which request?

---

# 3. Observability Principles

## 3.1 Never log secrets

Never log:

- passwords
- password hashes
- session tokens
- reset tokens
- authorization headers
- cookie values
- API keys
- database passwords
- encryption keys
- OAuth client secrets
- refresh tokens
- raw authentication credentials

Bad:

```json
{
  "password": "SuperSecret123"
}
```

Bad:

```json
{
  "cookie": "session=abc123..."
}
```

Good:

```json
{
  "event": "auth.login.failed",
  "reason": "invalid_credentials"
}
```

---

## 3.2 Structured logs over plain text

Prefer:

```json
{
  "timestamp": "2026-09-30T10:20:30.000Z",
  "level": "info",
  "service": "auth-api",
  "event": "auth.login.success",
  "request_id": "req_123",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736"
}
```

over:

```text
user login worked
```

Structured logs can be searched, aggregated, filtered, and correlated.

---

## 3.3 Keep cardinality under control

Metrics labels should not contain arbitrary user-controlled values.

Avoid:

```text
http_requests_total{email="user@example.com"}
```

Avoid:

```text
http_requests_total{user_id="123456"}
```

Prefer:

```text
http_requests_total{
  route="/api/v1/auth/login",
  method="POST",
  status="200"
}
```

High-cardinality identifiers belong in logs or traces when required, not metric labels.

---

## 3.4 Logs are not the database

Logs should not be treated as the source of truth for security records.

Important security actions should also create durable audit events where required.

For example:

```text
Login successful
    |
    +--> operational log
    |
    +--> authentication metric
    |
    +--> optional trace span
    |
    +--> audit event
```

---

## 3.5 Collect only useful data

Observability should follow data minimization.

Every field should have a reason to exist.

Questions to ask:

1. Does this field help operate the system?
2. Does it help investigate an incident?
3. Is it safe to retain?
4. Is the retention period justified?
5. Can the same purpose be achieved with less sensitive data?

---

# 4. Observability Signal Model

The platform uses four major signal categories.

| Signal | Primary purpose |
|---|---|
| Logs | Detailed event context |
| Metrics | Aggregation and trends |
| Traces | Request/dependency flow |
| Audit events | Durable security/business history |

Example:

```text
POST /auth/login
       |
       +--> Metric: request latency
       |
       +--> Trace: HTTP -> auth service -> PostgreSQL
       |
       +--> Log: login attempt result
       |
       +--> Audit: successful login
```

---

# 5. Request IDs

Every incoming request should have a request ID.

The implementation uses:

```text
X-Request-Id
```

If a trusted upstream supplies a valid request ID, the application can propagate it according to deployment policy.

Otherwise the API should generate one.

Example:

```text
req_01HXYZ...
```

The request ID should appear in:

- response headers
- application logs
- relevant trace attributes
- error responses where appropriate
- internal service calls
- support/debugging context

Example:

```http
X-Request-Id: req_01HXYZ123
```

---

# 6. Request ID Security

Request IDs are correlation identifiers, not authentication credentials.

They must not be used as:

- session tokens
- authorization tokens
- reset tokens
- secrets

If client-provided IDs are accepted, validate:

- length
- character set
- maximum size

Do not allow arbitrary huge strings into logs.

Recommended conceptual format:

```text
req_<safe-random-id>
```

---

# 7. Trace IDs

Distributed tracing should use a trace ID when the application is integrated with an OpenTelemetry-compatible system.

Example:

```text
trace_id:
4bf92f3577b34da6a3ce929d0e0e4736
```

A request can then be represented as:

```text
Trace
 |
 +-- HTTP request
 |
 +-- Authentication service
 |    |
 |    +-- password verification
 |    |
 |    +-- database lookup
 |
 +-- session persistence
 |
 +-- response
```

The request ID and trace ID have different purposes:

```text
Request ID -> application/request correlation
Trace ID   -> distributed execution correlation
```

They can coexist.

---

# 8. Logging Strategy

## 8.1 Recommended log levels

### ERROR

Use for:

- unexpected application failures
- dependency failures
- corrupted state
- unhandled exceptions
- failed critical infrastructure operations

### WARN

Use for:

- suspicious but handled behavior
- repeated authentication failures
- rate-limit events
- dependency degradation
- configuration problems
- approaching resource limits

### INFO

Use for:

- important lifecycle events
- authentication outcomes
- service startup
- service shutdown
- successful dependency initialization
- security events that are operationally useful

### DEBUG

Use for:

- development diagnostics
- controlled troubleshooting
- non-sensitive execution details

DEBUG should generally be disabled or heavily restricted in production.

### TRACE

Only use when the logging platform and application justify extremely detailed diagnostic data.

Never use TRACE as an excuse to log secrets.

---

# 9. Structured Log Schema

A common log schema should contain fields such as:

```json
{
  "timestamp": "2026-09-30T10:20:30.000Z",
  "level": "info",
  "service": "auth-api",
  "environment": "production",
  "version": "1.4.0",
  "event": "auth.login.success",
  "request_id": "req_123",
  "trace_id": "trace_123",
  "method": "POST",
  "route": "/api/v1/auth/login",
  "status_code": 200,
  "duration_ms": 84
}
```

Optional safe context:

```json
{
  "actor_type": "user",
  "user_id_hash": "..."
}
```

A user identifier should only be included when there is a legitimate operational need and the chosen representation is consistent with privacy requirements.

---

# 10. Required Log Fields

At minimum, production application logs should make it possible to determine:

```text
timestamp
level
service
environment
event
request_id
route
method
status_code
duration_ms
```

For failures, add:

```text
error_code
dependency
retryable
```

when applicable.

---

# 11. Error Logging

Errors should be represented using stable error codes.

Example:

```json
{
  "event": "request.failed",
  "error_code": "AUTH_INVALID_CREDENTIALS",
  "status_code": 401
}
```

Do not expose internal stack traces to clients.

The server-side log may contain:

```json
{
  "error_code": "AUTH_DATABASE_FAILURE",
  "exception_type": "DatabaseTimeoutError",
  "dependency": "postgresql"
}
```

The client should receive a safe response such as:

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred."
  }
}
```

---

# 12. Authentication Events

Authentication events should use stable names.

Recommended event names:

```text
auth.register.success
auth.register.failure

auth.login.success
auth.login.failure

auth.logout.success
auth.logout.failure

auth.session.created
auth.session.revoked
auth.session.expired

auth.password.reset.requested
auth.password.reset.completed
auth.password.reset.failed

auth.password.change.success
auth.password.change.failure

auth.authorization.denied

auth.rate_limit.triggered
```

Event naming should remain stable so dashboards and alerts do not break when internal code changes.

---

# 13. Login Success Event

Example:

```json
{
  "event": "auth.login.success",
  "request_id": "req_123",
  "route": "/api/v1/auth/login",
  "duration_ms": 92,
  "auth_method": "password",
  "result": "success"
}
```

Do not log:

```text
password
password_hash
session_token
cookie
authorization_header
```

---

# 14. Login Failure Event

Example:

```json
{
  "event": "auth.login.failure",
  "request_id": "req_124",
  "reason": "invalid_credentials",
  "result": "failure"
}
```

Avoid storing the submitted email address in plaintext unless the operational and privacy requirements explicitly justify it.

For security analytics, a carefully controlled pseudonymous identifier may be used where appropriate.

---

# 15. Registration Events

Success:

```json
{
  "event": "auth.register.success",
  "request_id": "req_125"
}
```

Failure:

```json
{
  "event": "auth.register.failure",
  "request_id": "req_126",
  "reason": "validation_failed"
}
```

Possible failure reasons:

```text
validation_failed
duplicate_account
dependency_failure
rate_limited
unknown
```

Do not turn event reasons into a user-enumeration mechanism.

---

# 16. Logout Events

Successful logout:

```json
{
  "event": "auth.logout.success",
  "request_id": "req_127"
}
```

Session revocation:

```json
{
  "event": "auth.session.revoked",
  "request_id": "req_127",
  "reason": "user_logout"
}
```

The session token itself must never be logged.

---

# 17. Password Reset Observability

Password reset flows need special care because they are security-sensitive.

Recommended events:

```text
auth.password.reset.requested
auth.password.reset.completed
auth.password.reset.failed
```

The request event should not reveal whether an account exists.

Example:

```json
{
  "event": "auth.password.reset.requested",
  "result": "accepted"
}
```

Internally, the system can track operational outcomes without exposing account enumeration through the public response.

Never log the reset token.

---

# 18. Session Observability

Track:

- sessions created
- sessions revoked
- sessions expired
- sessions rejected
- invalid session attempts
- session-store failures

Example:

```json
{
  "event": "auth.session.rejected",
  "reason": "expired"
}
```

Useful session metrics:

```text
auth_sessions_created_total
auth_sessions_revoked_total
auth_sessions_rejected_total
```

---

# 19. Authorization Observability

Authentication answers:

```text
Who are you?
```

Authorization answers:

```text
Are you allowed to do this?
```

Track denied authorization decisions.

Example:

```json
{
  "event": "auth.authorization.denied",
  "resource": "admin_dashboard",
  "action": "read",
  "reason": "insufficient_role"
}
```

Do not log confidential resource contents.

---

# 20. Metrics

Metrics should answer system-level questions quickly.

The core categories are:

```text
traffic
latency
errors
authentication outcomes
security activity
dependency health
resource health
```

---

# 21. HTTP Metrics

Recommended metrics:

```text
http_requests_total
http_request_duration_seconds
http_requests_in_flight
http_response_size_bytes
```

Useful labels:

```text
method
route
status_code
```

Avoid:

```text
email
user_id
session_id
request_id
IP address
```

as metric labels.

---

# 22. Authentication Metrics

Recommended:

```text
auth_login_attempts_total
auth_login_success_total
auth_login_failure_total

auth_registration_attempts_total
auth_registration_success_total
auth_registration_failure_total

auth_logout_total

auth_password_reset_requests_total
auth_password_reset_success_total
auth_password_reset_failure_total

auth_password_change_total

auth_sessions_created_total
auth_sessions_revoked_total
auth_sessions_expired_total
```

These metrics should be categorized by controlled dimensions such as:

```text
result
reason
route
environment
```

Only use a small bounded set of label values.

---

# 23. Security Metrics

Useful security metrics include:

```text
auth_rate_limit_triggered_total
auth_authorization_denied_total
auth_invalid_session_total
auth_suspicious_activity_total
```

The exact definition of "suspicious activity" should be deterministic and documented.

Avoid creating a vague metric that depends entirely on human interpretation.

---

# 24. Dependency Metrics

Track:

```text
postgresql_request_duration_seconds
postgresql_errors_total

redis_request_duration_seconds
redis_errors_total

email_provider_request_duration_seconds
email_provider_errors_total
```

Also track:

```text
connection_pool_usage
connection_pool_wait_time
connection_pool_exhaustion
```

when supported by the client library.

---

# 25. Password Hashing Metrics

Password hashing is intentionally expensive.

Monitor:

```text
password_hash_duration_seconds
password_verify_duration_seconds
```

The purpose is to detect:

- accidental configuration changes
- CPU exhaustion
- unexpected latency
- resource starvation

Do not log the password or password hash.

---

# 26. Metric Cardinality

Bad:

```text
auth_login_failure_total{
  email="..."
}
```

Bad:

```text
auth_login_failure_total{
  ip="..."
}
```

Good:

```text
auth_login_failure_total{
  reason="invalid_credentials"
}
```

Good:

```text
http_requests_total{
  route="/api/v1/auth/login",
  status_code="401"
}
```

---

# 27. RED Method

For request-driven services, use the RED method:

```text
Rate
Errors
Duration
```

### Rate

How many requests are arriving?

```text
requests / second
```

### Errors

How many requests are failing?

```text
5xx / total requests
```

### Duration

How long do requests take?

Use:

```text
p50
p95
p99
```

rather than only averages.

---

# 28. USE Method

For infrastructure resources, the USE method is useful:

```text
Utilization
Saturation
Errors
```

Examples:

```text
CPU utilization
memory utilization
connection pool utilization
database saturation
Redis saturation
network errors
```

---

# 29. Distributed Tracing

Distributed tracing should show how a request moves through the system.

Example:

```text
POST /api/v1/auth/login
|
+-- middleware
|
+-- auth controller
|
+-- auth service
|    |
|    +-- PostgreSQL: find user
|    |
|    +-- Argon2: verify password
|    |
|    +-- PostgreSQL/Redis: create session
|
+-- response
```

A trace makes dependency latency visible.

---

# 30. Trace Span Naming

Use stable names.

Examples:

```text
HTTP POST /api/v1/auth/login
auth.login
db.users.find
db.sessions.create
redis.session.get
redis.session.set
email.password_reset.send
```

Avoid putting arbitrary user values in span names.

Bad:

```text
login:user@example.com
```

Good:

```text
auth.login
```

---

# 31. Trace Attributes

Useful bounded attributes:

```text
http.request.method
http.route
http.response.status_code
service.name
service.version
deployment.environment
auth.result
auth.failure_reason
```

Sensitive attributes should be excluded or redacted.

Never attach:

```text
password
session_token
reset_token
cookie
authorization_header
```

---

# 32. Trace Sampling

Not every request must necessarily be retained forever.

Possible strategy:

```text
Normal traffic -> sampled
Errors         -> retained at higher rate
Slow requests  -> retained at higher rate
Security events -> retained according to policy
```

Sampling rules should never cause important security events to disappear from required audit records.

Audit storage and trace storage have different purposes.

---

# 33. Health Checks

The service should expose a lightweight liveness check.

Example:

```http
GET /health
```

Expected response:

```json
{
  "data": {
    "status": "ok"
  }
}
```

The current reference implementation includes this endpoint.

Liveness should answer:

```text
Is the process alive?
```

It should not require every external dependency to be healthy.

---

# 34. Readiness Checks

Readiness answers:

```text
Should this instance receive traffic?
```

A production readiness endpoint can verify critical dependencies such as:

```text
PostgreSQL
Redis
required configuration
```

Example:

```json
{
  "status": "ready",
  "dependencies": {
    "postgresql": "ok",
    "redis": "ok"
  }
}
```

Do not expose internal infrastructure details publicly.

A private/internal readiness endpoint is preferred.

---

# 35. Health Check Design

Avoid making health checks so expensive that they become a source of load.

Bad:

```text
Every health request:
  -> expensive database query
  -> Redis operation
  -> email provider request
```

Better:

```text
Liveness:
  process only

Readiness:
  critical local/dependency checks

Deep diagnostics:
  authenticated/internal only
```

---

# 36. Dashboards

At minimum, create these dashboards.

## Dashboard 1: Authentication Overview

Panels:

```text
Request rate
Error rate
p50 latency
p95 latency
p99 latency
Login success rate
Login failure rate
Registration rate
Password reset requests
Rate-limit events
```

---

## Dashboard 2: Dependency Health

Panels:

```text
PostgreSQL latency
PostgreSQL errors
PostgreSQL connection pool
Redis latency
Redis errors
Redis connection health
Email provider latency
Email provider errors
```

---

## Dashboard 3: Security

Panels:

```text
Failed login rate
Rate-limit events
Authorization denials
Invalid session attempts
Password reset activity
Suspicious authentication activity
```

Access to security dashboards should be restricted.

---

## Dashboard 4: Infrastructure

Panels:

```text
CPU
memory
network
container restarts
event-loop latency
connection pools
request concurrency
```

---

# 37. SLOs and SLIs

An SLI is the measured indicator.

An SLO is the target.

Example:

```text
SLI:
Successful authentication requests / eligible authentication requests
```

Illustrative SLO:

```text
99.9% successful authentication API availability
```

This is an example target, not a universal requirement.

The correct SLO depends on:

- product requirements
- traffic
- infrastructure
- dependency guarantees
- business impact

---

# 38. Authentication SLI Examples

Possible SLIs:

```text
API availability
login success excluding invalid credentials
request latency
database availability
session-store availability
password-reset delivery success
```

For login, separate user mistakes from system failures.

For example:

```text
401 invalid credentials
```

should not automatically count as an application outage.

Whereas:

```text
500 database timeout
```

is an operational failure.

---

# 39. Latency Targets

Latency objectives should use percentiles.

Example:

```text
p50 < 150 ms
p95 < 500 ms
p99 < 1000 ms
```

These are illustrative.

Password hashing may intentionally contribute significant CPU time, so targets should be validated against the chosen Argon2 configuration and production hardware.

---

# 40. Alerting Philosophy

Alerts should require action.

Do not alert on every small error.

A useful alert answers:

```text
What is wrong?
How serious is it?
Who should act?
What should they inspect?
```

---

# 41. Critical Alerts

Possible critical conditions:

```text
authentication API unavailable
database unavailable
session store unavailable
large sustained 5xx spike
multiple production instances unhealthy
```

Example conceptual alert:

```text
IF authentication API 5xx rate > 5%
FOR 5 minutes
THEN page the on-call engineer
```

Thresholds are illustrative and should be tuned from real traffic.

---

# 42. Warning Alerts

Possible warnings:

```text
p95 latency elevated
login failures increasing
rate-limit events increasing
database connection pool nearing saturation
Redis latency increasing
email provider errors increasing
```

Warnings should generally not page immediately unless the service impact justifies it.

---

# 43. Security Alert Examples

Potential alerts:

```text
sustained login failure spike
sustained rate-limit spike
unusual password-reset request volume
large authorization-denial increase
unexpected session-revocation spike
```

A security alert should be based on documented detection logic.

Avoid simplistic assumptions such as:

```text
one failed login = attack
```

Authentication failures can happen for normal user reasons.

---

# 44. Alert Correlation

Suppose users report:

```text
"Login is slow."
```

The investigation path should be:

```text
Alert
  |
  v
Login p95 latency
  |
  v
HTTP trace
  |
  v
Auth service span
  |
  +--> PostgreSQL slow
  |
  +--> Argon2 normal
  |
  +--> Redis normal
```

This quickly narrows the failure domain.

---

# 45. Production Debugging Workflow

When authentication fails:

## Step 1 — Check availability

```text
Is the service healthy?
```

## Step 2 — Check error rate

```text
Did 5xx responses increase?
```

## Step 3 — Check latency

```text
Did p95/p99 increase?
```

## Step 4 — Check dependencies

```text
PostgreSQL?
Redis?
Email provider?
```

## Step 5 — Inspect traces

Find a representative failed request.

## Step 6 — Inspect structured logs

Search by:

```text
request_id
trace_id
error_code
event
```

## Step 7 — Check recent changes

Review:

```text
deployments
configuration
database migrations
dependency updates
infrastructure changes
```

## Step 8 — Check security signals

Look for:

```text
rate-limit spikes
login failure spikes
authorization-denial spikes
session anomalies
```

---

# 46. Debugging by Request ID

A support engineer may receive:

```text
Request ID: req_123
```

The engineer should be able to search:

```text
request_id="req_123"
```

and find:

```text
HTTP log
auth service log
database-related log
error event
trace
```

The request ID should not itself grant access to anything.

---

# 47. Debugging a 500 Error

Example flow:

```text
Client
  |
  | 500
  v
API
  |
  +-- request log
  |
  +-- trace
  |
  +-- auth service
        |
        +-- PostgreSQL timeout
```

Expected diagnostic log:

```json
{
  "level": "error",
  "event": "dependency.failure",
  "dependency": "postgresql",
  "error_code": "DB_TIMEOUT",
  "request_id": "req_123"
}
```

Do not return:

```text
PostgreSQL connection string...
```

to the client.

---

# 48. Debugging Login Failures

Separate:

```text
expected user failure
```

from:

```text
system failure
```

Expected:

```text
401 invalid credentials
```

System failure:

```text
500 database timeout
503 dependency unavailable
```

This distinction prevents misleading availability metrics.

---

# 49. Debugging Password Reset

Possible chain:

```text
reset request
  |
  +-- database
  |
  +-- token generation
  |
  +-- email provider
```

If users do not receive email:

```text
check request metric
      |
      v
check reset event
      |
      v
check email trace
      |
      v
check provider error metric
```

Never search logs by the raw reset token.

---

# 50. Debugging Session Problems

For:

```text
401 after successful login
```

inspect:

```text
session creation
cookie configuration
session lookup
session expiration
session revocation
session store health
```

Common failure categories:

```text
cookie not stored
cookie not sent
session missing
session expired
session revoked
session store unavailable
```

Do not log the cookie value.

---

# 51. Sensitive Data Redaction

Implement redaction at the logging boundary.

Potential fields to redact:

```text
password
password_confirmation
password_hash
token
access_token
refresh_token
session_token
reset_token
authorization
cookie
set-cookie
client_secret
api_key
```

Example transformation:

```json
{
  "authorization": "[REDACTED]",
  "cookie": "[REDACTED]"
}
```

Prefer dropping sensitive fields entirely when they are not needed.

---

# 52. Email and PII

Email addresses are personal data in many jurisdictions.

Do not automatically put email addresses into every log.

Possible strategies:

```text
omit
```

or, where justified:

```text
pseudonymize
```

or:

```text
partial redaction
```

Example:

```text
m********@example.com
```

The appropriate strategy depends on:

- legal requirements
- support requirements
- incident-response requirements
- data-retention policy

---

# 53. IP Address Handling

IP addresses can be useful for:

- abuse detection
- rate limiting
- incident investigation

But they may also be personal data.

Define:

```text
collection purpose
retention period
access controls
redaction/pseudonymization policy
```

Do not place IP addresses into high-cardinality metrics.

---

# 54. Log Retention

Retention should be based on purpose.

Example conceptual policy:

```text
debug logs     -> short retention
application logs -> operational retention
security logs  -> policy-defined retention
audit events   -> compliance/business-defined retention
```

The exact durations must be determined by the organization's:

- legal obligations
- privacy requirements
- incident-response needs
- storage budget

Never assume that "longer retention" is automatically better.

---

# 55. Access Control

Observability systems can contain sensitive operational information.

Restrict access to:

```text
logs
traces
security dashboards
audit events
production metrics
```

Use:

```text
least privilege
role-based access
strong authentication
audit logging
```

Production observability access should not be shared through common credentials.

---

# 56. Audit Events vs Logs

Operational log:

```text
auth.login.success
```

Audit event:

```text
actor=user
action=login
result=success
timestamp=...
```

Logs are optimized for debugging.

Audit events are optimized for durable security/accountability requirements.

They should not be treated as interchangeable.

---

# 57. Audit Event Example

Conceptual event:

```json
{
  "event_type": "USER_LOGIN",
  "actor_id": "user_123",
  "result": "success",
  "timestamp": "2026-09-30T10:20:30.000Z",
  "request_id": "req_123"
}
```

Only include identifiers that are appropriate for the audit model.

---

# 58. Deployment Metadata

Every production signal should be attributable to a deployment version.

Useful fields:

```text
service.name
service.version
deployment.environment
deployment.id
git.commit
instance.id
region
```

Avoid exposing internal infrastructure metadata to unauthenticated users.

This makes rollback investigation much easier.

---

# 59. Version Correlation

Suppose failures started after:

```text
deployment_id=deploy_204
```

Metrics should allow comparison:

```text
before deploy_204
vs
after deploy_204
```

This helps determine whether a deployment correlates with the incident.

Correlation is evidence for investigation, not automatically proof of causation.

---

# 60. Container and Process Metrics

For containerized deployments, monitor:

```text
CPU
memory
restart count
container health
network
file descriptors
open connections
event-loop lag
```

Node.js-specific operational signals may include:

```text
event-loop delay
heap usage
GC behavior
active handles
```

Use platform-supported metrics where possible.

---

# 61. Database Observability

PostgreSQL should be monitored for:

```text
query latency
error rate
connection count
connection pool utilization
lock contention
transaction duration
deadlocks
disk usage
replication health
```

Authentication-specific database operations include:

```text
user lookup
session lookup
session creation
session revocation
password reset lookup
audit event insertion
```

Do not log complete SQL statements if they can contain sensitive values.

Prefer parameterized queries and safe query identifiers.

---

# 62. Redis Observability

Monitor:

```text
latency
errors
memory
evictions
connection count
timeouts
availability
```

If Redis stores sessions or rate-limit state, a Redis outage may directly affect authentication availability.

The system should define whether Redis failure means:

```text
fail closed
fail open
degrade functionality
```

Security-sensitive authentication systems generally need explicit failure semantics rather than accidental behavior.

---

# 63. Email Provider Observability

Monitor:

```text
send attempts
successes
failures
latency
timeouts
provider response categories
```

Useful metric:

```text
password_reset_email_delivery_attempts_total
```

Do not log:

```text
reset URL
reset token
full email body
```

unless a controlled debugging process explicitly requires safe test data.

---

# 64. Rate Limiting Observability

Rate limiting should expose:

```text
rate-limit decisions
allowed requests
blocked requests
endpoint
reason
```

Example:

```json
{
  "event": "auth.rate_limit.triggered",
  "route": "/api/v1/auth/login",
  "reason": "too_many_attempts"
}
```

Avoid logging raw credentials or sensitive request bodies.

---

# 65. Detecting Credential Stuffing

Useful signals:

```text
large increase in login failures
large increase in rate-limit events
many failed attempts across accounts
many attempts from a small set of sources
unusual request distribution
```

No single signal proves credential stuffing.

Detection should combine documented signals.

---

# 66. Detecting Password Reset Abuse

Monitor:

```text
reset request volume
reset request rate per controlled identifier
provider delivery volume
failed reset confirmations
rate-limit events
```

Avoid exposing whether a particular account exists.

---

# 67. Detecting Session Abuse

Possible signals:

```text
unusual session creation volume
rapid session creation/revocation
invalid session spikes
unexpected session-store failures
```

The system should document which signals are considered security-relevant.

---

# 68. Logging Authentication Timing

Authentication timing can be security-sensitive.

Avoid creating detailed logs that reveal:

```text
whether a particular account exists
exact password comparison timing
secret-dependent execution details
```

Use aggregated metrics for timing analysis where possible.

---

# 69. Error Budget

If an SLO is:

```text
99.9% successful availability
```

then the allowed error budget is approximately:

```text
0.1%
```

The team can use this budget to decide how aggressively to prioritize:

```text
reliability work
feature delivery
performance work
operational improvements
```

The actual policy belongs to the engineering organization.

---

# 70. Observability During Deployments

During deployment, watch:

```text
request rate
5xx rate
latency
login success rate
database errors
Redis errors
CPU
memory
restart count
```

Compare:

```text
old version
vs
new version
```

A deployment should have a rollback plan before production rollout.

---

# 71. Canary Deployment Observability

For a canary:

```text
5% new version
95% old version
```

Compare:

```text
error rate
latency
login success
dependency errors
resource usage
```

Only increase traffic when the measured behavior satisfies the deployment criteria.

---

# 72. Incident Timeline

During incidents, preserve a timeline:

```text
10:02 deployment started
10:04 p95 latency increased
10:05 database connections increased
10:07 5xx rate exceeded threshold
10:09 rollback started
10:11 error rate returned to baseline
```

Correlated observability makes this timeline evidence-based.

---

# 73. Example Incident

Scenario:

```text
Users report login failures.
```

Observed:

```text
login 5xx rate: elevated
login p95: elevated
```

Trace:

```text
auth.login
   |
   +-- PostgreSQL user lookup: 4.8s
```

Database metrics:

```text
connection pool: 100%
```

Investigation:

```text
recent deployment changed connection behavior
```

Action:

```text
rollback
```

Verification:

```text
5xx -> baseline
p95 -> baseline
connection pool -> normal
```

This is the kind of incident that observability should make straightforward to diagnose.

---

# 74. Observability Testing

Observability must itself be tested.

Test that:

- request IDs are generated
- request IDs propagate correctly
- errors create useful logs
- sensitive values are redacted
- metrics increment correctly
- traces contain expected spans
- health checks behave correctly
- readiness fails when required dependencies are unavailable
- alerts fire under controlled conditions

---

# 75. Log Redaction Tests

Create automated tests that verify:

```text
password never appears
session token never appears
reset token never appears
authorization header never appears
cookie values never appear
```

Example conceptual test:

```text
trigger login
capture log
assert log does not contain submitted password
```

This is an important security regression test.

---

# 76. Metric Tests

For a successful login:

```text
auth_login_success_total
```

should increase.

For invalid credentials:

```text
auth_login_failure_total
```

should increase.

For a server error:

```text
http_requests_total{status_code="500"}
```

should increase.

Metric tests should avoid brittle assumptions about exact internal implementation details.

---

# 77. Trace Tests

Verify that a login request produces expected spans such as:

```text
HTTP request
auth.login
database operation
session operation
```

Do not make tests depend on vendor-specific trace IDs.

Test semantic relationships instead.

---

# 78. Health Check Tests

Test:

```text
GET /health -> 200
```

and:

```text
readiness with healthy dependencies -> ready
```

and:

```text
readiness with critical dependency unavailable -> not ready
```

Liveness and readiness should have separate responsibilities.

---

# 79. Alert Tests

Alerts should be tested without creating a real outage.

Possible methods:

```text
synthetic metric
test environment
controlled failure injection
alert-rule unit testing
```

Document:

```text
alert name
trigger
severity
owner
runbook
expected response
```

---

# 80. Synthetic Monitoring

Production synthetic checks can periodically test:

```text
health
login flow using a dedicated test account
logout
authenticated session
```

Synthetic accounts must be:

```text
non-production business accounts
properly isolated
non-privileged
securely managed
```

Never use a real customer's credentials.

---

# 81. Synthetic Monitoring Safety

Synthetic tests must not:

- create unlimited accounts
- send uncontrolled emails
- create financial transactions
- access real customer data
- use administrator credentials unnecessarily

Keep synthetic activity deterministic and low volume.

---

# 82. Observability Failure Modes

## Failure: Logging system unavailable

The application should not become unavailable simply because a logging backend is down.

Use controlled buffering and fail-safe logging behavior.

Never block authentication indefinitely waiting for a log collector.

---

## Failure: Metrics backend unavailable

Metrics export failure should not normally break authentication requests.

The application should continue serving requests where safe.

---

## Failure: Trace collector unavailable

Tracing should degrade gracefully.

Authentication must not depend on successful trace export.

---

# 83. Backpressure

Observability systems can themselves create load.

Potential problems:

```text
too many logs
too many traces
large log payloads
slow exporters
```

Controls include:

```text
sampling
batching
size limits
asynchronous export
bounded queues
drop policies
```

Do not allow telemetry to consume unbounded memory.

---

# 84. Logging Volume Control

Avoid logging every internal function call in production.

Prefer meaningful events:

```text
request started
request completed
security event
dependency failure
unexpected error
```

Not:

```text
entered function A
entered function B
entered function C
```

unless temporary debugging requires it.

---

# 85. Structured Error Taxonomy

Use stable categories:

```text
VALIDATION_ERROR
AUTHENTICATION_ERROR
AUTHORIZATION_ERROR
RATE_LIMITED
NOT_FOUND
CONFLICT
DEPENDENCY_ERROR
INTERNAL_ERROR
```

Internally, more detailed error codes can exist.

Example:

```text
AUTH_INVALID_CREDENTIALS
DB_TIMEOUT
REDIS_TIMEOUT
EMAIL_PROVIDER_FAILURE
```

---

# 86. Correlation Model

A useful correlation model is:

```text
request_id
    |
    +--> logs
    |
    +--> response
    |
    +--> audit event

trace_id
    |
    +--> HTTP span
    |
    +--> auth span
    |
    +--> DB span
    |
    +--> Redis span
```

This keeps operational and distributed tracing concerns connected without conflating them.

---

# 87. Example End-to-End Log Set

Request:

```text
POST /api/v1/auth/login
```

Log 1:

```json
{
  "event": "http.request.started",
  "request_id": "req_123",
  "route": "/api/v1/auth/login"
}
```

Log 2:

```json
{
  "event": "auth.login.success",
  "request_id": "req_123"
}
```

Log 3:

```json
{
  "event": "auth.session.created",
  "request_id": "req_123"
}
```

Log 4:

```json
{
  "event": "http.request.completed",
  "request_id": "req_123",
  "status_code": 200,
  "duration_ms": 94
}
```

---

# 88. Example Failed Request

```json
{
  "event": "auth.login.failure",
  "request_id": "req_124",
  "reason": "invalid_credentials"
}
```

Response:

```http
HTTP/1.1 401 Unauthorized
X-Request-Id: req_124
```

No password or token is included.

---

# 89. Example Dependency Failure

```json
{
  "level": "error",
  "event": "dependency.failure",
  "dependency": "postgresql",
  "error_code": "DB_TIMEOUT",
  "request_id": "req_125",
  "retryable": true
}
```

The client receives a safe error.

---

# 90. Operational Runbooks

Each critical alert should have a runbook.

Example:

```text
Alert:
Authentication API 5xx > 5%

Runbook:
1. Check deployment status.
2. Check application logs.
3. Check PostgreSQL health.
4. Check Redis health.
5. Check resource saturation.
6. Inspect representative traces.
7. Roll back if the failure correlates with a deployment.
8. Verify recovery.
```

Runbooks should be short enough to use during an incident.

---

# 91. Common Runbooks

Create runbooks for:

```text
authentication API unavailable
database unavailable
Redis unavailable
high login failure rate
high login latency
password reset delivery failure
high rate-limit activity
session failures
high memory usage
high CPU usage
```

---

# 92. Production Verification Checklist

## Logging

- [ ] Logs are structured.
- [ ] Request IDs are present.
- [ ] Trace IDs are present when tracing is enabled.
- [ ] Passwords are never logged.
- [ ] Session tokens are never logged.
- [ ] Reset tokens are never logged.
- [ ] Authorization headers are redacted.
- [ ] Cookie values are redacted.
- [ ] Log levels are appropriate.

## Metrics

- [ ] Request rate is measured.
- [ ] Error rate is measured.
- [ ] Latency percentiles are measured.
- [ ] Login success/failure is measured.
- [ ] Registration outcomes are measured.
- [ ] Session activity is measured.
- [ ] Rate-limit events are measured.
- [ ] Dependency errors are measured.
- [ ] High-cardinality labels are avoided.

## Tracing

- [ ] HTTP requests are traced.
- [ ] Auth service operations are traced.
- [ ] Database operations are traceable.
- [ ] Redis operations are traceable when used.
- [ ] Sensitive attributes are excluded.
- [ ] Sampling is configured.

## Health

- [ ] Liveness works.
- [ ] Readiness works.
- [ ] Dependency health is represented appropriately.
- [ ] Health endpoints do not leak sensitive infrastructure details.

## Alerting

- [ ] Critical alerts exist.
- [ ] Warning alerts exist.
- [ ] Alerts have owners.
- [ ] Alerts have runbooks.
- [ ] Alerts have tested thresholds.
- [ ] Alert fatigue is controlled.

## Privacy

- [ ] PII collection is minimized.
- [ ] Logs have defined retention.
- [ ] Observability access is restricted.
- [ ] Sensitive fields are redacted.
- [ ] Audit retention is separately defined.

---

# 93. Reference Implementation Status

The current TypeScript authentication implementation provides a foundation for observability but does not yet implement the complete production observability stack described in this document.

Currently implemented:

```text
request IDs
structured response errors
health endpoint
central error middleware
```

Not yet fully implemented:

```text
production logger
metrics backend
OpenTelemetry tracing
PostgreSQL metrics
Redis metrics
email metrics
persistent audit events
production alerting
dashboards
readiness checks
log redaction middleware
rate-limit metrics
```

These should be introduced incrementally.

---

# 94. Recommended Implementation Order

Build observability in this order:

```text
1. Structured logger
2. Request ID propagation
3. Sensitive-field redaction
4. HTTP request metrics
5. Authentication metrics
6. Dependency metrics
7. Health/readiness checks
8. Distributed tracing
9. Dashboards
10. Alerts
11. Audit-event integration
12. Synthetic monitoring
```

Do not introduce every observability component at once.

---

# 95. Minimal Production Stack

A practical stack could look like:

```text
Application
   |
   +-- Structured JSON logs
   |
   +-- Prometheus-compatible metrics
   |
   +-- OpenTelemetry traces
   |
   v
Observability platform
   |
   +-- Logs
   +-- Metrics
   +-- Traces
   +-- Dashboards
   +-- Alerts
```

The exact vendor or platform is an implementation choice.

---

# 96. Vendor-Neutral Design

The authentication application should not tightly couple business logic to a specific observability vendor.

Prefer interfaces such as:

```text
Logger
Metrics
Tracer
AuditEventPublisher
```

Then the application can change:

```text
logging backend
metrics backend
tracing backend
```

without rewriting authentication logic.

---

# 97. Observability Abstraction

Conceptual application code:

```text
logger.info("auth.login.success", context)
metrics.increment("auth_login_success_total")
tracer.startSpan("auth.login")
```

The authentication service should not contain vendor-specific dashboard logic.

---

# 98. What Good Observability Looks Like

A strong production system lets an engineer answer:

```text
What happened?
When did it happen?
Which endpoint was involved?
Which deployment was running?
Which dependency failed?
How many users were affected?
Is the problem still happening?
Was this expected user behavior or system failure?
What changed?
What should we do next?
```

without reading arbitrary application source code first.

---

# 99. What Bad Observability Looks Like

Bad observability means:

```text
"Something is broken."
```

and the only available information is:

```text
Error: failed
```

No request ID.

No trace.

No metrics.

No dependency information.

No deployment version.

No useful error category.

That turns a small production failure into a long debugging session.

---

# 100. Final Observability Architecture

The complete model is:

```text
                         ┌─────────────────────┐
                         │      Clients        │
                         └──────────┬──────────┘
                                    │
                                    v
                         ┌─────────────────────┐
                         │    Node.js API      │
                         │                     │
                         │ Request ID          │
                         │ Structured Logs     │
                         │ Metrics             │
                         │ Tracing             │
                         └──────────┬──────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             │                      │                      │
             v                      v                      v
      ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
      │ PostgreSQL  │        │    Redis    │        │    Email    │
      └──────┬──────┘        └──────┬──────┘        └──────┬──────┘
             │                      │                      │
             └──────────────────────┼──────────────────────┘
                                    │
                                    v
                         ┌─────────────────────┐
                         │  Observability      │
                         │                     │
                         │ Logs                │
                         │ Metrics             │
                         │ Traces              │
                         │ Dashboards          │
                         │ Alerts              │
                         └─────────────────────┘
                                    │
                                    v
                         ┌─────────────────────┐
                         │ Engineers / On-call │
                         └─────────────────────┘
```

The key rule is simple:

```text
Logs tell you what happened.
Metrics tell you how often.
Traces tell you where.
Audit events tell you what security action occurred.
```

Together, they make the authentication system operable rather than merely executable.
