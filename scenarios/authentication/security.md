# Security — Production-Grade Authentication

This document defines the security model, threat model, controls, verification strategy, and operational expectations for the authentication scenario.

The goal is not to claim that authentication is "secure" because a password hash and cookie exist. The goal is to identify realistic attacks, define concrete controls, test those controls, and document the remaining risks.

---

## 1. Security Objectives

The authentication system must protect:

- user credentials
- authenticated sessions
- password-reset capabilities
- account ownership
- authorization boundaries
- personally identifiable account data
- security-sensitive audit information
- application infrastructure

Primary security properties:

1. Confidentiality
2. Integrity
3. Availability
4. Authentication assurance
5. Authorization correctness
6. Auditability
7. Recoverability

---

# 2. Security Boundaries

The system contains several security boundaries:

```text
                    INTERNET
                       |
                       v
              +----------------+
              | Browser / API  |
              +----------------+
                       |
                 HTTPS boundary
                       |
                       v
              +----------------+
              | Express API    |
              +----------------+
                |      |      |
                |      |      |
                v      v      v
           PostgreSQL Redis Email
```

Trust must not automatically cross these boundaries.

A value supplied by the browser is untrusted until validated.

A role supplied by the browser is never authoritative.

A session is trusted only after server-side validation.

---

# 3. Threat Model

## Assets

The most important assets are:

| Asset | Security impact |
|---|---|
| Passwords | Account takeover |
| Session secrets | Immediate account access |
| Reset tokens | Password takeover |
| User identity data | Privacy impact |
| Roles | Privilege escalation |
| Audit records | Investigation integrity |
| Authentication service | System-wide access boundary |
| Database | Credential and identity compromise |
| Email account/channel | Reset-flow compromise |

---

# 4. Threat Actors

Consider:

### Unauthenticated internet attacker

Capabilities:

- send arbitrary HTTP requests
- attempt many credentials
- enumerate behavior
- abuse public endpoints
- exploit implementation bugs

### Compromised user

Capabilities:

- use a valid account
- attempt privilege escalation
- access authorized resources
- potentially abuse application workflows

### Stolen session attacker

Capabilities:

- replay a valid session secret
- act as the victim until revocation or expiry

### Malicious or compromised internal component

Capabilities depend on the component and its credentials.

Examples:

- compromised application host
- compromised database credentials
- compromised email provider credentials

---

# 5. Threat Model Method

For each important flow, ask:

1. What can the attacker control?
2. What can the attacker observe?
3. What state can the attacker modify?
4. What secret could be stolen?
5. What happens if a dependency fails?
6. What prevents replay?
7. What prevents privilege escalation?
8. What evidence remains after the attack?

Security review should consider both happy paths and failure paths.

---

# 6. Password Security

Passwords are one-way credentials.

The server must never store plaintext passwords.

Recommended password hashing algorithm:

```text
Argon2id
```

The implementation should use a library implementation rather than implementing the cryptographic algorithm manually.

Password hashes must contain their required algorithm parameters and salts according to the password-hashing library's format.

---

# 7. Password Hashing Requirements

The password subsystem must:

- use a modern password-hashing algorithm
- use a unique salt per password
- use parameters appropriate for the deployment environment
- allow parameter upgrades over time
- never log plaintext passwords
- never return password hashes through APIs
- never place password hashes in browser storage

The exact cost parameters should be benchmarked on the actual production infrastructure.

---

# 8. Password Policy

The baseline policy is:

```text
Minimum: 12 characters
Maximum: 256 characters
```

Long passphrases should be accepted.

Arbitrary composition rules such as:

```text
one uppercase
one number
one symbol
```

should not be treated as the primary security mechanism.

Compromised-password screening can provide additional protection.

---

# 9. Password Length and Resource Exhaustion

Password length limits are also an availability control.

Without a maximum, an attacker could send extremely large values to trigger excessive hashing work or memory consumption.

Validation should happen before expensive password hashing.

The maximum must remain large enough to support legitimate passphrases.

---

# 10. Credential Stuffing

