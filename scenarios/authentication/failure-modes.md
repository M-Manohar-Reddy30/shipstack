# Authentication Failure Modes and Recovery

## 1. Purpose

This document defines how the authentication system should behave when components fail.

The objective is not to eliminate every failure.

The objective is to make failures:

- detectable
- bounded
- understandable
- recoverable
- observable
- secure

A production authentication system must assume that dependencies will eventually fail.

The important engineering question is:

> What happens when each dependency fails, and does the system fail safely?

---

# 2. Scope

This document covers failures involving:

- API instances
- load balancers
- PostgreSQL
- PostgreSQL replicas
- Redis
- sessions
- password hashing
- password reset
- email providers
- queues
- background workers
- rate limiting
- network communication
- DNS
- TLS
- secrets/configuration
- deployments
- migrations
- observability systems
- external dependencies
- data corruption
- security incidents
- regional outages

It also provides:

- detection signals
- immediate response
- recovery actions
- user impact
- security considerations
- prevention measures
- incident questions

---

# 3. Failure-Handling Principles

## Principle 1: Fail closed for security-sensitive decisions

When the system cannot safely determine whether an authentication or authorization decision is valid, rejecting the request is often safer than accepting it.

The exact policy must be defined per operation.

## Principle 2: Do not fake success

If a required write did not complete successfully, do not return a successful response merely because the application wants to appear available.

## Principle 3: Bound failure propagation

One failed dependency should not automatically consume all application resources.

Use:

- timeouts
- bounded retries
- circuit breakers where appropriate
- connection limits
- queue limits
- concurrency limits

## Principle 4: Preserve evidence

During an incident, retain:

- request IDs
- timestamps
- error logs
- relevant metrics
- audit events
- deployment information

Avoid logging secrets or raw credentials.

## Principle 5: Recover deliberately

Recovery should be based on known procedures rather than improvisation.

## Principle 6: Test failures

A failure mode that has never been tested is only theoretically understood.

---

# 4. Failure Classification

Failures can be classified into several groups.

### Application failures

Examples:

- process crash
- memory leak
- uncaught exception
- incorrect deployment

### Dependency failures

Examples:

- PostgreSQL unavailable
- Redis unavailable
- email provider unavailable

### Network failures

Examples:

- packet loss
- connection timeout
- DNS failure
- TLS failure

### Data failures

Examples:

- corrupted data
- migration error
- inconsistent state

### Capacity failures

Examples:

- CPU saturation
- memory exhaustion
- connection exhaustion
- queue overload

### Security failures

Examples:

- credential stuffing
- compromised session
- secret exposure
- suspicious authentication activity

---

# 5. Failure Severity

A practical incident classification can use impact rather than arbitrary labels.

## Low impact

Examples:

- one non-critical worker unavailable
- delayed analytics
- isolated email delay

## Moderate impact

Examples:

- elevated authentication latency
- partial password-reset delay
- degraded session validation

## High impact

Examples:

- registration unavailable
- login failures for a significant population
- session validation outage

## Critical security impact

Examples:

- unauthorized authentication
- session validation accepting revoked credentials
- password data exposure
- reset-token compromise

Security impact should be assessed independently from availability impact.

---

# 6. Failure-Mode Table

| Component | Failure | User impact | Safe response |
|---|---|---|---|
| API | process crash | some requests fail | load balancer removes instance |
| API | all instances fail | service unavailable | restore capacity |
| PostgreSQL | unavailable | most auth writes fail | fail safely and recover DB |
| Redis | unavailable | sessions/rate limits affected | follow explicit fallback policy |
| Email | unavailable | reset/verification delayed | queue and retry |
| Queue | unavailable | async work delayed | preserve request where possible |
| Worker | crash | async delay | restart/retry |
| Replica | lagging | stale reads | route consistency-sensitive reads safely |
| Network | timeout | elevated latency/errors | bounded timeouts/retries |
| DNS | failure | service unreachable | restore DNS path |
| Secret | unavailable | startup/runtime failure | restore secret access |
| Migration | failure | deployment risk | stop rollout and reconcile |
| Rate limiter | failure | abuse-control risk | fail according to policy |
| Observability | failure | reduced visibility | continue core service if safe |

---

# 7. API Instance Crash

## Scenario

One API instance crashes unexpectedly.

Example:

```text
Load Balancer
   |
   +-- API-1  X
   +-- API-2
   +-- API-3
```

## Expected behavior

The load balancer should detect that API-1 is unhealthy and stop routing new traffic to it.

Traffic continues:

```text
Load Balancer
   |
   +-- API-2
   +-- API-3
```

## User impact

Some in-flight requests may fail.

New requests should continue if enough capacity remains.

## Recovery

1. detect failed health check
2. remove instance from rotation
3. collect crash information
4. restart or replace instance
5. verify readiness
6. return it to service

## Prevention

Use:

- process supervision
- health checks
- readiness checks
- autoscaling
- graceful shutdown
- centralized logs

---

# 8. All API Instances Fail

## Scenario

Every application instance becomes unavailable.

Possible causes:

- bad deployment
- shared configuration failure
- infrastructure outage
- process-wide bug
- resource exhaustion

## Impact

Authentication API becomes unavailable.

## Response

1. identify common cause
2. stop further deployment changes
3. restore known-good version if deployment-related
4. restore infrastructure capacity
5. verify database connectivity
6. verify Redis if required
7. verify health and readiness
8. run authentication smoke tests
9. gradually restore traffic

## Important

Do not repeatedly restart all instances without understanding the common failure.

---

# 9. Load Balancer Failure

A load balancer can become a single point of failure if not deployed redundantly.

## Symptoms

- all API instances healthy
- clients cannot reach service
- edge errors increase
- health checks may still show application health

## Response

Use the infrastructure provider's redundant load-balancing capability where available.

