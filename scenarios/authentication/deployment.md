# Authentication Deployment

## 1. Purpose

Deployment is the process of moving the authentication service from a developer machine into environments where real users and real systems depend on it.

Authentication deployment must protect:

- credentials
- sessions
- password-reset flows
- user data
- database state
- secrets
- availability
- observability

The deployment design must also support:

```text
repeatable releases
safe configuration
database migrations
health checks
rollback
horizontal scaling
incident response
```

This document defines a production-oriented deployment model for the authentication scenario.

The current reference implementation is intentionally simpler than a production deployment. It currently uses in-memory users and sessions. PostgreSQL, Redis, persistent password-reset tokens, rate limiting, production secret management, and full observability are planned production components.

---

# 2. Deployment Environments

Use separate environments:

```text
Development
     |
     v
Testing / CI
     |
     v
Staging
     |
     v
Production
```

Each environment should have:

- separate configuration
- separate secrets
- separate databases
- separate session stores
- separate observability context
- controlled access

Never use production credentials in development.

Never point automated tests at production.

---

# 3. Environment Responsibilities

## Development

Purpose:

```text
fast local development
```

Characteristics:

- local services
- local database
- debug tooling
- synthetic data
- relaxed developer workflow

Do not weaken security assumptions in application logic simply because development is local.

---

## Testing / CI

Purpose:

```text
automated verification
```

Characteristics:

- ephemeral or isolated dependencies
- synthetic users
- deterministic test data
- no production credentials
- automated test execution

---

## Staging

Purpose:

```text
production-like validation
```

Staging should resemble production in:

- runtime
- database engine
- Redis behavior
- deployment process
- configuration structure
- observability
- authentication flows

Staging should not contain real production user data unless an approved controlled process explicitly requires it.

---

## Production

Purpose:

```text
real user traffic
```

Production requires:

- HTTPS
- managed secrets
- persistent database
- persistent session storage
- rate limiting
- monitoring
- alerting
- backups
- tested deployment process
- rollback strategy

---

# 4. Production Architecture

A production deployment can look like:

```text
                         Internet
                            |
                            v
                    ┌───────────────┐
                    │ Load Balancer │
                    │ / Reverse     │
                    │ Proxy         │
                    └───────┬───────┘
                            |
                    HTTPS / TLS
                            |
             ┌──────────────┴──────────────┐
             |                             |
             v                             v
      ┌─────────────┐              ┌─────────────┐
      │ API Instance│              │ API Instance│
      │     #1      │              │     #2      │
      └──────┬──────┘              └──────┬──────┘
             |                             |
             └──────────────┬──────────────┘
                            |
              ┌─────────────┼─────────────┐
              |             |             |
              v             v             v
        PostgreSQL       Redis        Email Provider
              |
              v
       Backup / Recovery

              API instances
                    |
                    v
             Observability
          Logs / Metrics / Traces
```

The exact infrastructure provider is an implementation choice.

---

# 5. Stateless Application Requirement

Application instances should be stateless where possible.

Do not store production authentication state only in local process memory.

Avoid:

```text
Instance A
  users = memory
  sessions = memory
```

because:

```text
Instance B
  cannot see Instance A state
```

Instead:

```text
API instances
      |
      +--> PostgreSQL
      |
      +--> Redis
```

This enables horizontal scaling.

---

# 6. Persistent Data

Production authentication data should be stored in durable systems.

Typical mapping:

| Data | Production store |
|---|---|
| users | PostgreSQL |
| roles | PostgreSQL |
| user_roles | PostgreSQL |
| audit_events | PostgreSQL or dedicated audit store |
| sessions | Redis and/or PostgreSQL depending on design |
| reset tokens | PostgreSQL |
| rate-limit state | Redis |

The final storage design should match the architecture document.

---

# 7. Infrastructure as Code

Production infrastructure should preferably be reproducible.

Infrastructure may include:

```text
network
load balancer
API service
PostgreSQL
Redis
DNS
TLS
monitoring
secret references
backup configuration
```

Use an approved infrastructure-as-code system when the project grows.

Do not rely on undocumented manual clicks for critical infrastructure.

---

# 8. Containerization

The Node.js authentication service can be packaged as a container.

Conceptual flow:

```text
Source code
    |
    v
npm install
    |
    v
TypeScript build
    |
    v
production image
    |
    v
container registry
    |
    v
deployment platform
```