Credential stuffing occurs when attackers reuse username/password combinations obtained from another breach.

Controls:

- rate-limit login attempts
- detect abnormal login patterns
- use breached-password screening where appropriate
- avoid account-enumeration leaks
- support session revocation
- provide account recovery
- consider additional verification for high-risk activity

A password policy alone does not solve credential stuffing.

---

# 11. Brute-Force Protection

Login attempts must be rate-limited.

Controls may include:

```text
IP-based limits
+
account-based limits
+
progressive delays
+
risk-based controls
```

Do not rely exclusively on an IP limit because attackers can distribute requests across many IP addresses.

Do not permanently lock accounts based only on failed login attempts without a recovery design, because attackers could intentionally lock legitimate users out.

---

# 12. Distributed Rate Limiting

A production deployment may have multiple API instances.

Therefore:

```text
Local process memory
```

is insufficient as the only rate-limit store.

Redis or another distributed store should be used when the application is horizontally scaled.

The rate limiter must behave consistently across application instances.

---

# 13. Rate-Limit Failure

The application must define what happens when the rate-limit dependency is unavailable.

For security-sensitive authentication controls, silently disabling rate limiting can create a security regression.

Possible strategies:

- fail closed for the highest-risk operations
- use a bounded local emergency limit
- degrade according to documented risk policy

The chosen behavior must be tested.

---

# 14. Session Security

The system uses server-managed sessions.

The browser receives an opaque secret.

The server stores a verifier/hash rather than the raw secret.

Conceptually:

```text
Browser
   |
   | raw session secret
   v
Cookie
   |
   v
API
   |
   | hash(secret)
   v
Session store
```

If the database is compromised, raw session cookies should not be directly recoverable from the stored verifier.

---

# 15. Session Secret Entropy

Session secrets must be generated using a cryptographically secure random number generator.

Do not use:

```text
Math.random()
timestamps
incrementing IDs
predictable UUID-like constructions
```

The reference implementation uses Node's cryptographic random-byte generator.

---

# 16. Session Cookie Requirements

Production session cookies should use:

```text
HttpOnly
Secure
SameSite=<explicit policy>
Path=/
```

Recommended baseline:

```http
Set-Cookie: session=<secret>; HttpOnly; Secure; SameSite=Lax; Path=/
```

`Secure` is mandatory in production.

---

# 17. HttpOnly

`HttpOnly` prevents ordinary JavaScript from reading the session cookie.

This reduces the impact of some cookie-stealing attacks.

It does not make XSS harmless.

A successful XSS attack can still perform actions as the victim through the browser.

Therefore XSS defenses remain necessary.

---

# 18. Secure

`Secure` prevents browsers from sending the cookie over ordinary HTTP connections.

Production authentication traffic must use HTTPS.

TLS termination at a reverse proxy is acceptable, but the complete deployment path must still protect credentials and session secrets.

---

# 19. SameSite

`SameSite` provides browser-level cross-site cookie restrictions.

It should be explicitly selected based on the application's deployment architecture.

Important:

```text
SameSite != complete CSRF defense
```

If cross-site authenticated requests are possible, use an explicit CSRF strategy.

---

# 20. Session Expiration

Sessions require:

- absolute lifetime
- idle timeout where appropriate
- revocation
- expiry checks
- secure renewal/rotation policy

An expired session must not authenticate a request.

The API returns:

```http
401 Unauthorized
```

for an invalid or expired session.

---

# 21. Session Revocation

Sessions must be revocable.

Revocation is required after events such as:

- logout
- password reset
- security incident
- account compromise
- administrative security action

The implementation must ensure that revoked sessions cannot be used again.

---

# 22. Session Fixation

Session fixation occurs when an attacker can cause a victim to authenticate using an attacker-known session identifier.

Mitigations:

- create a new session after successful authentication
- rotate session identifiers when authentication state changes
- never accept arbitrary client-selected session IDs
- never treat a pre-authentication identifier as an authenticated session

---

# 23. Password Reset Security

Password reset is an alternate authentication path.

Therefore:

```text
Password reset security ≈ login security
```