If multiple edge layers exist, verify:

```text
DNS
  |
WAF
  |
Load Balancer
  |
API
```

one layer at a time.

---

# 10. PostgreSQL Unavailable

PostgreSQL is a critical dependency.

## Impact

Potentially unavailable operations include:

- registration
- login if session/account lookup requires PostgreSQL
- password changes
- password-reset confirmation
- authorization lookups
- audit persistence

## Expected behavior

The API should:

- use bounded database timeouts
- stop waiting indefinitely
- return controlled server errors
- avoid claiming successful writes
- avoid retry storms

## Recovery

1. verify database health
2. determine whether issue is network, capacity, failover, or database process
3. inspect connections and locks
4. check provider/cluster status
5. fail over if appropriate
6. verify data consistency
7. restore traffic gradually

---

# 11. PostgreSQL Connection Exhaustion

## Scenario

The database is healthy, but all connections are occupied.

Symptoms:

- connection acquisition latency increases
- requests queue
- API latency increases
- database CPU may not be saturated

## Common causes

- oversized application pools
- connection leaks
- long transactions
- too many API instances
- background workers consuming connections

## Response

1. inspect active connections
2. identify connection owners
3. check transaction duration
4. reduce excessive concurrency
5. terminate clearly abandoned connections if safe
6. correct pool configuration
7. verify recovery

## Prevention

Maintain a documented connection budget.

---

# 12. Slow PostgreSQL Queries

## Symptoms

- p95/p99 latency increases
- DB CPU rises
- query latency increases
- connection pools become occupied longer

## Response

Inspect:

- slow query logs
- query plans
- indexes
- lock waits
- recent deployments
- data growth

Do not immediately increase database size without understanding the query.

---

# 13. PostgreSQL Lock Contention

A long-running transaction can block other operations.

Example:

```text
Transaction A
   |
locks row/table
   |
Transaction B waits
   |
Transaction C waits
```

## Symptoms

- query latency spikes
- waiting transactions increase
- API timeout rate increases

## Response

1. identify blocking transaction
2. determine whether it is safe to terminate
3. inspect application behavior
4. roll back unsafe work if required
5. verify lock queue drains

## Prevention

- short transactions
- correct indexes
- careful migrations
- bounded operations

---

# 14. PostgreSQL Primary Failure

If the primary database fails, a standby may be promoted.

Conceptually:

```text
Primary X

Standby
   |
   v
Promote
   |
New Primary
```

## Recovery requirements

Document:

- who triggers failover
- whether failover is automatic
- how applications discover the new primary
- how connections are refreshed
- how replication state is verified

---

# 15. PostgreSQL Replica Failure

A read replica can fail without necessarily affecting writes.

## Response

1. remove unhealthy replica from read routing
2. continue using primary or healthy replicas
3. investigate replica
4. rejoin after validation

Do not route security-sensitive reads to an unhealthy or stale replica.

---

# 16. Replication Lag

## Scenario

Primary receives a password change.

Replica has not caught up.

```text
Primary: new password
Replica: old password
```

## Risk

A security-sensitive read could observe stale state.

## Response

Use an explicit consistency strategy.

Possible approaches:

- read from primary
- use session/read-after-write routing
- wait for replication position
- temporarily remove replica from sensitive reads

---

# 17. Redis Unavailable

Redis may contain:

- sessions
- rate-limit state
- temporary state
- caches

The correct response depends on what Redis stores.

## Session Redis

If session validation requires Redis:

```text
Redis unavailable
      |
Session validation unavailable
```

A carefully designed fallback may use another authoritative store, if supported.

Do not invent a fallback that weakens security.

## Cache Redis

If Redis only contains cache data:

```text
Redis unavailable
      |
Read from source
```

may be acceptable.

---

# 18. Redis Memory Exhaustion

## Symptoms

- memory usage near limit
- evictions
- latency increase
- write failures

## Response

1. identify largest key classes
2. inspect TTL behavior
3. identify unexpected key growth
4. remove accidental/unbounded state if safe
5. increase capacity if justified
6. fix retention behavior

Never assume eviction is harmless for security-critical state.

---

# 19. Redis Hot Key

A hot key may receive unusually high traffic.

## Symptoms

- high command latency
- one key dominates access
- uneven resource use

## Response

Investigate:

- abusive client
- popular account
- inefficient application loop
- repeated unnecessary session reads

Potential mitigations:

- local safe caching
- request coalescing
- traffic controls
- architecture changes

---

# 20. Redis Network Partition

The API may be unable to reach Redis even while Redis itself is healthy.

## Symptoms

- Redis timeout
- connection errors
- authentication requests slowing down

## Response

Use bounded timeouts.

Do not allow every API request to wait indefinitely.

---

# 21. Session Store Failure

Session failures can be security-sensitive.

## Dangerous response

Do not automatically assume:

```text
session store unavailable
=
session valid
```

That could turn infrastructure failure into an authentication bypass.

## Safer approach

Define a fail-closed policy where appropriate.

For example:

```text
Cannot validate session
      |
Reject authenticated request
```

This may reduce availability but protects authentication correctness.

---

# 22. Session Revocation Failure

Suppose a logout request cannot persist revocation.

The server should not claim:

```text
Logout successful
```

unless its security contract permits that behavior.

A secure implementation must define:

- whether cookie clearing occurs
- whether server-side revocation is required
- what happens if persistence fails

---

# 23. Session Expiration Cleanup Failure

Expired sessions may remain stored if cleanup jobs fail.

This does not necessarily mean sessions remain valid.

Validity should be checked using expiration data.

Cleanup is primarily a storage-management operation.

---

# 24. Password Hashing Overload

## Scenario

Login traffic spikes dramatically.

CPU becomes saturated because Argon2 verification is expensive.

## Symptoms

