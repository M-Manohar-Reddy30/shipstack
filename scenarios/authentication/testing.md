# Authentication Testing

## 1. Purpose

Testing the authentication system is not only about checking whether login works.

Authentication is a security boundary.

A production-quality test strategy must verify:

- correct behavior
- incorrect behavior
- security controls
- data integrity
- session lifecycle
- error handling
- dependency failures
- concurrency
- observability
- deployment behavior

The objective is to make authentication predictable under both normal and hostile conditions.

---

# 2. Testing Goals

The authentication test strategy should answer:

```text
Can a valid user register?
Can a valid user log in?
Can an authenticated user access protected resources?
Can a user log out?
Does logout revoke the session?
Can an unauthenticated user access protected resources?
Are invalid credentials rejected?
Are invalid inputs rejected?
Are duplicate accounts handled safely?
Are password-reset flows safe?
Are authorization boundaries enforced?
Are security-sensitive values protected?
Does the system fail safely when dependencies fail?
```

---

# 3. Testing Pyramid

Use a balanced testing pyramid:

```text
                 ┌───────────────┐
                 │  E2E Tests    │
                 └───────┬───────┘
                         │
                ┌────────┴────────┐
                │ Integration     │
                │ Tests           │
                └────────┬────────┘
                         │
          ┌──────────────┴──────────────┐
          │       Unit Tests             │
          └──────────────────────────────┘
```

The majority of tests should be fast unit tests.

Integration tests verify real component boundaries.

End-to-end tests verify complete user journeys.

---

# 4. Test Categories

The authentication scenario should contain:

```text
Unit tests
Integration tests
API contract tests
Security tests
Database tests
Session tests
Authorization tests
End-to-end tests
Performance tests
Concurrency tests
Failure-injection tests
Observability tests
Deployment verification tests
```

---

# 5. Unit Tests

Unit tests isolate individual pieces of logic.

Examples:

```text
password hashing
password verification
input validation
session-token generation
error mapping
authorization decisions
configuration parsing
utility functions
```

Unit tests should be:

- fast
- deterministic
- isolated
- repeatable

They should not require the entire application stack.

---

# 6. Password Hashing Tests

The password utility should be tested independently.

Required cases:

```text
hash valid password
verify correct password
reject incorrect password
generate different hashes for repeated hashing
reject malformed hash
handle empty password according to validation policy
```

Example:

```text
password = "CorrectPassword123!"
hash(password) != password

verify(password, hash) == true
verify("WrongPassword123!", hash) == false
```

Never assert a specific Argon2 hash string because secure hashing should use a random salt.

---

# 7. Password Hashing Security Tests

Verify that:

```text
plaintext password is never returned
plaintext password is never persisted
hash output is not plaintext
password verification is performed through the password library
```

Do not write tests that expose real passwords in logs.

Use dedicated test credentials.

---

# 8. Password Policy Tests

If the application defines password requirements, test:

```text
minimum length
maximum length
allowed characters
disallowed conditions
empty value
missing value
very long value
Unicode input
```

Example:

```text
too short -> validation error
acceptable -> accepted
missing -> validation error
```

Do not impose arbitrary complexity requirements unless the product security policy requires them.

Length and resistance to password reuse/guessing are important considerations.

---

# 9. Validation Tests

Every request schema should have tests for:

```text
valid input
missing fields
extra fields
wrong types
empty strings
whitespace
boundary lengths
malformed email
oversized input
unexpected Unicode
```

Example registration:

```text
email missing
password missing
email invalid
password too short
valid registration
```

---

# 10. Registration Tests

Minimum registration test set:

```text
valid registration -> 201
invalid email -> 400
invalid password -> 400
missing email -> 400
missing password -> 400
duplicate account -> expected conflict behavior
```

Verify that successful registration creates exactly the required user state.

Verify that password data is stored only in hashed form.

---

# 11. Registration Atomicity

Registration should not leave partial state.

For example, avoid:

```text
create user
   |
   X
role assignment fails
```

leaving an unusable account.

Where multiple persistent writes are required, test transaction behavior.

Expected principle:

```text
all required state succeeds
OR
the operation rolls back safely
```

---

# 12. Duplicate Registration

Test:

```text
register user@example.com
register user@example.com again
```

Verify:

- no duplicate user is created
- the API returns the documented status
- sensitive account details are not unnecessarily revealed
- database uniqueness constraints protect the final state

Do not rely only on application-level duplicate checks.

---

# 13. Registration Race Test

Two requests may arrive simultaneously:

```text
Request A -> register@example.com
Request B -> register@example.com
```

The database must enforce uniqueness.

The test should verify:

```text
exactly one account
```

and:

```text
one request succeeds
one request receives the documented conflict behavior
```

This protects against race conditions.

---

# 14. Login Tests

Minimum cases:

```text
valid credentials -> 200
wrong password -> 401
unknown account -> safe authentication failure
missing email -> 400
missing password -> 400
malformed input -> 400
```

Verify that login success:

```text
creates a session
sets the expected cookie
returns the documented response
```

---

# 15. Login Enumeration Tests

The application should avoid revealing whether an account exists through observable differences where enumeration protection is required.

Test comparable behavior for:

```text
known email + wrong password
unknown email + password
```

Check:

```text
status behavior
response structure
message behavior
timing characteristics at an appropriate aggregate level
```

Do not require mathematically identical timing.

The goal is to avoid an obvious account-existence oracle.

---

# 16. Login Session Tests

After successful login:

```text
session cookie exists
cookie has expected attributes
session maps to the authenticated user
```

Then:

```text
GET /auth/me
```

should succeed.

After logout:

```text
GET /auth/me
```

should fail.

---

# 17. Cookie Tests

Verify:

```text
HttpOnly
Secure in production
SameSite policy
Path
appropriate expiration/max-age behavior
```

The exact cookie configuration should match the deployment architecture.

Do not assume one cookie policy works for every frontend/backend topology.

---

# 18. Session Tests

Required session tests:

```text
create session
read session
authenticate session
revoke session
reject revoked session
expire session
reject expired session
reject unknown session
```

The raw session token should never be persisted if the architecture uses hashed session-token storage.

---

# 19. Session Token Tests

Verify that:

```text
session token is unpredictable
session token has sufficient entropy
token hash is stored instead of raw token
```

Repeated token generation should produce different values.

Do not test for one exact random token value.

---

# 20. Session Fixation Tests

A session should not be silently reused across authentication boundaries in a way that allows fixation.

Test:

```text
unauthenticated session
       |
       v
login
       |
       v
authenticated session
```

Verify that authentication establishes the intended authenticated session state.

If session identifiers are rotated on login, test the rotation explicitly.

---

# 21. Logout Tests

Test:

```text
logout while authenticated -> success
logout session -> session revoked
reuse old session -> rejected
logout again -> documented behavior
logout without session -> documented behavior
```

The old session must not remain usable after successful revocation.

---

# 22. Multiple Session Tests

If the product allows multiple sessions:

```text
Session A
Session B
Session C
```

test:

```text
logout A
```

and verify:

```text
A -> rejected
B -> still valid
C -> still valid
```

If the product uses global logout, test the opposite behavior.

The policy must be explicit.

---

# 23. Current User Tests

For:

```http
GET /api/v1/auth/me
```

test:

```text
valid session -> user data
missing session -> 401
invalid session -> 401
revoked session -> 401
expired session -> 401
```

Never return:

```text
password hash
session token
reset token
internal secrets
```

---

# 24. Authorization Tests

Authentication is not authorization.

For protected resources, test:

```text
no authentication -> 401
authenticated but insufficient role -> 403
authenticated with correct role -> success
```

The exact status codes should follow the API contract.

---

# 25. Role Tests

For roles such as:

```text
user
admin
```

test:

```text
user -> user resource -> allowed
user -> admin resource -> denied
admin -> admin resource -> allowed
```

Do not rely on frontend controls for authorization.

The server must enforce authorization.

---

# 26. IDOR Tests

Test object-level authorization.

Example:

```text
User A owns resource A
User B owns resource B
```

User A must not be able to access:

```text
resource B
```

by changing an identifier.

Test:

```text
valid object ID
another user's object ID
nonexistent object ID
malformed object ID
```

---

# 27. Password Reset Tests

Required cases:

```text
valid reset request
invalid email format
missing email
unknown account
valid reset token
invalid token
expired token
already-used token
malformed token
new password invalid
new password valid
```

The public reset-request response should avoid account enumeration.

---

# 28. Password Reset Token Tests

Verify:

```text
token is unpredictable
token has expiration
token is single-use
token is invalidated after use
token is not stored in plaintext
```

If the implementation hashes reset tokens before persistence, test:

```text
raw token != stored value
```

---

# 29. Password Reset Replay Test

Flow:

```text
request reset
receive token
use token successfully
use same token again
```

Expected:

```text
first use -> success
second use -> rejected
```

This prevents token replay.

---

# 30. Password Reset Expiration Test

Create a token with a controlled expiration.

Then:

```text
before expiration -> accepted
after expiration -> rejected
```

Use a controllable clock or dependency injection rather than making tests wait in real time.

---

# 31. Password Change Tests

Required:

```text
authenticated user changes password
wrong current password
invalid new password
missing fields
successful password change
```

After successful password change, define and test the session policy:

```text
revoke all sessions
```

or:

```text
keep current session and revoke others
```

or another explicitly documented policy.

---

# 32. Password Change Security

After a password change, verify:

```text
old password no longer works
new password works
required sessions are revoked
password hash is updated
```

Never expose password hashes through APIs.

---

# 33. Error Handling Tests

Test:

```text
validation errors
authentication errors
authorization errors
conflicts
not found
rate limiting
dependency failure
unexpected exception
```

Every error should follow the documented API envelope.

---

# 34. Error Information Disclosure Tests

Verify that production responses do not expose:

```text
stack traces
database connection strings
SQL statements
password hashes
internal filesystem paths
secret keys
service credentials
dependency credentials
```

A client should receive safe error information.

---

# 35. 404 Tests

Test:

```text
unknown route
wrong HTTP method
unknown API version
```

Expected behavior should be consistent.

The server should not reveal unnecessary internal routing details.

---

# 36. Method Tests

For an endpoint such as:

```text
POST /auth/login
```

test:

```text
POST -> accepted
GET -> rejected
PUT -> rejected
DELETE -> rejected
```

The response should follow the API contract.

---

# 37. Content-Type Tests

Test requests with:

```text
application/json
missing Content-Type
text/plain
invalid JSON
empty body
```

The server should reject unsupported formats predictably.

---

# 38. Request Size Tests

Test:

```text
normal request
maximum accepted request
oversized request
```

Large payloads should not cause:

```text
memory exhaustion
unbounded parsing
unexpected process termination
```

---

# 39. Malformed Input Tests

Try:

```text
null
[]
{}
unexpected nested objects
numbers instead of strings
booleans instead of strings
very long strings
Unicode
control characters
```

The API should fail safely.

---

# 40. Injection Tests

Authentication input should be tested against:

```text
SQL injection payloads
NoSQL injection payloads where relevant
HTML injection
log injection
header injection
command injection attempts
```

The expected result is safe rejection or harmless handling.

Parameterized queries and schema validation should provide the primary defense.

---

# 41. Log Injection Tests

A malicious input might contain:

```text
\n
\r
fake log entry
```

Test that user-controlled values cannot forge misleading structured logs.

Structured logging libraries should encode fields rather than concatenate raw strings.

---

# 42. XSS Tests

Test malicious input such as:

```html
<script>alert(1)</script>
```

The API should not execute or reflect it unsafely.

If values are returned to a frontend, encoding belongs at the appropriate output boundary.

---

# 43. CSRF Tests

If authentication uses cookies, define the CSRF strategy.

Depending on architecture, test:

```text
missing CSRF token
invalid CSRF token
valid CSRF token
cross-origin request
same-origin request
```

Do not treat CORS as a replacement for CSRF protection.

---

# 44. CORS Tests

Test:

```text
allowed origin
disallowed origin
missing origin
preflight request
credentialed request
```

Verify that only configured trusted origins receive the intended access.

Do not use:

```text
Access-Control-Allow-Origin: *
```

with credentialed authentication requests.

---

# 45. Security Header Tests

Verify expected headers such as:

```text
Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
Strict-Transport-Security
```

The exact policy depends on deployment.

Helmet configuration should be tested for intended behavior.

---

# 46. Rate Limiting Tests

Once rate limiting is implemented, test:

```text
under threshold -> allowed
at threshold -> documented behavior
over threshold -> blocked
window reset -> allowed again
different client dimensions -> policy behavior
```

Do not test only the happy path.

---

# 47. Rate Limiting Concurrency

Send multiple simultaneous requests.

Verify that the rate-limit state is consistent.

For distributed deployments:

```text
Instance A
Instance B
Instance C
```

must share the intended rate-limit state if global limiting is required.

An in-memory limiter is not sufficient for a horizontally scaled deployment.

---

# 48. Brute-Force Protection Tests

Test repeated invalid login attempts.

Verify:

```text
failures are measured
rate limit eventually triggers
responses remain safe
legitimate behavior can recover
```

Do not make tests depend on an arbitrary hard-coded threshold unless that threshold is part of the documented policy.

---

# 49. Timing Tests

Timing tests should detect large accidental differences rather than demand exact equality.

Potential comparisons:

```text
known account + wrong password
unknown account
```

Run enough samples to detect meaningful regressions.

Network and runtime noise must be considered.

---

# 50. Database Integration Tests

Integration tests should use a real supported database engine where practical.

Test:

```text
user creation
unique email constraint
session persistence
session revocation
transaction rollback
password reset persistence
audit event persistence
```

Do not assume an in-memory mock behaves exactly like PostgreSQL.

---

# 51. Database Constraint Tests

Verify constraints at the database layer:

```text
unique user email
foreign keys
not-null requirements
valid role relationships
session ownership
token uniqueness where required
```

Application validation is useful, but database constraints protect against races and alternate write paths.

---

# 52. Transaction Tests

Test failure in the middle of multi-step operations.

Example:

```text
create user
create role assignment
audit event
```

Force one operation to fail.

Verify that the system reaches the documented atomic state.

---

# 53. Migration Tests

Every schema migration should be tested.

Verify:

```text
fresh database -> migrations succeed
previous version -> latest version succeeds
application starts after migration
constraints are correct
indexes exist
rollback strategy is documented
```

Never assume a migration is safe because it works on a developer laptop.

---

# 54. Test Database Isolation

Tests must not accidentally share state.

Preferred approaches:

```text
transaction rollback
isolated database
isolated schema
test containers
reset fixtures
```