A weak reset flow can bypass a strong password system.

Reset tokens must be:

- random
- high entropy
- short-lived
- single-use
- stored as hashes/verifiers
- invalidated after use
- excluded from logs

---

# 24. Reset Token Storage

Never store:

```text
raw_reset_token
```

Store something equivalent to:

```text
hash(raw_reset_token)
```

When the user submits the token:

1. hash/verify the supplied token
2. locate the valid record
3. verify expiration
4. verify unused state
5. consume it atomically
6. update the password

---

# 25. Reset Token Replay

A reset token must not be reusable.

The database operation should atomically transition:

```text
unused
   |
   | successful consumption
   v
used
```

Two simultaneous requests must not both succeed.

This requires transactional or atomic persistence behavior in the production implementation.

---

# 26. Reset Token Expiration

Reset tokens must have an explicit expiration timestamp.

Example policy:

```text
short-lived
```

The exact duration belongs to the security configuration.

Expired tokens must behave as invalid tokens.

---

# 27. Password Reset Enumeration

This endpoint:

```text
POST /auth/password-reset/request
```

should return a generic response.

Example:

```text
If an account matches this email address, reset instructions will be sent.
```

This prevents an attacker from using the endpoint as a user database.

---

# 28. Reset URLs

Never place raw reset tokens in query parameters when avoidable.

Avoid:

```text
/reset?token=SECRET
```

because URLs can appear in:

- proxy logs
- browser history
- analytics
- referrer metadata
- monitoring systems

A safer architecture uses a reset flow where the secret is handled deliberately and is not unnecessarily persisted in infrastructure logs.

---

# 29. CSRF

Cookie-based authentication requires CSRF consideration.

State-changing endpoints include:

```text
POST /auth/login
POST /auth/logout
POST /auth/password/change
POST /auth/password-reset/confirm
```

Controls can include:

- SameSite cookies
- CSRF tokens
- Origin validation
- trusted-origin allowlists

The exact control must match the browser architecture.

---

# 30. Origin Validation

For browser state-changing requests, validate the `Origin` header against an explicit trusted-origin list when appropriate.

Example:

```text
https://app.example.com
```

is trusted.

Arbitrary origins must not be dynamically trusted based on user input.

---

# 31. CORS

Credentialed CORS must never use:

```http
Access-Control-Allow-Origin: *
```

with:

```http
Access-Control-Allow-Credentials: true
```

Use explicit trusted origins.

Only allow the methods and headers required by the frontend.

---

# 32. XSS

XSS can compromise an authenticated user's browser context.

Controls:

- output encoding
- framework escaping
- Content Security Policy
- input handling
- avoiding unsafe HTML injection
- dependency hygiene
- security headers
- secure cookie configuration

Never assume `HttpOnly` makes XSS acceptable.

---

# 33. Security Headers

The application should use appropriate security headers.

The reference implementation uses Helmet.

Important headers include protections related to:

- content security policy
- clickjacking
- MIME sniffing
- referrer leakage
- cross-origin behavior
- transport security

Headers must be reviewed against the actual frontend architecture before production deployment.

---

# 34. Clickjacking

Authenticated pages should not be freely embedded by untrusted origins.

Controls include:

```text
Content-Security-Policy: frame-ancestors ...
```

and:

```text
X-Frame-Options
```

where appropriate.

---

# 35. Transport Security

Production authentication traffic must use HTTPS.

TLS must protect:

```text
Browser -> Edge
Edge -> API
API -> Database
API -> Redis
API -> Email provider
```

where those connections cross an untrusted network.

Certificates must be managed operationally.

---

# 36. Authorization

Authentication is not authorization.

Every protected operation must verify:

1. authenticated identity
2. required permission
3. ownership/resource relationship where applicable

Never rely on:

```text
hidden UI buttons
frontend role state
client-provided role
client-provided user ID
```

as authorization controls.

---

# 37. IDOR / BOLA

Insecure Direct Object Reference or Broken Object Level Authorization occurs when a user changes an object identifier and accesses another user's data.

Unsafe:

```text
GET /users/usr_other_user/profile
```

with only authentication checked.

The server must additionally verify authorization and ownership.

---

# 38. Privilege Escalation

A normal user must not be able to become an administrator by modifying:

```json
{
  "role": "admin"
}
```

or:

```json
{
  "is_admin": true
}
```

Authorization state must come from trusted server-side data.

Role assignment must be a privileged operation.

---

# 39. Account Enumeration

Enumeration can happen through:

- different status codes
- different error messages
- timing differences
- password reset responses
- registration responses
- user lookup endpoints

The system should minimize unnecessary differences.

Perfect timing equality is difficult, so prioritize meaningful information leakage rather than claiming exact timing indistinguishability.

---

# 40. Timing Considerations

Authentication operations can produce timing differences because:

- user lookup may fail
- password verification may run
- database state differs

Where practical, login implementations should avoid extremely obvious differences between nonexistent users and wrong passwords.

Do not implement fragile custom cryptography merely to chase theoretical timing equality.

Use well-reviewed password-hashing libraries and sensible application-level controls.

---

# 41. Input Validation

All externally supplied data is untrusted.

Validate:

- JSON structure
- field types
- length
- format
- allowed values
- required fields

Reject unexpected fields where strict schemas are appropriate.

The reference implementation uses Zod schemas.

---

# 42. Request Size Limits

Authentication APIs should have small body-size limits.

This protects against:

- memory exhaustion
- parser abuse
- oversized payload attacks

The reference implementation uses:

```text
32 KB JSON body limit
```

The final value should be reviewed against the real contract.

---

# 43. HTTP Parameter Pollution

If endpoints accept repeated parameters or fields, define deterministic behavior.

Prefer structured JSON schemas rather than ambiguous duplicate parameters.

For example, avoid silently accepting:

```text
email=a@example.com&email=b@example.com
```

with undefined selection rules.

---

# 44. Prototype Pollution

Do not blindly merge attacker-controlled objects into application configuration or security-sensitive objects.

Use schema validation and explicit field selection.

Avoid unsafe patterns such as arbitrary recursive object merges on untrusted input.

---

# 45. Dependency Security

Dependencies are part of the security boundary.

Required controls:

```text
npm audit
```

plus:

- lockfile committed
- dependency updates
- security advisories
- review of transitive dependencies
- removal of unnecessary packages

Do not blindly upgrade production dependencies without testing.

---

# 46. Supply Chain Security

Builds should use:

- locked dependency versions
- reproducible installation where practical
- trusted package registries
- protected CI
- limited CI credentials
- dependency review

CI secrets must never be printed.

---

# 47. Secrets Management

Never commit:

```text
.env
API keys
database passwords
JWT secrets
session encryption keys
email credentials
cloud credentials
```

to Git.

Use environment variables or a dedicated secret-management system.

`.env.example` may document variable names without real secrets.

---

# 48. Secret Rotation

Production secrets need a rotation strategy.

Rotation should cover:

- database credentials
- email provider credentials
- application secrets
- infrastructure credentials

Authentication session secrets should have an explicit lifecycle policy.

A secret rotation must not accidentally invalidate every service or create an authentication outage unless that behavior is intentional.

---

# 49. Logging Security

Logs are security-sensitive.

Never log:

```text
password
password_hash
session cookie
reset token
authorization header
database password
API secret
```

Prefer:

```text
request_id
user_id
event_type
timestamp
result
safe metadata
```

---

# 50. Authentication Event Logging

Security-relevant events should be recorded:

```text
LOGIN_SUCCESS
LOGIN_FAILURE
LOGOUT
PASSWORD_RESET_REQUESTED
PASSWORD_RESET_COMPLETED
PASSWORD_CHANGED
SESSION_REVOKED
AUTHORIZATION_DENIED
RATE_LIMITED
```

Audit events must not contain secrets.

---

# 51. Log Injection

User-controlled values can contain newline characters or other formatting characters.

Structured logging should be preferred.

Do not concatenate arbitrary user input into security logs without safe serialization.

---

# 52. Error Message Security