- API CPU near saturation
- login latency increases
- normal requests may also slow
- request queues grow

## Response

1. identify whether traffic is legitimate or abusive
2. apply appropriate rate limits
3. scale compute
4. control hashing concurrency
5. isolate authentication workloads if necessary
6. monitor memory pressure

Do not weaken password hashing as the first response.

---

# 25. Memory Pressure During Password Hashing

Argon2 can consume meaningful memory.

If too many concurrent hash operations run:

```text
High login concurrency
       |
many Argon2 operations
       |
memory pressure
       |
process instability
```

## Mitigation

Use bounded concurrency.

The objective is:

```text
secure hashing
+
controlled resource usage
```

---

# 26. Credential Stuffing Spike

## Scenario

An attacker sends many login attempts using leaked credentials.

## Symptoms

- login failures spike
- traffic from suspicious sources increases
- CPU increases
- account-level failure counts increase

## Response

Use layered controls:

```text
WAF / edge controls
        |
IP/network controls
        |
rate limits
        |
account-aware limits
        |
authentication
```

Avoid relying on one signal only.

---

# 27. Registration Abuse

Attackers may create large numbers of accounts.

## Impact

- database growth
- email costs
- CPU usage
- abuse of downstream features

## Controls

Potential controls:

- rate limits
- bot protection
- email verification
- disposable-email policy where appropriate
- registration quotas
- abuse monitoring

---

# 28. Password Reset Abuse

Attackers may repeatedly request reset emails.

## Risks

- email spam
- provider cost
- user harassment
- queue overload

## Controls

Use:

- per-account limits
- IP/network limits
- cooldowns
- generic responses
- queue controls
- monitoring

Do not reveal whether an account exists.

---

# 29. Email Provider Failure

## Scenario

The external email provider is unavailable.

## Expected behavior

Password-reset request handling should ideally:

1. validate request
2. create appropriate durable state
3. enqueue delivery
4. return according to the API contract

The worker retries delivery.

## Important

If the queue itself is unavailable, the system must have a defined policy.

---

# 30. Email Provider Slowdown

A provider may not be completely down but may respond slowly.

Without timeouts:

```text
worker-1 waits
worker-2 waits
worker-3 waits
...
```

Eventually all workers can become blocked.

Use:

- provider timeouts
- bounded concurrency
- retries with backoff
- circuit breaking where appropriate

---

# 31. Email Delivery Duplicate

A worker may send an email and fail before recording successful completion.

The job can be retried.

This can produce duplicate email.

Design job processing for safe duplicate handling where possible.

For security-sensitive emails, duplicate delivery should not create an additional valid reset token if token creation itself is controlled.

---

# 32. Queue Unavailable

## Scenario

API cannot publish a background job.

The system must decide whether the operation can succeed without the job.

For example:

```text
Analytics event
```

may be dropped or deferred.

But:

```text
Required security workflow
```

may require durable persistence.

The dependency criticality must be documented.

---

# 33. Queue Backlog

## Symptoms

- queue depth increasing
- oldest-job age increasing
- user-visible email delays

## Response

1. compare arrival rate with processing rate
2. check worker health
3. inspect provider latency
4. scale workers if safe
5. control abusive traffic
6. monitor recovery

---

# 34. Worker Crash

Workers should be replaceable.

Expected behavior:

```text
Worker-1 X
Worker-2
Worker-3
```

The queue should retain unacknowledged work according to its semantics.

The job may be retried.

Workers should not acknowledge work before required processing is safely completed.

---

# 35. Poison Message

A job may repeatedly fail because its data is invalid.

Without controls:

```text
job
 |
fail
 |
retry
 |
fail
 |
retry forever
```

Use:

- maximum retry count
- dead-letter queue
- error classification
- operator inspection

---

# 36. Network Timeout

Every external call should have a timeout.

Without one:

```text
request
 |
waiting...
 |
waiting...
 |
resource held
```

Large numbers of waiting requests can exhaust the application.

## Response

Use:

- connect timeout
- response timeout
- overall deadline
- bounded retry

---

# 37. Network Partial Failure

The network may fail only between certain components.

Example:

```text
API -> PostgreSQL  OK
API -> Redis       FAIL
API -> Email       OK
```

This is different from total infrastructure failure.

Observability should identify the dependency-specific failure.

---

# 38. DNS Failure

DNS problems can affect:

- clients reaching the API
- API reaching external services
- service discovery

## Diagnosis

Check:

- DNS resolution
- TTLs
- resolver health
- recent DNS changes
- provider status

Avoid making multiple unrelated DNS changes during an incident.

---

# 39. TLS Failure

Possible causes:

- expired certificate
- incorrect certificate
- hostname mismatch
- trust-chain issue

## Impact

Clients may be unable to connect.

Monitor certificate expiration proactively.

---

# 40. Secret Management Failure

If the application cannot access required secrets:

```text
API startup
    |
secret retrieval
    X
```

The application should not start in an insecure partially configured mode.

## Principle

Missing critical secrets should cause a clear failure.

Do not silently replace production secrets with defaults.

---

# 41. Secret Rotation Failure

During secret rotation, old and new versions may temporarily coexist.

Use compatible rotation procedures where supported.

For example:

```text
Old secret valid
New secret introduced
Applications migrate
Old secret revoked
```

Avoid changing a required secret everywhere simultaneously without a rollback plan.

---

# 42. Configuration Failure

Bad configuration can be more dangerous than code failure.

Examples:

- wrong database URL
- incorrect CORS origin
- disabled secure cookies
- incorrect session TTL
- wrong rate-limit threshold

Validate configuration at startup.

---

# 43. CORS Misconfiguration

A deployment may accidentally reject legitimate browser requests.

Symptoms:

- API works with direct HTTP client
- browser requests fail
- CORS errors appear in browser console