The strategy depends on the test framework and infrastructure.

---

# 55. Test Fixtures

Fixtures should be:

```text
small
deterministic
safe
easy to reset
```

Example:

```text
test-user@example.test
```

Do not use real customer information.

---

# 56. Session Repository Tests

For the session repository, test:

```text
create
find
revoke
expire
delete/cleanup
```

Verify:

```text
correct session returned
wrong token rejected
revoked session rejected
expired session rejected
```

---

# 57. User Repository Tests

Test:

```text
create user
find by email
find by ID
update password
delete/disable account
unique constraint behavior
```

Repository tests should verify database behavior without depending on HTTP.

---

# 58. Auth Service Tests

The auth service should be tested for business rules:

```text
registration
login
logout
current user
password reset
password change
```

Controllers should remain thin.

Business logic should be tested at the service layer.

---

# 59. Controller Tests

Controller tests should verify:

```text
request parsing
validation
service invocation
response mapping
status codes
cookies
error propagation
```

Do not duplicate every service test at the controller layer.

---

# 60. Middleware Tests

Authentication middleware:

```text
missing cookie -> reject
invalid session -> reject
valid session -> attach user
revoked session -> reject
expired session -> reject
```

Error middleware:

```text
known application error -> mapped response
unknown error -> safe 500
```

Request ID middleware:

```text
incoming valid ID -> propagated
missing ID -> generated
invalid/oversized ID -> handled safely
```

---

# 61. API Integration Tests

Integration tests should run the application and send actual HTTP requests.

Example:

```text
POST /register
POST /login
GET /me
POST /logout
GET /me
```

This validates:

```text
routing
middleware
validation
controller
service
repository
cookies
error handling
```

---

# 62. Complete Authentication Flow

The highest-value integration test is:

```text
Register
   |
   v
Login
   |
   v
Authenticated /me
   |
   v
Logout
   |
   v
Authenticated /me -> 401
```

This should always run in CI.

---

# 63. Complete Password Reset Flow

When implemented:

```text
Request reset
   |
   v
Create token
   |
   v
Deliver through test email provider
   |
   v
Confirm reset
   |
   v
Login with new password
   |
   v
Old password rejected
```

Use a fake/test email provider.

Never send real emails from automated tests.

---

# 64. End-to-End Tests

E2E tests exercise the system like a real user.

Example:

```text
Browser
  |
  v
Frontend
  |
  v
API
  |
  v
Database
```

High-value E2E journeys:

```text
registration
login
authenticated page
logout
password reset
session expiration
authorization boundary
```

---

# 65. E2E Test Data

E2E tests should use isolated test accounts.

Example:

```text
e2e-user-001@example.test
```

Never use:

```text
real customer account
production admin
real employee credentials
```

---

# 66. Browser Session Tests

E2E tests should verify:

```text
login stores cookie
protected page loads
logout removes/revokes session
protected page becomes inaccessible
```

The test should inspect behavior, not depend on reading HttpOnly cookies directly from page JavaScript.

---

# 67. Cross-Browser Testing

If browser compatibility is part of the product requirement, test supported browsers.

Common choices:

```text
Chromium
Firefox
WebKit
```

The exact browser matrix should be based on the product's support policy.

---

# 68. API Contract Testing

The API contract should be tested against:

```text
request schema
response schema
status codes
error envelope
headers
cookie behavior
```

If OpenAPI is generated, contract tests can compare implementation behavior against the specification.

---

# 69. Backward Compatibility Tests

When changing the API:

```text
existing clients
```

must continue to work according to the compatibility policy.

Test:

```text
old request format
new request format
deprecated fields
versioned endpoint
```

Never silently change security semantics.

---

# 70. Negative Testing

Negative tests are especially important for authentication.

Examples:

```text
wrong password
expired session
revoked session
missing cookie
malformed token
invalid role
expired reset token
replayed reset token
oversized request
invalid JSON
wrong content type
disallowed origin
rate limit exceeded
dependency unavailable
```

A secure system should have more meaningful negative tests than a simple CRUD application.

---

# 71. Failure Injection

Controlled failure tests should simulate:

```text
PostgreSQL unavailable
Redis unavailable
email provider unavailable
database timeout
network timeout
connection pool exhaustion
unexpected service exception
```

Then verify:

```text
safe response
correct status
useful observability
no secret leakage
no corrupted state
```

---

# 72. PostgreSQL Failure Test

Simulate:

```text
user lookup -> timeout
```

Verify:

```text
client receives safe error
5xx/availability metric increments
dependency error is logged
trace shows database failure
no partial authentication state is created
```

---

# 73. Redis Failure Test

If Redis stores sessions:

```text
session lookup -> Redis unavailable
```

The system must follow the documented failure policy.

Test that it does not accidentally:

```text
authenticate without verifying the session
```

Security-critical failures should fail according to the explicit security model.

---

# 74. Email Provider Failure Test

Simulate:

```text
email provider timeout
```

Verify:

```text
reset request does not leak account existence
failure is observable
retry policy is bounded
no reset token is exposed
```

If asynchronous email delivery is used, test queue/retry behavior separately.

---

# 75. Concurrency Tests

Authentication is concurrent by nature.

Test:

```text
two registrations
multiple logins
multiple logout requests
simultaneous password changes
simultaneous reset confirmation
multiple session creation
```

Look for:

```text
race conditions
duplicate state
lost updates
inconsistent sessions
```

---

# 76. Login Concurrency

Send multiple valid login requests simultaneously.

Verify:

```text
each successful login receives an appropriate session
```

if multiple sessions are allowed.

If there is a session limit, verify the documented policy.

---

# 77. Logout Concurrency

Send:

```text
logout
logout
logout
```

simultaneously.

The system should remain consistent.

A second logout should not resurrect a revoked session.

---

# 78. Reset Token Concurrency

Two requests attempt to consume the same reset token simultaneously.

Expected:

```text
at most one succeeds
```

This is a critical security test.

The database transaction or atomic state transition must prevent double use.

---

# 79. Performance Testing

Authentication performance testing should measure:

```text
registration throughput
login throughput
session lookup latency
logout throughput
password verification latency
password reset request throughput
```

Use realistic workloads.

---

# 80. Load Testing

Load tests should distinguish:

```text
normal traffic
peak traffic
abuse traffic
```

Example:

```text
normal:
mostly authenticated requests

abuse:
large volume of invalid login attempts
```

This helps validate both capacity and security controls.

---

# 81. Password Hashing Load

Password hashing consumes CPU by design.

During load tests measure:

```text
CPU
memory
login latency
request queue
event-loop behavior
```

Do not optimize password hashing by blindly reducing security parameters.

Tune the parameters based on the threat model and available resources.

---

# 82. Performance Regression Tests

Track baseline:

```text
login p50
login p95
login p99
registration p95
session lookup p95
```

After changes, compare against baseline.

A regression threshold should be defined by the project rather than arbitrarily hard-coded.

---

# 83. Soak Testing

A soak test runs the system for an extended period.

Look for:

```text
memory leaks
connection leaks
session-store growth
log volume growth
queue growth
resource exhaustion
```

This is particularly useful for long-running Node.js services.

---

# 84. Security Testing

Security testing should include:

```text
authentication bypass attempts
authorization bypass attempts
session attacks
credential attacks
input attacks
CSRF
CORS
XSS
injection
rate-limit bypass
information disclosure
secret leakage
```

Automated tests should complement, not replace, security review and penetration testing.

---

# 85. Dependency Security Tests

CI should check dependencies for known vulnerabilities.

Also verify:

```text
lockfile committed
unexpected dependency changes reviewed
production dependencies separated from development dependencies
build scripts understood
```

A clean vulnerability scan does not prove the application is secure.

---

# 86. Secret Scanning

CI should detect accidental commits of:

```text
API keys
database credentials
private keys
tokens
cloud credentials
```

Test the repository using an approved secret-scanning mechanism.

Never commit:

```text
.env
production secrets
real credentials
```

---

# 87. Static Analysis

Run:

```text
TypeScript compiler
lint
security-focused static analysis where available
```

Static analysis should be part of CI.

---

# 88. Type Checking

The current implementation supports:

```bash
npm run typecheck
```

This should fail CI when type errors exist.

Type checking catches:

```text
incorrect imports
wrong types
missing properties
invalid function usage
```

---

# 89. Build Tests

The production build should run in CI:

```bash
npm run build
```

A successful development server does not guarantee that the production build works.

---

# 90. Existing Test Command

The current reference implementation provides:

```bash
npm test
```

which runs:

```bash
npm run build && tsx --test tests/auth.test.ts
```

The current test suite validates the core HTTP authentication flow.

As the implementation evolves, expand the test suite rather than replacing the existing coverage.

---

# 91. CI Test Pipeline

A practical CI pipeline:

```text
checkout
   |
   v
install dependencies
   |
   v
typecheck
   |
   v
lint
   |
   v
unit tests
   |
   v
integration tests
   |
   v
security checks
   |
   v
build
```

For larger projects:

```text
integration environment
   |
   v
database migrations
   |
   v
integration tests
```

---

# 92. CI Failure Policy

CI should fail when:

```text
typecheck fails
tests fail
build fails
critical security scan fails
required lint checks fail
```

Warnings should be clearly separated from blocking failures.

---

# 93. Test Naming

Use names that explain behavior.

Good:

```text
rejects revoked session
```

Good:

```text
returns 401 for invalid credentials
```

Good:

```text
prevents reset token replay
```

Bad:

```text
test1
```

Good test names make failures understandable without opening the test body.

---

# 94. Arrange-Act-Assert

A simple structure:

```text
Arrange
  create test state

Act
  perform operation

Assert
  verify outcome
```

Example:

```text
Arrange:
create user

Act:
login with wrong password

Assert:
401 response
no authenticated session
```

---

# 95. Test Determinism