Production errors must not expose:

- stack traces
- SQL statements
- filesystem paths
- dependency versions unnecessarily
- database hosts
- internal service names
- secrets

Clients receive safe messages and request IDs.

Operators use server-side logs for details.

---

# 53. Database Security

The production database must use:

- least-privilege credentials
- encrypted connections where required
- private networking where possible
- restricted inbound access
- backups
- tested restoration
- migration controls
- auditing appropriate to the environment

The API should not connect as a superuser.

---

# 54. Session Database Security

Session records contain authentication material.

Therefore the session table/store requires protection equivalent to other security-sensitive credential data.

Store only the minimum information required.

Recommended fields include:

```text
session_id
user_id
secret_hash
created_at
expires_at
revoked_at
```

---

# 55. Database Constraints

Security-relevant invariants should be enforced by the database where possible.

Examples:

```text
unique(normalized_email)
foreign key(user_id)
valid timestamps
```

Application validation alone is not sufficient for concurrency-sensitive uniqueness.

---

# 56. Race Conditions

Authentication flows must consider concurrent requests.

Important examples:

- two registrations for the same email
- two reset-token consumption requests
- simultaneous password changes
- simultaneous session revocations

Use transactions and unique constraints where required.

---

# 57. Atomic Password Reset

Password reset should eventually use a transaction equivalent to:

```text
BEGIN

verify reset token
verify expiration
verify unused state
mark token consumed
update password
revoke sessions

COMMIT
```

If any critical step fails, the transaction must not leave a partially completed reset state.

---

# 58. Account Recovery

Recovery mechanisms must be treated as authentication mechanisms.

Security questions based on public information should not be considered strong authentication.

Email-based recovery depends on the security of the user's email account.

High-risk applications may require stronger recovery controls.

---

# 59. Session Theft Response

If a session secret is suspected to be stolen:

1. revoke the session
2. investigate the account
3. consider revoking all sessions
4. require password change where appropriate
5. inspect security events
6. preserve relevant audit evidence
7. communicate according to the incident policy

---

# 60. Password Compromise Response

If password compromise is suspected:

1. invalidate active sessions
2. require password reset/change
3. review suspicious authentication events
4. inspect account changes
5. notify the user according to incident policy
6. investigate credential reuse if evidence supports it

---

# 61. Privileged Accounts

Administrative accounts require stronger controls.

Potential controls:

- MFA
- shorter session lifetime
- stronger audit requirements
- privileged role separation
- reauthentication for sensitive operations
- restricted administrative origins

The baseline scenario focuses on password + session authentication, but the architecture should leave room for MFA.

---

# 62. MFA Evolution

Future MFA can be introduced without replacing the entire authentication architecture.

Potential mechanisms:

```text
TOTP
WebAuthn / passkeys
hardware security keys
email verification
```

Security strength differs by mechanism.

MFA recovery must be designed as carefully as MFA enrollment.

---

# 63. Reauthentication

Some operations may require recent authentication even when a valid session exists.

Examples:

- changing password
- changing email
- disabling MFA
- adding privileged roles
- exporting sensitive information

The API can later expose a reauthentication mechanism.

---

# 64. Email Security

Email delivery credentials must be protected.

Email content must not unnecessarily expose sensitive information.

Password-reset messages should contain only the information needed to complete recovery.

Reset links must expire.

---

# 65. SSRF Consideration

If the application later fetches user-provided URLs, SSRF protections become relevant.

Authentication itself does not require arbitrary outbound URL fetching.

Avoid adding network-fetching features to the auth service without a separate security review.

---

# 66. Denial of Service

Authentication endpoints are naturally attractive DoS targets because password hashing is intentionally expensive.

Controls:

- request size limits
- rate limiting
- concurrency limits
- connection limits
- reverse-proxy protections
- sensible password length maximum
- autoscaling
- monitoring

Do not remove password-hashing cost merely to improve throughput.

---

# 67. Password Hashing Capacity

Password verification is CPU/memory intensive by design.

Production capacity planning should measure:

```text
authentication requests / second
hash duration
CPU usage
memory usage
concurrent requests
```

Hash parameters should be strong enough for the threat model while remaining operationally sustainable.

---

# 68. Abuse Monitoring

Monitor for:

- sudden login failure spikes
- password-reset spikes
- unusual geographic patterns
- repeated requests from a small IP range
- distributed credential attacks
- repeated authorization failures
- session anomalies

Detection should support investigation rather than automatically assuming every anomaly is malicious.

---

# 69. Security Monitoring Signals

Useful metrics:

```text
auth_login_success_total
auth_login_failure_total
auth_password_reset_requested_total
auth_password_reset_completed_total
auth_session_revoked_total
auth_authorization_denied_total
auth_rate_limited_total
```

Never use passwords, tokens, or raw email addresses as metric labels.

---

# 70. Privacy

Authentication systems process personal data.

Minimize collection.

Only store data needed for:

- authentication
- authorization
- security
- operations
- legally required retention

Retention policies must be documented.

---

# 71. Data Minimization

Do not collect:

```text
unnecessary profile attributes
unnecessary device identifiers
unnecessary location data
```

merely because the database can store them.

Every additional data field increases privacy and security exposure.

---

# 72. Audit Trail Integrity

Audit records should be difficult for ordinary users to modify.

Access should be restricted.

For high-security environments, audit storage may use:

- append-only storage
- centralized logging
- tamper-evident pipelines
- separate security accounts

---

# 73. Incident Response

Authentication incidents should have a documented response process.

Minimum flow:

```text
Detect
  ↓
Contain
  ↓
Investigate
  ↓
Revoke affected credentials
  ↓
Recover
  ↓
Communicate
  ↓
Post-incident review
```

---

# 74. Security Incident: Database Compromise

If the database is compromised:

Immediate priorities:

1. isolate the database
2. rotate database credentials
3. investigate access
4. assess password-hash exposure
5. assess session-verifier exposure
6. revoke sessions if warranted
7. rotate affected infrastructure secrets
8. investigate audit records
9. determine notification requirements

Hashing reduces password exposure but does not eliminate the incident.

---

# 75. Security Incident: Session Store Compromise

If session storage is compromised:

1. determine whether raw secrets are exposed
2. revoke affected sessions
3. consider global session invalidation
4. investigate application logs
5. rotate relevant infrastructure credentials
6. inspect suspicious account activity

Storing only session-secret hashes reduces the value of a database dump.

---

# 76. Security Incident: Email Provider Compromise

If the reset-email provider is compromised:

1. assess whether reset links were exposed
2. invalidate outstanding reset tokens
3. rotate provider credentials
4. investigate affected accounts
5. require additional verification if necessary

---

# 77. Security Testing Strategy

Security testing should include:

### Unit tests

- password hashing
- session-secret hashing
- validation
- authorization helpers

### Integration tests

- registration
- login
- logout
- session lookup
- password reset
- password change

### Negative tests

- malformed requests
- invalid sessions
- expired sessions
- replayed reset tokens
- unauthorized role access
- oversized payloads

### Dependency scanning

- vulnerable dependencies
- lockfile integrity

### Dynamic testing

- HTTP endpoint abuse
- CSRF
- CORS
- header behavior
- rate limiting

---

# 78. Security Test Matrix

| Threat | Control | Verification |
|---|---|---|
| Password theft | Argon2id | Hashing tests |
| Session theft | Secure cookie + hashed session secret | Cookie/session tests |
| Brute force | Rate limiting | Abuse tests |
| Credential stuffing | Rate limiting + monitoring | Load/security tests |
| CSRF | SameSite + CSRF strategy | Browser tests |
| XSS | CSP + safe rendering | Security tests |
| Enumeration | Generic responses | API tests |
| Reset replay | Single-use token | Concurrency tests |
| IDOR | Server authorization | Authorization tests |
| Secret leakage | Log/output controls | Log inspection |
| DoS | Limits/rate controls | Load tests |
| Dependency compromise | Lockfile/scanning | CI checks |

---

# 79. Security Review Checklist

## Authentication