The production image should contain only what is required to run the service.

---

# 9. Multi-Stage Docker Build

A multi-stage build can separate:

```text
build dependencies
```

from:

```text
runtime dependencies
```

Conceptual stages:

```text
Stage 1:
Node.js
TypeScript
dev dependencies
build

Stage 2:
Node.js runtime
production dependencies
compiled application
```

Benefits:

- smaller image
- fewer unnecessary packages
- reduced attack surface
- clearer runtime boundary

---

# 10. Container Runtime

The container should:

- run as a non-root user where practical
- expose only required ports
- receive configuration through environment/secret mechanisms
- write logs to stdout/stderr
- avoid storing persistent authentication state locally
- shut down gracefully

Do not bake production secrets into the image.

---

# 11. Docker Ignore Rules

The image build context should exclude:

```text
node_modules
.git
.env
.env.*
coverage
local logs
temporary files
test artifacts
```

Do not accidentally send local secrets to the container builder.

---

# 12. Runtime Configuration

Configuration should be supplied at runtime.

Typical values:

```text
NODE_ENV
PORT
DATABASE_URL
REDIS_URL
TRUSTED_ORIGINS
SESSION_SECRET
COOKIE configuration
EMAIL provider configuration
OBSERVABILITY configuration
```

Never commit production values into source control.

---

# 13. Environment Variable Validation

The application should validate configuration at startup.

Required configuration should fail fast when missing.

Example:

```text
DATABASE_URL missing
```

should result in:

```text
application startup failure
```

rather than:

```text
application starts
requests fail unpredictably
```

---

# 14. Fail-Fast Configuration

Configuration validation should check:

```text
required variables exist
URLs are valid
ports are valid
environment is recognized
security-sensitive values meet minimum requirements
```

Do not silently replace missing production secrets with insecure defaults.

---

# 15. Secrets Management

Production secrets should be stored in a dedicated secret-management system or equivalent secure mechanism.

Examples of secret categories:

```text
database credentials
Redis credentials
session secret
email provider credentials
cloud credentials
API keys
encryption keys
```

The application should receive secrets at runtime.

---

# 16. Secret Rotation

Secrets should be rotatable.

Plan rotation for:

```text
database credentials
Redis credentials
session secrets
email provider keys
API credentials
encryption keys
```

Rotation must be designed so it does not unexpectedly log out every user unless that is the intended security behavior.

---

# 17. Session Secret Rotation

If sessions depend on a signing/encryption secret, define a rotation strategy.

Possible strategy:

```text
current secret
+
previous secret during transition
```

Then:

```text
new sessions -> current
existing sessions -> accepted according to migration policy
```

If the implementation uses opaque random session tokens stored server-side, the rotation requirements differ.

The session architecture must define this explicitly.

---

# 18. Secret Exposure Prevention

Do not place secrets in:

```text
Git
Dockerfiles
Docker image layers
logs
error responses
client-side JavaScript
URLs
query parameters
source maps
```

Production configuration should be inspected before release.

---

# 19. HTTPS

Production authentication traffic must use HTTPS.

TLS protects:

```text
credentials
session cookies
reset requests
API responses
```

The public deployment should redirect or reject insecure HTTP according to the infrastructure policy.

---

# 20. TLS Termination

TLS may terminate at:

```text
load balancer
reverse proxy
edge gateway
```

The architecture must correctly propagate the original security context to the application.

If the application determines whether cookies should be secure based on proxy headers, trusted-proxy configuration must be correct.

---

# 21. Secure Cookies in Production

Production authentication cookies should normally use:

```text
HttpOnly
Secure
SameSite according to deployment needs
Path=/
```

Cookie domain should be scoped as narrowly as practical.

Avoid unnecessarily broad:

```text
Domain=.example.com
```

because it increases the scope of the cookie.

---

# 22. Reverse Proxy

A reverse proxy or load balancer may handle:

```text
TLS
routing
health checks
connection management
rate limiting
request size limits
```

The application should still enforce application-level security controls.

Do not assume the proxy replaces:

```text
authentication
authorization
input validation
CSRF protection
```

---

# 23. Trusted Proxy Configuration

If the application is behind a proxy, configure trusted proxy behavior deliberately.

This affects information such as:

```text
client IP
protocol
secure request detection
```

Never blindly trust arbitrary forwarding headers from untrusted clients.