Tests should not depend on:

```text
real time
random external services
internet connectivity
production databases
real email
random execution order
```

Inject or control:

```text
clock
randomness where appropriate
external dependencies
database
email provider
```

---

# 96. Time Control

Expiration tests should use a controllable clock.

Instead of:

```text
sleep for 30 minutes
```

use:

```text
fake clock
advance time
assert expiration
```

This makes tests fast and deterministic.

---

# 97. Randomness

Security-sensitive randomness should use a cryptographically secure random generator.

Tests should verify properties such as:

```text
tokens differ
token length is correct
```

rather than expecting exact values.

---

# 98. Test Isolation

A test should not depend on another test running first.

Bad:

```text
test A creates user
test B assumes user exists
```

Better:

```text
test B creates its own required state
```

This allows tests to run independently and in parallel where appropriate.

---

# 99. Parallel Test Safety

If tests run concurrently, avoid shared mutable state.

Possible strategies:

```text
unique test users
isolated database transactions
separate test schemas
unique identifiers
```

In-memory global state should be treated carefully.

---

# 100. Current In-Memory Implementation

The reference implementation currently uses:

```text
in-memory users
in-memory sessions
```

This is useful for demonstrating authentication flow behavior.

It is not equivalent to a production persistence layer.

Tests should clearly distinguish:

```text
reference implementation tests
```

from:

```text
production database tests
```

---

# 101. Testing the In-Memory Session Store

Current tests should verify:

```text
session created
session retrieved
session revoked
revoked session rejected
```

When PostgreSQL/Redis are introduced, add integration tests against the real stores.

---

# 102. Test Environment Variables

Test configuration loading with:

```text
required variable present
required variable missing
invalid value
valid value
development environment
production environment
```

Secrets should be injected by the test environment rather than committed.

---

# 103. Configuration Security Tests

Verify production configuration does not accidentally:

```text
disable secure cookies
allow unrestricted origins
enable debug logging
use weak secrets
skip TLS assumptions
```

The exact checks depend on deployment architecture.

---

# 104. Test Coverage

Coverage is useful, but 100% line coverage does not prove security.

Measure coverage for:

```text
authentication service
middleware
repositories
controllers
security utilities
```

Prioritize meaningful branch coverage for security decisions.

---

# 105. Branch Coverage

Important branches include:

```text
valid session
invalid session
expired session
revoked session

correct password
wrong password

valid role
invalid role

valid reset token
expired token
replayed token

healthy dependency
failed dependency
```

Security logic often fails in branches rather than happy paths.

---

# 106. Mutation Testing

For critical authentication logic, mutation testing can identify weak tests.

Example:

```text
change authorization condition
```

A strong test suite should fail.

Mutation testing is optional but useful once the project becomes mature.

---

# 107. Fuzz Testing

Fuzz authentication boundaries with:

```text
random JSON
random strings
oversized fields
malformed tokens
unexpected Unicode
nested objects
```

Useful targets:

```text
request validators
token parsers
cookie parsing
API endpoints
```

Fuzzing should run in isolated environments.

---

# 108. Property-Based Testing

Useful properties:

```text
hashed password is not plaintext
valid password verifies against its hash
random session tokens are not identical
invalid sessions never authenticate
revoked sessions never authenticate
used reset tokens cannot be reused
```

These properties can provide stronger guarantees than a small number of example cases.

---

# 109. Security Regression Suite

Every discovered security bug should become a regression test.

Workflow:

```text
security bug found
      |
      v
fix vulnerability
      |
      v
write regression test
      |
      v
add to CI
```

This prevents the same vulnerability from silently returning later.

---

# 110. Example Security Regression

Suppose a revoked session could still authenticate.

Add:

```text
create session
revoke session
call protected endpoint
assert 401
```

Keep the test permanently.

---

# 111. API Test Matrix

Example:

| Endpoint | Success | Validation | Auth | Security |
|---|---|---|---|---|
| register | ✓ | ✓ | N/A | ✓ |
| login | ✓ | ✓ | N/A | ✓ |
| logout | ✓ | ✓ | ✓ | ✓ |
| me | ✓ | N/A | ✓ | ✓ |
| reset request | ✓ | ✓ | N/A | ✓ |
| reset confirm | ✓ | ✓ | N/A | ✓ |
| password change | ✓ | ✓ | ✓ | ✓ |

---

# 112. Registration Test Matrix

```text
valid
missing email
missing password
invalid email
weak password
oversized email
oversized password
duplicate email
concurrent duplicate
database failure
```

---

# 113. Login Test Matrix

```text
valid credentials
wrong password
unknown account
missing email
missing password
malformed email
expired/revoked session after login
rate limited
database failure
session-store failure
```

---

# 114. Logout Test Matrix

```text
valid session
missing session
invalid session
already revoked session
repeated logout
concurrent logout
session-store failure
```

---

# 115. Password Reset Test Matrix