- [ ] Passwords are hashed with Argon2id
- [ ] Passwords are never logged
- [ ] Login failures are generic
- [ ] Login is rate-limited
- [ ] Session secrets are cryptographically random
- [ ] Sessions expire
- [ ] Sessions can be revoked

## Cookies

- [ ] HttpOnly
- [ ] Secure in production
- [ ] SameSite explicitly configured
- [ ] Appropriate Path
- [ ] Domain is not unnecessarily broad

## Password Reset

- [ ] Generic request response
- [ ] High-entropy token
- [ ] Token hash stored
- [ ] Expiration enforced
- [ ] Single-use enforcement
- [ ] Replay prevented
- [ ] Tokens excluded from logs
- [ ] Sessions revoked after successful reset

## Authorization

- [ ] Server-side authorization
- [ ] Role state is trusted
- [ ] Resource ownership is checked
- [ ] IDOR/BOLA tests exist
- [ ] Privilege escalation tests exist

## API

- [ ] Input validation
- [ ] Request size limits
- [ ] Consistent errors
- [ ] Request IDs
- [ ] Safe error messages
- [ ] CORS allowlist
- [ ] CSRF strategy

## Operations

- [ ] Secrets are externalized
- [ ] Dependency scanning
- [ ] Security monitoring
- [ ] Audit events
- [ ] Incident response
- [ ] Backup and recovery
- [ ] Credential rotation

---

# 80. Security Acceptance Criteria

The authentication scenario is not security-complete until:

1. No plaintext password is persisted.
2. No raw session secret is persisted.
3. Reset tokens are single-use.
4. Reset tokens expire.
5. Authentication failures do not unnecessarily reveal account existence.
6. Protected endpoints reject invalid sessions.
7. Authorization is enforced server-side.
8. Authentication endpoints are rate-limited.
9. Cookies use required security attributes in production.
10. Secrets are not committed to source control.
11. Sensitive values are excluded from logs.
12. Dependency vulnerabilities are continuously reviewed.
13. Security tests cover the documented threat model.
14. Failure behavior is documented.
15. Security incidents have a response procedure.

---

# 81. Known Reference-Implementation Limitations

The current educational implementation is intentionally incomplete.

It currently uses:

```text
in-memory users
in-memory sessions
```

and therefore is not suitable for production deployment.

Known missing production controls include:

- PostgreSQL persistence
- Redis-backed distributed rate limiting
- persistent password-reset tokens
- asynchronous email delivery
- CSRF implementation matched to deployment
- production secret management
- comprehensive audit persistence
- session cleanup jobs
- distributed tracing
- production observability
- infrastructure-level TLS configuration
- security-focused CI scanning

These limitations are documented rather than hidden.

---

# 82. Security Evolution Path

The scenario should evolve in this order:

```text
Secure API contract
        ↓
Secure password/session primitives
        ↓
Persistent database
        ↓
Distributed rate limiting
        ↓
Secure password reset
        ↓
Security tests
        ↓
Observability
        ↓
Deployment hardening
        ↓
Load/abuse testing
        ↓
Operational incident readiness
        ↓
MFA / passkeys
```

---

# 83. Final Security Principles

1. Treat every client input as untrusted.
2. Make the server the security authority.
3. Minimize secrets and their lifetime.
4. Hash credentials rather than encrypting passwords.
5. Make sessions revocable.
6. Treat password reset as an authentication mechanism.
7. Design for abuse, not only successful requests.
8. Do not leak account existence unnecessarily.
9. Enforce authorization on the server.
10. Make security controls observable.
11. Prefer proven cryptographic libraries.
12. Fail safely when security dependencies fail.
13. Document limitations instead of claiming security that has not been verified.
14. Test every important security invariant.
15. Plan for incident response before an incident happens.

---

# 84. Verification Command Set

The following commands should remain part of the engineering workflow:

```bash
npm run typecheck
npm run build
npm test
npm audit
git diff --check
```

Before every meaningful release, the complete security checklist should be reviewed.

Security is an ongoing engineering property, not a one-time checkbox.