Do not solve CORS problems by allowing every origin.

Fix the explicit allowlist.

---

# 44. Cookie Misconfiguration

Potential failures:

- cookie not sent
- cookie rejected
- cookie unavailable to expected path
- HTTPS mismatch
- incorrect domain

Verify:

- Secure
- HttpOnly
- SameSite
- Path
- Domain where used

Use production HTTPS.

---

# 45. CSRF Configuration Failure

If cookies are used for authentication, CSRF protection must match the deployment model.

A configuration mistake can either:

- block legitimate requests
- expose state-changing requests to cross-site attacks

Test both positive and negative cases.

---

# 46. Password Reset Token Failure

## Token database unavailable

Do not issue a reset flow that cannot be securely persisted.

## Token already consumed

Return a controlled invalid/expired response.

## Token expired

Reject it.

## Token malformed

Reject it without expensive downstream processing.

## Token leaked

Invalidate it where possible and investigate related sessions/account activity according to incident policy.

---

# 47. Password Change Failure

A password change should be transactional.

Potential partial failure:

```text
Password updated
Audit write fails
```

The system must define whether the audit record is required for success.

Security-critical state changes should not leave ambiguous outcomes.

---

# 48. Transaction Failure

If a transaction fails:

```text
BEGIN
  update password
  update session state
  insert audit event
COMMIT
```

the application should know whether the transaction committed.

Never assume success merely because the request reached the database.

---

# 49. Deadlock

Two transactions can wait for each other.

Example:

```text
Transaction A -> lock X -> waits Y
Transaction B -> lock Y -> waits X
```

Database deadlock detection should abort one transaction.

Application behavior should safely retry only operations that are appropriate and idempotent.

---

# 50. Data Corruption

Potential causes:

- software bug
- migration error
- operator error
- infrastructure problem

## Response

1. stop destructive operations if necessary
2. identify affected records
3. preserve evidence
4. determine recovery point
5. restore or repair
6. validate integrity
7. communicate impact

Do not run ad-hoc mass updates before preserving a backup or snapshot when appropriate.

---

# 51. Migration Failure

## Example

A deployment adds a schema change and migration fails halfway.

## Response

1. stop rollout
2. inspect migration state
3. determine whether transaction rollback occurred
4. compare schema with expected state
5. follow documented recovery procedure
6. restore compatibility before resuming deployment

Avoid manually guessing the schema state.

---

# 52. Bad Deployment

A new version causes:

- high error rate
- authentication failures
- latency increase
- database load spike

## Response

1. stop rollout
2. compare new and old versions
3. check recent code/config changes
4. rollback if safe
5. verify health
6. investigate after service stabilization

Recovery first.

Root-cause analysis second.

---

# 53. Rollback Failure

Sometimes rollback itself is unsafe because:

- schema changed incompatibly
- data format changed
- new migration cannot be reversed

This is why deployment compatibility matters.

Use expand-and-contract migrations for high-risk schema changes.

---

# 54. Observability Failure

Metrics or logs may become unavailable during an incident.

The application should not necessarily fail because the telemetry system is down.

For example:

```text
Metrics backend unavailable
       |
authentication continues
```

if security and operational requirements allow.

Avoid blocking the request path on non-critical telemetry.

---

# 55. Logging Failure

Logging pipelines can become unavailable.

Applications should use bounded buffers and avoid unbounded memory growth.

Do not retry log delivery forever inside request handlers.

---

# 56. Audit Logging Failure

Audit logs may be more important than ordinary application logs.

Define whether audit persistence is:

- synchronous
- transactional
- asynchronous
- replicated

Security-critical audit requirements should be explicit.

---

# 57. Monitoring Blind Spot

An outage without telemetry can be difficult to diagnose.

Maintain independent signals where practical:

- external health checks
- application metrics
- database metrics
- infrastructure metrics

The monitoring system should not depend entirely on the service it is monitoring.

---

# 58. Alert Failure

If alert delivery fails, engineers may not know the service is degraded.

Use appropriate redundancy for critical alerting paths.

Verify alert delivery periodically.

---

# 59. Dependency Cascade

Example:

```text
Email provider slows
      |
workers block
      |
queue grows
      |
worker connections increase
      |
database/Redis pressure rises
      |
API latency increases
```

The original failure was email latency, but the final impact can spread across the system.

## Prevention

Use:

- bounded worker concurrency
- timeouts
- circuit breakers where useful
- queue limits
- bulkheads
- resource budgets

---

# 60. Bulkheads

Bulkheads isolate resource pools.

Example:

```text
Authentication requests
      |
Pool A

Email/background work
      |
Pool B
```

If email work becomes overloaded, it should not consume all authentication capacity.

---

# 61. Circuit Breakers

A circuit breaker can temporarily stop calls to a failing dependency.

Conceptually:

```text
Healthy
  |
Failure threshold
  v
Open
  |
cooldown
  v
Half-open
  |
success -> closed
failure -> open
```

Circuit breakers are useful for some external dependencies.

They should not be added blindly.

---

# 62. Retry Storm

Suppose PostgreSQL is slow.

Every request retries immediately.

The database receives even more work.

This can turn a partial outage into a full outage.

Use:

- exponential backoff
- jitter
- retry limits
- request deadlines

---

# 63. Thundering Herd

A popular cache entry or dependency recovers.

Thousands of requests arrive simultaneously.

Potential result:

```text
Cache recovery
    |
10,000 requests
    |
database spike
```

Use:

- request coalescing
- staggered refresh
- rate control
- warmup

where appropriate.

---

# 64. Resource Exhaustion

Resources that can exhaust include:

- CPU
- memory
- database connections
- Redis memory
- file descriptors
- sockets
- worker threads
- queue capacity
- disk space

Monitor all critical resource classes.

---

# 65. Disk Full