---

# 24. DNS

Production DNS should point users to the approved edge/load-balancing layer.

Example:

```text
auth.example.com
       |
       v
load balancer
       |
       v
API service
```

Avoid exposing internal service addresses directly.

---

# 25. CORS Configuration

Production CORS should use an explicit allowlist.

Example:

```text
https://app.example.com
```

Avoid:

```text
*
```

for credentialed authentication requests.

The frontend origin and API origin must be intentionally configured.

---

# 26. Database Deployment

PostgreSQL should be deployed as a persistent managed or appropriately operated database.

Requirements:

```text
persistent storage
automated backups
TLS where required
access control
connection limits
monitoring
migration process
recovery process
```

---

# 27. Database Network Access

Restrict database access to trusted application infrastructure.

Avoid making PostgreSQL publicly reachable unless there is a compelling, secured architecture.

Preferred:

```text
Internet
   X
PostgreSQL

API network
   |
   v
PostgreSQL
```

---

# 28. Database Credentials

Use a dedicated application database user.

Avoid using:

```text
postgres superuser
```

for normal application traffic.

Grant only required permissions.

---

# 29. Database Encryption

Use encryption:

```text
in transit
at rest
```

according to the database provider and organizational security requirements.

The application should use TLS when required by the database deployment.

---

# 30. Database Migrations

Schema changes should be versioned.

Deployment flow:

```text
migration file
     |
     v
review
     |
     v
staging
     |
     v
backup / readiness
     |
     v
production migration
     |
     v
application deployment
```

The exact order depends on whether the migration is backward compatible.

---

# 31. Expand-and-Contract Migrations

Prefer backward-compatible database changes for rolling deployments.

Example:

```text
1. Add new nullable column
2. Deploy code that supports both states
3. Backfill data
4. Switch application behavior
5. Enforce new constraint
6. Remove old column later
```

Avoid migrations that require every application instance to upgrade simultaneously.

---

# 32. Migration Safety

Before production migration:

```text
backup exists
migration tested
rollback strategy documented
expected duration known
locking impact understood
monitoring active
```

Never run an unknown migration blindly against production.

---

# 33. Migration and Rollback

Database rollback is not always equivalent to application rollback.

Example:

```text
Application v2
    |
    v
Database migration v2
```

Rolling application back to v1 may fail if the schema is no longer compatible.

Prefer:

```text
backward-compatible migrations
```

so application rollback remains possible.

---

# 34. Database Backups

Backups should be:

```text
automated
encrypted
monitored
tested
```

A backup that has never been restored should not be assumed to be reliable.

---

# 35. Restore Testing

Periodically test:

```text
restore database
verify schema
verify required authentication data
verify application compatibility
```

Recovery testing should be part of the operational process.

---

# 36. Redis Deployment

Redis may be used for:

```text
sessions
rate limiting
short-lived state
distributed coordination
```

Production Redis requires:

```text
persistence strategy where required
authentication
network restrictions
TLS where required
memory limits
monitoring
backup/recovery strategy where data durability matters
```

---

# 37. Redis Failure Policy

The application must explicitly define behavior when Redis is unavailable.

For sessions:

```text
Do not accidentally authenticate without session verification.
```

For rate limiting:

```text
Do not silently assume unlimited authentication attempts unless the security policy explicitly allows degraded behavior.
```

Failure behavior should be tested.

---

# 38. Email Provider Deployment

Password reset may depend on an external email provider.

Production configuration should include:

```text
provider credentials
sender identity
timeouts
retry policy
rate limits
monitoring
```

Do not store email provider credentials in source code.

---

# 39. Email Delivery Safety

Password reset emails should:

```text
use HTTPS reset links
expire tokens
use single-use tokens
avoid exposing account existence
```

Do not place sensitive credentials into email.

---

# 40. Application Startup

Startup should follow a controlled sequence.

Conceptual:

```text
process starts
   |
   v
load configuration
   |
   v
validate configuration
   |
   v
initialize logging
   |
   v
initialize telemetry
   |
   v
initialize dependencies
   |
   v
start HTTP server
   |
   v
mark ready
```

Do not mark the instance ready before required dependencies are usable.

---

# 41. Graceful Shutdown

On shutdown:

```text
stop accepting new traffic
        |
        v
finish in-flight requests
        |
        v
close database connections
        |
        v
close Redis connections
        |
        v
flush important telemetry
        |
        v
exit
```