```text
valid request
invalid email
unknown account
rate limited
provider failure
valid token
expired token
malformed token
replayed token
invalid new password
valid new password
concurrent token use
```

---

# 116. Authorization Test Matrix

```text
unauthenticated
authenticated regular user
authenticated admin
wrong resource owner
correct resource owner
missing role
multiple roles
revoked session
```

---

# 117. Production Smoke Tests

After deployment, run a small safe test suite:

```text
GET /health
registration test if supported
login test account
authenticated request
logout
```

Do not run destructive or high-volume tests against production.

---

# 118. Smoke Test Account

A production synthetic account should be:

```text
dedicated
non-privileged
isolated
monitored
securely credentialed
```

Its password should not be hard-coded in source code.

---

# 119. Deployment Verification

After deployment verify:

```text
application starts
health works
readiness works
database connection works
session store works
login works
logout works
metrics appear
logs appear
traces appear
alerts remain healthy
```

---

# 120. Rollback Verification

A rollback should be tested periodically.

Verify:

```text
previous application version starts
database compatibility remains valid
authentication works
sessions behave correctly
observability remains available
```

Database migrations require particular care because application rollback does not automatically mean database rollback is safe.

---

# 121. Testing Database Backward Compatibility

When a schema changes:

```text
old application + new schema
new application + new schema
```

should be considered.

Prefer migrations that support controlled rolling deployments.

---

# 122. Test Documentation

Every important test suite should document:

```text
purpose
setup
dependencies
how to run
test data
cleanup
expected duration
failure interpretation
```

A test nobody can run is not very useful.

---

# 123. Local Developer Workflow

Recommended:

```bash
npm run typecheck
npm test
npm run build
```

Before opening a pull request:

```bash
npm run typecheck
npm test
npm run build
```

As lint/security tooling is added:

```bash
npm run lint
npm run security
```

---

# 124. Pull Request Testing

Every authentication change should include:

```text
tests for new behavior
regression tests for changed behavior
security impact review
API contract review
```

Examples:

```text
new endpoint -> endpoint tests
new authorization rule -> authorization tests
new session behavior -> session tests
new token behavior -> token tests
```

---

# 125. Review Questions

Before merging authentication changes, ask:

```text
What new state was introduced?
What can go wrong?
What happens without authentication?
What happens with the wrong role?
What happens with expired state?
What happens concurrently?
What happens when dependencies fail?
What sensitive data could enter logs?
What regression test protects this behavior?
```

---

# 126. Test Data Security

Never use:

```text
real passwords
real customer emails
real reset tokens
real session tokens
real API keys
production database dumps
```

unless an approved controlled process explicitly requires it.

Prefer synthetic data.

---

# 127. Production Data Restrictions

Production tests must never casually copy:

```text
users
password hashes
sessions
tokens
audit records
```

into local environments.

If production data is required for an approved investigation, follow the organization's data-handling policy and minimize exposure.

---

# 128. Test Environment Separation

Maintain clear boundaries:

```text
development
testing
staging
production
```

Do not accidentally point automated tests at production.

---

# 129. Environment Guard

Automated tests should detect dangerous configuration such as:

```text
NODE_ENV=production
DATABASE_URL=production
```

and refuse to run destructive tests.

A test suite should fail safely rather than discover too late that it is connected to production.

---

# 130. Integration Environment

A realistic integration environment may contain:

```text
Node.js API
PostgreSQL
Redis
test email provider
observability collector
```

Run it using controlled infrastructure such as:

```text
containers
test services
ephemeral environments
```

---

# 131. Test Containers

Containerized dependencies can provide:

```text
real PostgreSQL
real Redis
repeatable setup
isolated state
```

This is often more representative than mocks.

The project should choose the tooling based on the supported runtime and CI environment.

---

# 132. Mocks vs Real Dependencies

Use mocks for:

```text
rare failures
external providers
unit tests
deterministic edge cases
```

Use real dependencies for:

```text
database integration
Redis integration
transaction behavior
query behavior
connection behavior
```

Do not mock everything.

---

# 133. Contract Tests for External Providers

For email providers or other external systems, test:

```text
request format
authentication
success response
retryable failure
non-retryable failure
timeout
rate limit
```

Use provider sandbox/test modes where available.

---

# 134. Retry Tests

If retries are implemented, test:

```text
temporary failure -> retry
persistent failure -> bounded retries
non-retryable error -> no unnecessary retry
```

Verify that retries do not create duplicate security actions.

---

# 135. Idempotency Tests

For operations that support idempotency:

```text
same request
same idempotency key
```

should not produce duplicate state.

Test:

```text
first request
retry
concurrent duplicate
```

Authentication operations should only use idempotency where the API contract requires it.

---

# 136. Transaction Boundary Tests

Document where transactions begin and end.

Test:

```text
transaction succeeds
transaction rolls back
transaction timeout
deadlock/retry behavior where applicable
```

Avoid long transactions around expensive external calls.

---

# 137. Session Cleanup Tests

If expired sessions are periodically cleaned up, test:

```text
expired session exists
cleanup runs
expired session removed
valid session preserved
```

Cleanup must not delete active sessions.

---

# 138. Audit Event Tests

When audit persistence is implemented:

```text
successful login -> audit event
logout -> audit event
password change -> audit event
role change -> audit event
security-sensitive denial -> audit event where required
```

Test that audit events:

```text
are structured
are timestamped
cannot contain secrets
follow retention rules
```

---

# 139. Observability Tests

Authentication tests should verify telemetry behavior.

Examples:

```text
login failure increments failure metric
server error creates error log
request receives request ID
trace is created when tracing is enabled
password never appears in logs
```

Observability is part of the production behavior.

---

# 140. Test Alert Conditions

For each important alert:

```text
simulate condition
verify alert
verify severity
verify routing
verify runbook
clear condition
verify recovery
```

Alert tests should be performed in a safe environment.

---

# 141. Incident Reproduction Tests

When an incident occurs:

```text
incident
  |
  v
reproduce
  |
  v
write test
  |
  v
fix
  |
  v
verify test
  |
  v
deploy
```

This turns incidents into permanent engineering knowledge.

---

# 142. Testing Checklist

## Functional

- [ ] Registration works.
- [ ] Login works.
- [ ] Logout works.
- [ ] Current-user endpoint works.
- [ ] Password reset works when implemented.
- [ ] Password change works.
- [ ] Authorization works.

## Validation

- [ ] Missing fields rejected.
- [ ] Invalid types rejected.
- [ ] Boundary values tested.
- [ ] Oversized input rejected.
- [ ] Malformed input handled safely.

## Sessions

- [ ] Session creation tested.
- [ ] Session lookup tested.
- [ ] Session revocation tested.
- [ ] Expiration tested.
- [ ] Invalid sessions rejected.
- [ ] Session fixation behavior tested.

## Security

- [ ] Enumeration resistance tested.
- [ ] CSRF strategy tested.
- [ ] CORS tested.
- [ ] Rate limiting tested.
- [ ] Injection defenses tested.
- [ ] Sensitive logging tested.
- [ ] Authorization boundaries tested.

## Reliability

- [ ] Database failure tested.
- [ ] Redis failure tested.
- [ ] Email failure tested.
- [ ] Timeout behavior tested.
- [ ] Retry behavior tested.
- [ ] Concurrency tested.

## CI/CD

- [ ] Typecheck runs.
- [ ] Tests run.
- [ ] Build runs.
- [ ] Security checks run.
- [ ] Secret scanning runs.
- [ ] Production smoke tests defined.

---

# 143. Acceptance Criteria

The authentication implementation should be considered sufficiently tested when:

```text
Core authentication flows pass.
Negative cases pass.
Security boundaries are covered.
Session lifecycle is covered.
Password security is covered.
Authorization is covered.
Dependency failures are tested.
Concurrency risks are tested.
Sensitive data is not leaked through logs.
CI reliably executes the required suites.
Production smoke tests are documented.
Security regressions become permanent tests.
```

---

# 144. Current Reference Implementation Test Status

The current reference implementation already contains integration coverage for the basic authentication API.

The current suite verifies:

```text
health
registration
duplicate registration
invalid input
invalid credentials
login session cookie
authenticated /me
unauthenticated /me
logout revocation
password reset request
404 handling
```

The current project should expand coverage as the implementation gains:

```text
PostgreSQL
Redis
persistent reset tokens
rate limiting
authorization
audit events
production observability
```

---

# 145. Verification Commands

From the authentication implementation directory:

```bash
npm run typecheck
```

Then:

```bash
npm run build
```

Then:

```bash
npm test
```

Expected:

```text
typecheck -> pass
build     -> pass
tests     -> pass
```

---

# 146. Final Testing Architecture

The complete testing model is:

```text
                    Authentication System
                             |
          ┌──────────────────┼──────────────────┐
          |                  |                  |
          v                  v                  v
       Unit Tests       Integration Tests     E2E Tests
          |                  |                  |
          |                  |                  |
          v                  v                  v
     Business Logic      API + Database      Real User Flow
          |                  |                  |
          └──────────────────┼──────────────────┘
                             |
                             v
                    Security Testing
                             |
             ┌───────────────┼───────────────┐
             |               |               |
             v               v               v
        Negative Tests   Concurrency      Failure Tests
             |               |               |
             └───────────────┼───────────────┘
                             |
                             v
                    CI / Deployment Tests
                             |
                             v
                    Production Smoke Tests
```

---

# 147. Final Principle

Authentication testing should not ask only:

```text
"Does login work?"
```

It should ask:

```text
"Does authentication remain correct when input is wrong,
sessions are invalid,
users are unauthorized,
tokens expire,
requests race,
dependencies fail,
attack traffic increases,
deployments change,
and production systems behave unexpectedly?"
```

A strong authentication test suite proves the security model under both normal and abnormal conditions.

The goal is not maximum test count.

The goal is **confidence in the security boundary**.