A full disk can cause:

- database failures
- log failures
- application crashes
- migration failures

Monitor disk usage and growth rate.

Do not wait for 100% utilization.

---

# 66. File Descriptor Exhaustion

Too many open sockets/files can prevent new connections.

Symptoms:

- connection failures
- "too many open files"
- intermittent network failures

Investigate:

- connection leaks
- worker behavior
- pool configuration
- OS limits

---

# 67. Memory Leak

Symptoms:

- memory grows continuously
- restarts temporarily fix issue
- garbage collection increases
- latency eventually rises

Response:

1. identify process
2. inspect heap/profile
3. reduce blast radius with controlled restarts if necessary
4. fix leak
5. load test after fix

Restarts are mitigation, not root-cause resolution.

---

# 68. Time Synchronization Failure

Authentication relies on time for:

- session expiration
- reset-token expiration
- rate-limit windows
- audit timestamps

Large clock differences can create unexpected behavior.

Infrastructure should maintain reliable time synchronization.

---

# 69. Clock Skew

If:

```text
API clock = 10:00
Database clock = 10:05
```

expiration decisions may behave unexpectedly.

Use consistent time sources and avoid assumptions that clocks are perfectly identical.

---

# 70. Session Expiration Incident

If a configuration accidentally changes session TTL:

```text
Normal: 7 days
Bad config: 7 minutes
```

many users may be logged out.

## Response

1. identify configuration change
2. stop rollout
3. restore intended policy
4. communicate if necessary
5. investigate deployment safeguards

---

# 71. Security Incident: Session Theft

If a session token is suspected to be compromised:

Potential actions:

- revoke affected session
- revoke all sessions for affected account if appropriate
- require password reset if credentials may be compromised
- preserve security evidence
- investigate access logs

Do not expose the raw token in logs.

---

# 72. Security Incident: Password Exposure

If password hashes are exposed:

1. contain access
2. preserve evidence
3. rotate relevant secrets
4. assess hash strength
5. determine affected accounts
6. require credential resets if risk warrants
7. investigate source of exposure
8. notify affected parties according to applicable requirements

Never log plaintext passwords.

---

# 73. Security Incident: Reset Token Exposure

Reset tokens should be:

- short-lived
- single-use
- stored as hashes where appropriate
- excluded from ordinary logs

If tokens are exposed, invalidate affected tokens and assess account impact.

---

# 74. Security Incident: Excessive Login Failures

A sudden increase can indicate:

- credential stuffing
- password spraying
- broken client
- integration failure

Compare:

- account distribution
- IP distribution
- geographic patterns where legitimately available
- user-agent patterns
- endpoint behavior

Avoid assuming malicious intent from one metric alone.

---

# 75. Incident Response Sequence

A useful sequence:

```text
Detect
  |
Triage
  |
Contain
  |
Stabilize
  |
Recover
  |
Verify
  |
Investigate
  |
Prevent recurrence
```

Recovery should not wait for complete root-cause analysis if a safe mitigation is available.

---

# 76. Detection

Detection signals can include:

- elevated 5xx
- login failure spikes
- latency increase
- database connection exhaustion
- Redis errors
- queue growth
- worker failures
- health-check failures
- security alerts

---

# 77. Triage

Determine:

- what is broken?
- when did it start?
- who is affected?
- which operations are affected?
- is the issue availability, correctness, security, or multiple?
- what changed recently?

Use request IDs and timestamps to connect evidence.

---

# 78. Containment

Possible actions:

- stop deployment
- disable unhealthy instances
- remove failing dependency from traffic
- rate-limit abusive traffic
- disable non-critical background work
- rollback a safe deployment
- isolate affected accounts

Containment should minimize blast radius.

---

# 79. Stabilization

Restore the minimum healthy service first.

Example:

```text
Login
  |
Restore

Analytics
  |
Later
```

Critical authentication functionality should generally take priority over non-critical features.

---

# 80. Recovery Verification

After mitigation, verify:

- health
- login
- logout
- session validation
- registration where appropriate
- password reset where appropriate
- error rate
- latency
- database state
- Redis state
- queue recovery

Do not declare recovery based on one green dashboard.

---

# 81. Post-Incident Review

Document:

- timeline
- impact
- root cause
- contributing factors
- detection
- mitigation
- recovery
- customer impact
- security impact
- action items

Avoid blame-oriented analysis.

Focus on system behavior and preventable weaknesses.

---

# 82. Failure Testing

Useful tests include:

### API

- kill one instance
- kill multiple instances
- restart during traffic

### PostgreSQL

- simulate unavailable database
- simulate slow database
- simulate connection exhaustion

### Redis

- stop Redis
- introduce latency
- fill memory in a controlled test

### Queue

- stop workers
- increase queue volume
- inject poison messages

### Email

- simulate timeout
- simulate provider 5xx
- simulate rate limiting

### Network

- introduce latency
- introduce packet loss
- block dependency traffic

Only perform disruptive tests in controlled environments.

---

# 83. Chaos Testing

Chaos testing deliberately introduces failures to validate resilience.

Examples:

```text
API instance termination
Redis latency
database failover
worker termination
network delay
```

The purpose is not to create random outages.

The purpose is to verify known failure assumptions.

---

# 84. Failure Injection Principles

Every failure experiment should define:

- scope
- expected behavior
- safety limit
- rollback
- observer
- success criteria

Never inject production failures casually.

---

# 85. Recovery Runbook: API Failure

```text
1. Check health dashboard.
2. Identify failed instances.
3. Check recent deployments.
4. Check CPU/memory.
5. Inspect application logs.
6. Remove unhealthy instances.
7. Restart/replace if appropriate.
8. Verify readiness.
9. Verify authentication flow.
10. Continue investigation.
```

---

# 86. Recovery Runbook: PostgreSQL Failure