The shutdown timeout must be bounded.

---

# 42. Container Signals

The application should correctly handle termination signals such as:

```text
SIGTERM
SIGINT
```

A container orchestrator may send `SIGTERM` before forcefully terminating the process.

Graceful shutdown prevents:

```text
dropped requests
partial operations
connection leaks
```

---

# 43. Health Checks

The deployment should use:

```text
liveness
readiness
```

Liveness:

```text
Is the process alive?
```

Readiness:

```text
Can this instance safely receive traffic?
```

The current reference implementation includes:

```text
GET /health
```

for basic health verification.

---

# 44. Load Balancer Health Checks

The load balancer should remove unhealthy instances from traffic.

Example:

```text
Instance A -> healthy -> traffic
Instance B -> unhealthy -> removed
Instance C -> healthy -> traffic
```

Health checks must be lightweight.

---

# 45. Readiness During Startup

An instance should not receive production traffic while:

```text
configuration is incomplete
required database connection is unavailable
critical session dependency is unavailable
```

if those dependencies are required for safe operation.

---

# 46. Horizontal Scaling

The authentication API should support multiple instances:

```text
API #1
API #2
API #3
```

Shared state must live outside individual processes.

Use:

```text
PostgreSQL
Redis
```

for persistent/distributed state as defined by the architecture.

---

# 47. Session Affinity

Avoid depending on sticky sessions when possible.

Bad architecture:

```text
User -> Instance A
       session exists only in A
```

Better:

```text
User -> Load Balancer
       |
       +--> Instance A
       +--> Instance B
       +--> Instance C

All instances -> shared session store
```

This improves resilience and scaling.

---

# 48. Deployment Strategies

Possible strategies:

```text
rolling deployment
blue/green deployment
canary deployment
```

The appropriate strategy depends on platform maturity and traffic requirements.

---

# 49. Rolling Deployment

Example:

```text
A A A
```

becomes:

```text
B A A
```

then:

```text
B B A
```

then:

```text
B B B
```

Each new instance must pass health/readiness checks before receiving traffic.

---

# 50. Blue/Green Deployment

Two environments:

```text
Blue -> current
Green -> new
```

Test Green.

Then switch traffic:

```text
Blue
  X

Green
  |
  v
Users
```

Rollback can switch traffic back if the database and application versions remain compatible.

---

# 51. Canary Deployment

Start with a small percentage:

```text
95% -> old
5%  -> new
```

Monitor:

```text
5xx
latency
login success
database errors
Redis errors
resource usage
```

Increase traffic only when predefined criteria are satisfied.

---

# 52. Deployment Gates

Before increasing traffic, check:

```text
health
error rate
latency
security metrics
dependency health
resource usage
logs
traces
```

Deployment decisions should use predefined criteria.

---

# 53. CI/CD Pipeline

A production pipeline may be:

```text
git push
   |
   v
CI
   |
   +--> typecheck
   +--> tests
   +--> security checks
   +--> build
   |
   v
container image
   |
   v
registry
   |
   v
staging deployment
   |
   v
smoke tests
   |
   v
production approval
   |
   v
production deployment
```

---

# 54. Artifact Immutability

Build the production artifact once.

Prefer:

```text
build
  |
  v
image: commit-sha
```

then deploy that same artifact to:

```text
staging
production
```

Do not rebuild different artifacts between environments without a clear reason.

---

# 55. Image Tagging

Useful immutable identifiers:

```text
git commit SHA
release version
build ID
```

Avoid using only:

```text
latest
```

because it does not uniquely identify an artifact.

---

# 56. Dependency Locking

Commit:

```text
package-lock.json
```

or the lockfile used by the package manager.

Production builds should use deterministic dependency installation.

For npm:

```bash
npm ci
```

is typically preferred in CI when a valid lockfile exists.

---

# 57. Build Reproducibility

A production build should be reproducible from:

```text
source commit
lockfile
build configuration
```

Document the Node.js version used by the project.

---

# 58. Node.js Runtime

The deployment runtime should use a supported Node.js version.

Pin the intended major version through mechanisms such as:

```text
.nvmrc
package.json engines
container base image
CI configuration
```

Avoid silently changing Node.js versions between environments.

---

# 59. Production Start Command

The compiled application should run using the production command.

Current reference implementation:

```bash
npm run build
npm start
```