```text
1. Confirm database outage.
2. Check provider/cluster status.
3. Check connections and locks.
4. Check replication/standby state.
5. Follow failover procedure.
6. Refresh application connections.
7. Verify reads.
8. Verify writes.
9. Verify critical authentication flows.
10. Monitor recovery.
```

---

# 87. Recovery Runbook: Redis Failure

```text
1. Confirm Redis connectivity failure.
2. Identify affected functions.
3. Determine whether session state is affected.
4. Determine whether rate limiting is affected.
5. Apply documented fallback policy.
6. Restore Redis.
7. Validate session behavior.
8. Validate rate limiting.
9. Monitor errors.
```

---

# 88. Recovery Runbook: Queue Failure

```text
1. Check queue availability.
2. Check worker health.
3. Determine whether messages are accumulating.
4. Restore queue connectivity.
5. Restart failed workers.
6. Monitor queue depth.
7. Monitor oldest message age.
8. Inspect failed/dead-letter jobs.
```

---

# 89. Recovery Runbook: Bad Deployment

```text
1. Stop rollout.
2. Identify affected version.
3. Compare metrics before/after deployment.
4. Determine rollback safety.
5. Roll back if safe.
6. Verify authentication.
7. Verify database compatibility.
8. Monitor.
9. Preserve evidence.
10. Perform root-cause analysis.
```

---

# 90. Recovery Runbook: Credential Attack

```text
1. Confirm traffic pattern.
2. Protect authentication endpoints.
3. Apply rate limits.
4. Use edge controls where appropriate.
5. Monitor account impact.
6. Investigate compromised credentials.
7. Revoke sessions when required.
8. Communicate with affected users if necessary.
```

---

# 91. Graceful Degradation Matrix

| Dependency | Critical function | Possible degradation |
|---|---|---|
| PostgreSQL | account state | usually fail safely |
| Redis session store | session validation | fail closed or documented fallback |
| Redis cache | cached metadata | bypass cache |
| Email provider | email delivery | queue/retry |
| Analytics | analytics | drop/defer |
| Metrics backend | telemetry | continue core service if safe |
| Queue | async work | defer/fail according to job criticality |
| External profile service | optional enrichment | omit enrichment |

---

# 92. Error Response Principles

Errors should be:

- consistent
- machine-readable
- safe
- non-sensitive

Do not expose:

- database credentials
- internal stack traces
- SQL
- Redis details
- session tokens
- password data
- reset tokens

Production clients should receive stable error envelopes.

---

# 93. Authentication Enumeration During Failure

Failure responses must continue protecting account existence.

For password reset:

```text
Unknown account
```

should not produce a materially different public response from:

```text
Known account
```

even when dependencies fail.

---

# 94. Failure Logging

A useful structured error event may include:

```json
{
  "requestId": "req_123",
  "route": "/api/v1/auth/login",
  "method": "POST",
  "errorType": "dependency_timeout",
  "dependency": "postgres",
  "durationMs": 2500
}
```

It should not include passwords or raw tokens.

---

# 95. Dependency Error Taxonomy

Classify errors where practical:

```text
timeout
connection_refused
unavailable
rate_limited
invalid_response
authentication_failure
configuration_error
capacity_exhaustion
```

This makes alerting and troubleshooting easier.

---

# 96. Failure Correlation

Use:

- request IDs
- trace IDs
- timestamps
- deployment IDs
- instance IDs

to connect:

```text
Client error
    |
API log
    |
Database error
    |
Infrastructure event
```

This dramatically reduces investigation time.

---

# 97. Incident Timeline

A useful incident timeline records:

```text
09:00 deployment started
09:05 error rate increased
09:07 alert triggered
09:10 rollout stopped
09:12 rollback started
09:16 error rate recovered
09:30 root cause identified
```

Use UTC or a clearly documented timezone for operational timelines.

---

# 98. Preventing Repeat Failures

Every significant incident should produce actionable improvements.

Examples:

### Incident

DB connections exhausted.

### Improvement

Reduce per-instance pool and add connection monitoring.

---

### Incident

Email provider blocked workers.

### Improvement

Add tighter provider timeout and bounded concurrency.

---

### Incident

Bad migration caused outage.

### Improvement

Add compatibility checks and staged migration testing.

---

# 99. Failure Mode and Effects Analysis

A simple FMEA format:

| Failure | Probability | Impact | Detection | Mitigation |
|---|---|---|---|---|
| API crash | depends | moderate | health check | restart |
| DB outage | depends | high | DB metrics | failover |
| Redis outage | depends | high/moderate | dependency metrics | documented fallback |
| Email outage | depends | moderate | queue age | retry |
| Queue outage | depends | moderate/high | queue metrics | restore |
| Credential attack | depends | high | auth metrics | rate limiting |

Probability values should be based on real operational data where available.

---

# 100. Failure Budgeting

Not every failure requires the same engineering investment.

Prioritize based on:

- user impact
- security impact
- likelihood
- recovery difficulty
- blast radius
- business importance

A failure that can expose accounts deserves different treatment from a delayed analytics pipeline.

---

# 101. Blast Radius

A good architecture limits how much one failure can affect.

Examples:

```text
One API instance
      |
small blast radius
```

versus:

```text
Shared process handling every workload
      |
large blast radius
```

Use isolation where justified.

---

# 102. Workload Isolation

Separate:

- synchronous API traffic
- password hashing
- background workers
- email delivery
- analytics

when resource contention becomes a measurable problem.

Do not create separate services merely for visual architecture.

---

# 103. Failure Ownership

Every critical dependency should have an owner.

Document:

```text
Component
Owner
Escalation
Runbook
Backup owner
```

This matters during incidents because ambiguity increases recovery time.

---

# 104. Incident Communication

For significant incidents, communicate:

- what is affected
- when it started
- current status
- mitigation
- expected next update

Avoid unsupported certainty.

If root cause is unknown, say that it is under investigation.

---

# 105. User Communication

User-facing communication should avoid exposing:

- internal infrastructure details
- security-sensitive implementation details
- private account information

It should explain:

- affected capability
- current status
- required user action, if any

---

# 106. Security Incident Escalation

Security incidents may require different handling from normal outages.

Potential triggers:

- unauthorized account access
- credential exposure
- session compromise
- reset-token compromise
- suspicious administrative activity

Follow the organization's security and legal/compliance procedures.

---

# 107. Recovery vs Root Cause

A common mistake is waiting for root cause before restoring service.

Preferred sequence:

```text
Restore safely
    |
Stabilize
    |
Investigate
    |
Fix root cause
    |
Prevent recurrence
```

The exception is when restoration itself could worsen a security incident.

---

# 108. Recovery Validation Checklist

After a major failure:

- [ ] health endpoint works
- [ ] readiness works
- [ ] registration works where enabled
- [ ] login works
- [ ] invalid login remains rejected
- [ ] `/auth/me` works
- [ ] logout works
- [ ] revoked session remains invalid
- [ ] reset request behaves correctly
- [ ] reset confirmation behaves correctly
- [ ] rate limiting works
- [ ] audit events are recorded
- [ ] metrics recover
- [ ] queue drains
- [ ] database replication is healthy

---

# 109. Production Failure Readiness Checklist

## API

- [ ] multiple instances
- [ ] health checks
- [ ] readiness checks
- [ ] graceful shutdown
- [ ] bounded timeouts
- [ ] structured errors

## Database

- [ ] backups
- [ ] restore testing
- [ ] failover procedure
- [ ] connection budget
- [ ] monitoring
- [ ] migration strategy

## Redis

- [ ] HA strategy
- [ ] TTLs
- [ ] capacity monitoring
- [ ] failure policy
- [ ] session consistency policy

## Queue

- [ ] retries
- [ ] dead-letter handling
- [ ] worker scaling
- [ ] queue monitoring

## Security

- [ ] rate limits
- [ ] session revocation
- [ ] reset-token protection
- [ ] secret management
- [ ] audit logging

## Operations

- [ ] runbooks
- [ ] alerts
- [ ] incident ownership
- [ ] recovery testing
- [ ] post-incident process

---

# 110. Failure Testing Matrix

| Failure | Test environment | Expected result |
|---|---|---|
| API instance crash | staging | traffic shifts |
| DB timeout | staging | controlled errors |
| Redis timeout | staging | documented fallback |
| Queue outage | staging | async work deferred |
| Worker crash | staging | jobs retry |
| Email timeout | staging | retries/backoff |
| Replica lag | staging | sensitive reads avoid stale replica |
| Bad deployment | staging | rollback works |
| Secret unavailable | staging | safe startup failure |
| Rate limiter unavailable | staging | documented security policy |

---

# 111. What Not to Do During an Incident

Avoid:

- changing many unrelated settings
- disabling security controls without approval
- increasing retries indefinitely
- deleting data without preserving evidence
- exposing secrets in chat/logs
- making untested production schema changes
- assuming a green health endpoint means full recovery
- declaring root cause without evidence

---

# 112. Failure Decision Tree

```text
Request failing
      |
Is failure local to one instance?
      |
     Yes
      |
Remove/replace instance
      |
Verify
```

If not:

```text
Is a shared dependency failing?
      |
     Yes
      |
Identify dependency
      |
Check timeout/capacity/availability
      |
Apply dependency runbook
```

If no dependency is obvious:

```text
Check recent deployment
      |
Check configuration
      |
Check infrastructure
      |
Check traffic/abuse
      |
Trace representative request
```

---

# 113. Dependency Triage Order

For an authentication outage, a useful investigation order is:

1. recent deployment/configuration
2. API health
3. database
4. Redis/session store
5. queue/workers
6. external email provider
7. network/DNS/TLS
8. traffic/abuse patterns

The exact order can change based on available evidence.

---

# 114. Example Incident: Login Outage

Symptoms:

```text
Login p99 = 4 seconds
5xx = increasing
API CPU = 90%
DB CPU = 30%
Redis = healthy
```

Investigation:

```text
API CPU high
   |
Password verification
   |
Login spike
```

Possible causes:

- legitimate traffic spike
- credential attack
- changed hashing parameters
- insufficient compute

Response:

- inspect traffic
- apply abuse controls
- scale compute
- verify hashing configuration

---

# 115. Example Incident: `/auth/me` Outage

Symptoms:

```text
Login works
/auth/me fails
Redis timeout
```

Likely dependency:

```text
Session store
```

Response:

- verify Redis
- determine session fallback policy
- avoid accepting unvalidated sessions
- restore Redis
- verify existing sessions

---

# 116. Example Incident: Password Reset Delayed

Symptoms:

```text
Reset requests succeed
Emails delayed
Queue depth increasing
```

Investigation:

```text
API healthy
Queue healthy
Workers healthy
Email provider slow
```

Response:

- enforce provider timeout
- control worker concurrency
- retry with backoff
- monitor queue
- communicate delay if significant

---

# 117. Example Incident: Database Overload

Symptoms:

```text
DB CPU = 95%
DB query latency = high
API CPU = moderate
```

Investigation:

- recent query change
- missing index
- traffic spike
- connection count
- lock contention

Response:

- protect database
- reduce unnecessary traffic
- rollback harmful query change if safe
- optimize query
- scale database if justified

---

# 118. Example Incident: Rate Limiter Failure

Suppose Redis rate-limit state becomes unavailable.

The system must not accidentally allow unlimited login attempts without review.

Possible policies include:

- fail closed for high-risk endpoints
- use temporary local emergency limits
- reject requests until shared protection returns

The chosen policy should be documented and tested.

---

# 119. Example Incident: Security vs Availability

Suppose session validation cannot reach its authoritative store.

Two options:

```text
Option A:
Accept session anyway
```

This may preserve availability but can create unauthorized access.

```text
Option B:
Reject authenticated request
```

This reduces availability but preserves authentication integrity.

For security-sensitive decisions, correctness and confidentiality generally require an explicit fail-closed policy unless a trusted fallback exists.

---

# 120. Failure Mode Documentation Template

For every new dependency, document:

```text
Component:
Purpose:
Failure symptoms:
Detection:
User impact:
Security impact:
Timeout:
Retry policy:
Fallback:
Recovery:
Verification:
Prevention:
Owner:
Runbook:
```

This keeps failure planning consistent.

---

# 121. Interview Question: What Happens If Redis Goes Down?

Answer:

> It depends on what Redis stores. If it stores only cache data, the application may bypass it and use the source of truth. If it stores security-sensitive session state, the system needs an explicit fail-closed or carefully designed fallback policy. The important point is that Redis failure must not accidentally become an authentication bypass.

---

# 122. Interview Question: What If PostgreSQL Goes Down?

Answer:

> The service should stop pretending security-sensitive writes succeeded. Requests should fail with controlled errors and bounded timeouts. A production deployment may use a highly available PostgreSQL configuration with failover, but the application still needs to verify the new primary before resuming normal traffic.

---

# 123. Interview Question: How Do You Prevent Retry Storms?

Answer:

> Use bounded retries, exponential backoff, jitter, request deadlines, and retry only transient failures. The system should also limit concurrency so a failing dependency cannot consume all application resources.

---

# 124. Interview Question: What Happens During a Bad Deployment?

Answer:

> Stop the rollout, assess the impact, and roll back to a known-good version when the database and application remain compatible. Authentication smoke tests and telemetry should verify recovery before continuing. Schema changes should use compatibility-friendly migration patterns.

---

# 125. Interview Question: How Do You Handle Email Provider Failure?

Answer:

> Keep email delivery asynchronous. The API should enqueue the work when possible, and workers should use timeouts and controlled retries. Provider failure should not consume unlimited worker capacity or block unrelated authentication requests.

---

# 126. Interview Question: How Do You Design for Partial Failure?

Answer:

> Identify dependency criticality, give each dependency explicit timeouts and failure policies, isolate resource pools, and define whether each operation should fail open, fail closed, retry, queue, or degrade. The policy should be driven by security and correctness requirements.

---

# 127. Interview Question: What Is a Cascading Failure?

Answer:

> A cascading failure occurs when one component's degradation causes resource pressure in other components, which then fail and increase the original pressure. Timeouts, bounded concurrency, retries, queues, and bulkheads help limit propagation.

---

# 128. Interview Question: How Do You Test Failure Handling?

Answer:

> Use controlled failure injection in non-production environments: terminate API instances, add database latency, stop Redis, pause workers, simulate email-provider errors, and test deployment rollback. Each experiment should have an expected outcome and a recovery procedure.

---

# 129. Final Failure Principles

A resilient authentication system follows these principles:

1. Assume dependencies fail.
2. Detect failures quickly.
3. Bound waiting and retries.
4. Do not fake successful writes.
5. Fail safely for security-sensitive decisions.
6. Isolate workloads.
7. Preserve evidence.
8. Keep recovery procedures documented.
9. Test failure behavior.
10. Verify recovery with real authentication flows.
11. Separate mitigation from root-cause analysis.
12. Treat security incidents differently from ordinary outages.
13. Protect against cascading failures.
14. Make dependency failure policies explicit.
15. Keep backups and recovery procedures tested.

---

# 130. Definition of Done

The failure-mode scenario is complete when the team can answer:

- What happens if an API instance crashes?
- What happens if every API instance fails?
- What happens if PostgreSQL becomes unavailable?
- What happens if PostgreSQL connections are exhausted?
- What happens if a replica lags?
- What happens if Redis becomes unavailable?
- What happens if session validation cannot reach its store?
- What happens if password hashing saturates CPU?
- What happens if email delivery fails?
- What happens if the queue stops?
- What happens if workers crash?
- What happens if a dependency becomes slow rather than completely unavailable?
- What happens if a deployment is bad?
- What happens if a migration fails?
- What happens if secrets cannot be loaded?
- What happens if rate limiting fails?
- What happens if a session is compromised?
- What happens if reset tokens are exposed?
- How is an incident detected?
- How is service stabilized?
- How is recovery verified?
- How is the root cause prevented from recurring?

---

# 131. Verification Commands

From the repository root:

```bash
cd ~/Dev/Projects/shipstack
```

Check the document:

```bash
wc -l scenarios/authentication/failure-modes.md
```

Check repository state:

```bash
git status --short
```

Verify the authentication implementation:

```bash
cd scenarios/authentication/src
npm run typecheck
npm run build
npm test
```

Return to repository root:

```bash
cd ~/Dev/Projects/shipstack
```

Review scenario files:

```bash
find scenarios/authentication -maxdepth 2 -type f | sort
```

---

# 132. Closing

Production engineering is not only about designing the happy path.

A serious authentication system must also answer:

```text
What if the database fails?
What if Redis fails?
What if the network becomes slow?
What if an API instance dies?
What if the deployment is broken?
What if traffic suddenly doubles?
What if the failure is caused by an attacker?
What if two failures happen together?
```

The quality of the architecture is strongly determined by those answers.

The objective is not to promise that nothing will fail.

The objective is to ensure that when something fails:

```text
the failure is detected
        |
the blast radius is controlled
        |
security remains intact
        |
the service recovers
        |
the evidence is preserved
        |
the system becomes stronger
```

That is resilient authentication engineering.