The production container should execute the compiled server rather than the TypeScript development runtime.

---

# 60. Development vs Production Commands

Development:

```bash
npm run dev
```

Production:

```bash
npm run build
npm start
```

Do not run:

```text
development watcher
```

as the production process.

---

# 61. Logging in Containers

Containerized applications should normally write logs to:

```text
stdout
stderr
```

The platform can then collect them.

Avoid relying on local container files for primary production logging.

---

# 62. Log Format

Production logs should be machine-readable:

```json
{
  "level": "info",
  "event": "auth.login.success",
  "request_id": "req_123",
  "service": "auth-api"
}
```

This supports centralized collection and search.

---

# 63. Metrics in Production

Production metrics should monitor:

```text
HTTP rate
HTTP errors
HTTP latency
login success
login failures
rate limits
sessions
database
Redis
CPU
memory
```

These metrics should be available before a major production incident occurs.

---

# 64. Tracing in Production

Distributed tracing should allow:

```text
request
  |
  +--> auth service
  +--> PostgreSQL
  +--> Redis
  +--> email provider
```

Sensitive authentication data must never be included in spans.

---

# 65. Deployment Observability

During release monitor:

```text
5xx
p95/p99
login failures
session errors
database latency
Redis latency
CPU
memory
restart count
```

Compare against the pre-deployment baseline.

---

# 66. Production Configuration Checklist

Before deployment verify:

```text
NODE_ENV=production
HTTPS enabled
secure cookies enabled
trusted origins configured
database configured
Redis configured
secrets injected
debug logging disabled
rate limiting enabled
health checks configured
observability enabled
```

---

# 67. CORS Production Checklist

Verify:

```text
only trusted frontend origins allowed
credentials policy intentional
preflight works
disallowed origins rejected
```

Never copy development CORS configuration into production without review.

---

# 68. Database Migration Checklist

Before migration:

```text
backup verified
migration reviewed
staging migration passed
lock impact understood
rollback/recovery plan documented
monitoring active
```

After migration:

```text
schema verified
application healthy
queries healthy
authentication flow tested
```

---

# 69. Production Deployment Checklist

## Application

- [ ] Correct release artifact.
- [ ] Correct Node.js runtime.
- [ ] Production command used.
- [ ] No development watcher.
- [ ] Configuration validated.
- [ ] Secrets injected securely.

## Security

- [ ] HTTPS enabled.
- [ ] Secure cookies enabled.
- [ ] HttpOnly cookies enabled.
- [ ] CORS allowlist configured.
- [ ] CSRF strategy enabled where required.
- [ ] Rate limiting enabled.
- [ ] Security headers enabled.
- [ ] No secrets in image or logs.

## Data

- [ ] PostgreSQL available.
- [ ] Redis available.
- [ ] Migrations verified.
- [ ] Backups verified.
- [ ] Recovery process documented.

## Observability

- [ ] Logs available.
- [ ] Metrics available.
- [ ] Traces available.
- [ ] Health checks work.
- [ ] Alerts configured.
- [ ] Dashboards available.

## Reliability

- [ ] Multiple instances where required.
- [ ] Load balancer configured.
- [ ] Readiness configured.
- [ ] Graceful shutdown tested.
- [ ] Rollback process documented.

---

# 70. Pre-Deployment Verification

Run locally/CI:

```bash
npm ci
npm run typecheck
npm test
npm run build
```

Then verify:

```text
production artifact starts
health endpoint works
configuration validation works
```

---

# 71. Staging Verification

In staging run:

```text
registration
login
/me
logout
password reset
password change
authorization
rate limiting
health
readiness
```

Also verify:

```text
logs
metrics
traces
alerts
```

---

# 72. Production Smoke Test

After deployment:

```text
health
synthetic login
authenticated request
logout
```

Use a dedicated test account.

Do not perform destructive operations.

---

# 73. Rollback Triggers

A rollback may be considered when predefined conditions occur, such as:

```text
sustained 5xx increase
authentication failures caused by release
severe latency regression
session corruption
security regression
critical dependency incompatibility
```

The decision should follow the incident/deployment policy rather than an arbitrary single metric.

---

# 74. Rollback Procedure

Conceptual:

```text
detect issue
    |
    v
stop rollout
    |
    v
assess impact
    |
    v
rollback application artifact
    |
    v
verify health
    |
    v
verify authentication
    |
    v
verify metrics/logs
    |
    v
investigate root cause
```

Database changes require separate compatibility analysis.

---

# 75. Emergency Rollback

Emergency procedures should be documented before they are needed.

Keep available:

```text
previous known-good artifact
previous configuration
deployment commands
rollback permissions
runbook
on-call contacts
```

Do not discover the rollback process during a major outage.

---

# 76. Database Rollback Warning

Never assume:

```text
application rollback = database rollback
```

A database migration may be irreversible or unsafe to reverse.

Prefer forward-compatible remediation where possible.

---

# 77. Zero-Downtime Deployment

To approach zero downtime:

```text
multiple instances
health checks
readiness gates
graceful shutdown
backward-compatible migrations
rolling deployment
```

The exact availability achieved depends on infrastructure and dependencies.

---

# 78. Connection Draining

During deployment, stop routing new requests to an instance before terminating it.

Allow active requests to finish within a bounded grace period.

This reduces:

```text
connection resets
partial requests
failed authentication attempts
```

---

# 79. Autoscaling

Authentication services may scale based on:

```text
CPU
request rate
request latency
concurrency
custom metrics
```

Password verification can be CPU-intensive, so CPU-based scaling may be particularly relevant.

Autoscaling should be load-tested.

---

# 80. Autoscaling Safety

Do not let autoscaling create uncontrolled infrastructure costs.

Define:

```text
minimum instances
maximum instances
scale-up policy
scale-down policy
cooldown behavior
```

The maximum should protect against runaway load.

---

# 81. Database Connection Pooling

Each API instance may maintain database connections.

If:

```text
instances = 20
pool size = 20
```

then potential connections can approach:

```text
400
```

The database must be sized accordingly.

Connection pooling must be planned together with horizontal scaling.

---

# 82. Redis Connection Scaling

The same principle applies to Redis.

Monitor:

```text
connections
latency
memory
throughput
```

Do not create excessive connections per API instance.

---

# 83. Resource Limits

Containers should have documented:

```text
CPU requests
CPU limits
memory requests
memory limits
```

Avoid unlimited memory growth.

Password hashing can make CPU capacity particularly important.

---

# 84. Node.js Memory

Monitor:

```text
heap usage
RSS
GC
event-loop delay
container memory
```

A memory limit should be compatible with Node.js heap configuration.

---

# 85. Security at the Edge

The edge layer can provide:

```text
TLS
request size limits
basic network filtering
DDoS protection
connection controls
```

But application security remains necessary.

---

# 86. DDoS Considerations

Authentication endpoints can be abused for:

```text
credential attacks
resource exhaustion
password-reset spam
request floods
```

Layer defenses:

```text
edge protection
rate limiting
application validation
resource limits
monitoring
```

Do not rely on one control.

---

# 87. Deployment Access Control

Only authorized personnel/systems should be able to:

```text
deploy production
read secrets
modify database
change authentication configuration
```

Use:

```text
least privilege
MFA
short-lived credentials where practical
audit logging
```

---

# 88. CI Credentials

CI should receive only the credentials required for its task.

Examples:

```text
build credential
registry credential
deployment credential
```

Do not provide CI with unrestricted production database access unless absolutely required.

---

# 89. Production Database Access

Application runtime credentials should not automatically grant engineers interactive database access.

Separate:

```text
application access
administrative access
incident-response access
```

All sensitive access should be controlled and audited.

---

# 90. Release Versioning

Use explicit release identifiers.

Example:

```text
v1.4.0
```

or:

```text
commit SHA
```

Record the deployed version in observability metadata.

---

# 91. Release Notes

Authentication releases should document:

```text
new behavior
security changes
database migrations
configuration changes
dependency changes
rollback considerations
```

Security-sensitive changes should be clearly identified internally.

---

# 92. Dependency Updates

Before updating dependencies:

```text
install update
run tests
run security scan
build
run integration tests
staging deployment
```

Do not blindly upgrade authentication libraries in production.

---

# 93. Argon2 Updates

Password hashing dependencies deserve special care.

After updating:

```text
verify existing hashes
test login
test new password hashing
measure CPU/latency
```

Existing password hashes should remain compatible according to the chosen library and algorithm policy.

---

# 94. Cookie Configuration Changes

Cookie changes can break authentication without causing obvious server failures.

After changing cookie settings test:

```text
login
cookie storage
authenticated request
logout
cross-origin behavior
HTTPS behavior
```

---

# 95. CORS Changes

After modifying trusted origins:

```text
allowed frontend -> works
untrusted frontend -> blocked
credentialed request -> expected behavior
preflight -> expected behavior
```

Test both browser and API behavior.

---

# 96. Secret Rotation Deployment

A safe rotation flow:

```text
prepare new secret
     |
     v
deploy compatible version
     |
     v
switch secret
     |
     v
verify authentication
     |
     v
retire old secret
```

The exact sequence depends on whether the secret supports overlapping validity.

---

# 97. Disaster Recovery

Document recovery for:

```text
API outage
database outage
Redis outage
region outage where applicable
secret loss
bad deployment
corrupted data
```

Authentication recovery is especially important because users may be unable to access the rest of the product.

---

# 98. Recovery Objectives

Define:

```text
RTO - Recovery Time Objective
RPO - Recovery Point Objective
```

These should be product/infrastructure decisions.

Example:

```text
RTO: target time to restore service
RPO: acceptable amount of recoverable data loss
```

Do not treat illustrative values as universal requirements.

---

# 99. Disaster Recovery Testing

Periodically simulate:

```text
database restore
application redeployment
secret recovery
Redis recovery
DNS/edge recovery
```

Measure actual recovery time.

---

# 100. Backup Security

Backups may contain highly sensitive authentication data.

Protect them with:

```text
encryption
access control
retention policy
audit logging
secure deletion policy
```

Do not expose backup URLs publicly.

---

# 101. Production Incident Deployment Freeze

During a major incident, uncontrolled deployments can make diagnosis harder.

A deployment freeze may be appropriate while:

```text
incident is active
root cause is unknown
recovery is underway
```

Emergency security fixes are an explicit exception under the incident policy.

---

# 102. Post-Deployment Verification

After every significant authentication deployment:

```text
check health
check error rate
check latency
check login success
check session behavior
check database
check Redis
check logs
check traces
```

Record deployment outcome.

---

# 103. Post-Deployment Monitoring Window

For significant releases, monitor closely during an initial observation period.

Watch:

```text
5xx
login failures
latency
session errors
resource usage
dependency health
```

The observation period should be appropriate to traffic and risk.

---

# 104. Deployment Security Checklist

- [ ] Production secrets are external to source code.
- [ ] Secrets are not baked into container images.
- [ ] HTTPS is enabled.
- [ ] Secure cookies are enabled.
- [ ] Trusted origins are explicit.
- [ ] Database access is restricted.
- [ ] Redis access is restricted.
- [ ] Production deployment requires authorized access.
- [ ] CI credentials are least-privileged.
- [ ] Dependency lockfile is used.
- [ ] Security scanning runs.
- [ ] Logs contain no credentials.

---

# 105. Operational Checklist

- [ ] Backups are automated.
- [ ] Restore procedure is tested.
- [ ] Health checks work.
- [ ] Readiness checks work.
- [ ] Graceful shutdown works.
- [ ] Multiple instances can run.
- [ ] Session state is shared.
- [ ] Database migrations are controlled.
- [ ] Rollback is documented.
- [ ] Dashboards exist.
- [ ] Alerts exist.
- [ ] Runbooks exist.

---

# 106. Current Reference Implementation Deployment Status

The current reference implementation is intentionally local/reference-oriented.

Currently available:

```text
Node.js + TypeScript
Express
npm build
npm start
health endpoint
environment configuration
request IDs
basic security middleware
```

Not yet production-complete:

```text
PostgreSQL
Redis
persistent sessions
persistent reset tokens
distributed rate limiting
production secret manager
container image
production TLS
load balancer
readiness endpoint
full metrics
distributed tracing
production alerting
automated deployment
backup/recovery infrastructure
```

These gaps are intentional and should be closed before treating the reference implementation as production-ready.

---

# 107. Local Deployment

For local development:

```bash
npm install
npm run dev
```

For a production-like local build:

```bash
npm ci
npm run build
npm start
```

Then:

```bash
curl http://127.0.0.1:4000/health
```

Expected:

```json
{
  "data": {
    "status": "ok"
  }
}
```

---

# 108. Local Environment Safety

The local `.env` file should remain untracked.

Use:

```text
.env.example
```

to document required variables.

Do not commit:

```text
.env
.env.production
real secrets
```

---

# 109. Staging Environment Safety

Staging should use:

```text
staging database
staging Redis
staging email provider
staging secrets
staging observability
```

Do not accidentally send staging password-reset emails to real users.

Use a test/sandbox email provider or controlled recipient policy.

---

# 110. Production Email Safety

Before enabling password reset in production verify:

```text
sender domain configured
SPF/DKIM/DMARC as applicable
provider credentials valid
reset links use production HTTPS
reset tokens expire
delivery metrics exist
```

---

# 111. Deployment Failure Scenarios

## Failure: Application does not start

Check:

```text
configuration
Node.js version
dependency installation
build output
startup logs
```

---

## Failure: Health check fails

Check:

```text
process
port
routing
load balancer target
container configuration
```

---

## Failure: Database connection fails

Check:

```text
DATABASE_URL
network
credentials
TLS
database availability
connection limits
```

---

## Failure: Sessions fail

Check:

```text
Redis availability
session configuration
cookie configuration
proxy behavior
session schema/state
```

---

# 112. Deployment Failure: Cookies Not Working

Check:

```text
HTTPS
Secure
HttpOnly
SameSite
Domain
Path
CORS
credentials mode
trusted proxy configuration
```

Do not immediately disable security flags to "make it work."

Identify the deployment mismatch.

---

# 113. Deployment Failure: CORS

Check:

```text
frontend origin
API origin
trusted origins configuration
preflight
credentials
proxy behavior
```

Avoid broadening CORS as the first response.

---

# 114. Deployment Failure: Migration

If a migration fails:

```text
stop rollout
inspect migration state
protect database
follow migration runbook
```

Do not blindly rerun unknown statements.

Determine whether the migration is:

```text
partially applied
fully applied
transactionally rolled back
```

before taking action.

---

# 115. Deployment Failure: Bad Release

If authentication breaks after deployment:

```text
stop rollout
compare metrics
inspect traces
check recent code/config changes
rollback if criteria are met
verify authentication
```

Then create a regression test for the failure.

---

# 116. Production Change Management

Important authentication changes should be reviewed.

Examples:

```text
cookie policy
session behavior
password hashing
password reset
rate limiting
CORS
CSRF
database schema
authorization
secrets
```

These changes can affect both security and availability.

---

# 117. Separation of Duties

Where organizationally appropriate:

```text
developer writes change
CI validates change
authorized deployment process releases change
```

High-risk production access should not depend on one shared credential.

---

# 118. Deployment Audit Trail

Record:

```text
who/what deployed
when
version
environment
result
rollback if any
```

This should integrate with the organization's deployment platform.

---

# 119. Production Readiness Criteria

The authentication service should not be called production-ready until:

```text
persistent storage is implemented
session storage is production-safe
reset tokens are persistent and secure
rate limiting is distributed where required
secrets are externally managed
HTTPS is configured
database backups exist
health/readiness checks exist
observability is operational
CI/CD is reliable
rollback is tested
security tests pass
```

---

# 120. Final Deployment Architecture

```text
                         Users
                           |
                           v
                    ┌───────────────┐
                    │ DNS / Edge    │
                    └───────┬───────┘
                            |
                            v
                    ┌───────────────┐
                    │ Load Balancer │
                    │ TLS / Health  │
                    └───────┬───────┘
                            |
                ┌───────────┴───────────┐
                |                       |
                v                       v
        ┌─────────────┐         ┌─────────────┐
        │ Auth API #1 │         │ Auth API #2 │
        └──────┬──────┘         └──────┬──────┘
               |                       |
               └───────────┬───────────┘
                           |
             ┌─────────────┼─────────────┐
             |             |             |
             v             v             v
       PostgreSQL       Redis         Email
             |
             v
        Backups / DR

             All services
                   |
                   v
          Logs / Metrics / Traces
                   |
                   v
             Alerting / SRE
```

---

# 121. Final Deployment Principle

A production deployment is not simply:

```bash
npm run build
npm start
```

A production authentication deployment is a controlled system:

```text
secure configuration
      +
persistent data
      +
secure networking
      +
safe sessions
      +
controlled migrations
      +
health checks
      +
observability
      +
automated testing
      +
rollback
      +
recovery
```

The goal is not merely to get the server online.

The goal is to make authentication **secure, repeatable, observable, recoverable, and horizontally scalable**.
