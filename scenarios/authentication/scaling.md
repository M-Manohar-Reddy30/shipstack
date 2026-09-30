# Authentication Scaling

## 1. Purpose

This document explains how the authentication reference architecture can scale from a small application into a high-traffic production system.

The goal is not to prescribe one infrastructure stack for every application.

Instead, this document provides:

- scaling principles
- capacity-planning methods
- horizontal-scaling patterns
- database-scaling strategies
- Redis/session-scaling strategies
- rate-limit scaling
- cache strategy
- background-job architecture
- load-testing guidance
- failure scenarios
- multi-zone and multi-region considerations
- scaling milestones
- operational checklists
- interview-ready explanations

The central principle is:

> Scale the bottleneck, not the architecture.

A system should not introduce distributed complexity merely because the traffic might grow in the future.

---

## 2. Scope

This document focuses on the authentication system described by the other scenario documents:

- user registration
- login
- logout
- current-user lookup
- password changes
- password reset
- server-managed sessions
- password hashing
- authorization metadata
- audit events
- rate limiting
- PostgreSQL persistence
- Redis-backed ephemeral state
- asynchronous email delivery
- observability

It also explains how the system should evolve as traffic, user count, availability requirements, and geographic distribution increase.

---

## 3. Scaling Goals

A scalable authentication service should preserve the following properties while traffic increases.

### 3.1 Correctness

Scaling must not cause:

- duplicate accounts
- duplicate password-reset use
- session resurrection
- authorization bypass
- inconsistent password state
- lost security events
- incorrect session ownership

Correctness has priority over raw throughput.

### 3.2 Predictable latency

The authentication API should have predictable latency under normal load and controlled degradation under overload.

The exact latency target depends on the product and infrastructure.

Any target used for capacity planning should be explicitly defined and measured rather than assumed.

### 3.3 Horizontal scalability

Application servers should be replaceable and independently scalable.

Adding API instances should increase capacity without requiring users to reconnect to one specific server.

### 3.4 Fault isolation

Failure of:

- one API instance
- one worker
- one availability zone
- one Redis node
- one database replica
- one email provider

should not automatically become a complete authentication outage.

### 3.5 Security preservation

Scaling must preserve:

- password-hashing controls
- session security
- rate limits
- abuse protection
- authorization checks
- auditability
- secret protection

A faster insecure authentication system is not an improvement.

---

## 4. Scaling Principles

### Principle 1: Start simple

Use the smallest architecture that satisfies current requirements.

A single API deployment and one PostgreSQL instance can be sufficient for an early application.

### Principle 2: Measure before scaling

Do not add infrastructure because a service "might" need it.

Measure:

- request rate
- latency
- CPU
- memory
- database connections
- database query latency
- Redis latency
- queue depth
- error rate
- authentication failure rate

### Principle 3: Scale stateless compute horizontally

API instances should not depend on local process memory for durable authentication state.

### Principle 4: Keep durable state durable

User records, credential state, sessions, reset-token state, and audit requirements must have an explicit persistence model.

### Principle 5: Keep expensive work off the request path when possible

Email delivery and other slow external operations should normally use asynchronous workers.

### Principle 6: Protect the database

PostgreSQL often becomes a major shared dependency.

Good indexing, bounded queries, connection pooling, and careful transaction design can delay more complex scaling work.

### Principle 7: Security controls must scale too

A local in-memory rate limiter may work on one server but become incorrect when multiple servers are running.

Distributed deployments require distributed security-state design.

### Principle 8: Prefer graceful degradation

When a non-critical dependency fails, preserve critical authentication paths where security allows it.

### Principle 9: Avoid premature sharding

Database sharding introduces substantial operational complexity.

Use it only when simpler approaches cannot satisfy measured requirements.

### Principle 10: Capacity planning is continuous

Traffic patterns change.

Recalculate capacity after:

- major product launches
- large customer onboarding
- authentication-flow changes
- password-hashing parameter changes
- geographic expansion
- infrastructure changes

---

# 5. Current Reference Implementation

The repository implementation is intentionally a reference skeleton.

The current implementation uses:

- TypeScript
- Express
- in-memory users
- in-memory sessions
- Argon2id password hashing
- signed/opaque server-managed session cookies
- Zod validation
- Helmet
- CORS allowlisting
- request IDs

It is useful for understanding application behavior and testing.

It is not a horizontally scalable production deployment.

## 5.1 Current limitations

The current implementation has state inside the application process.

Therefore:

```text
Request A -> API instance 1 -> memory
Request B -> API instance 2 -> different memory
```

The second instance cannot automatically see state created by the first.

This creates a scaling boundary.

## 5.2 Production direction

A production deployment should move shared state into durable/shared infrastructure:

```text
                  Load Balancer
                       |
          +------------+------------+
          |            |            |
       API-1        API-2        API-3
          |            |            |
          +------------+------------+
                       |
             +---------+---------+
             |                   |
        PostgreSQL             Redis
             |
        Read Replicas
```

The application layer becomes horizontally scalable.

---

# 6. Traffic Model

Scaling begins with a traffic model.

Useful quantities include:

- registered users
- monthly active users
- daily active users
- concurrent users
- login attempts per second
- registration attempts per second
- session-validation requests per second
- password-reset requests per second
- password-reset confirmations per second
- logout requests per second
- requests per authenticated user

These values are more useful than total user count alone.

## 6.1 Total users are not request traffic

An application may have:

```text
1,000,000 registered users
```

but only:

```text
50,000 daily active users
```

and perhaps:

```text
1,000 authentication requests/sec
```

during a peak.

The infrastructure must be sized for traffic patterns, not merely the number of accounts.

## 6.2 Peak traffic matters

Average traffic hides spikes.

Example:

```text
Average login rate: 100 requests/sec
Peak login rate:    800 requests/sec
```

The system must remain safe during the peak.

## 6.3 Peak-to-average ratio

Track:

```text
Peak traffic / Average traffic
```

This ratio helps determine whether autoscaling, queueing, or pre-provisioned capacity is required.

The appropriate ratio is application-specific.

---

# 7. Request Classes

Authentication endpoints have different resource profiles.

## 7.1 Registration

Typical work:

1. validate input
2. check uniqueness
3. hash password
4. insert user
5. create session
6. optionally enqueue email verification

Registration can be database-heavy and CPU-heavy.

## 7.2 Login

Typical work:

1. validate input
2. find user
3. verify password
4. create session
5. persist session
6. set cookie

Password verification is intentionally CPU-expensive.

## 7.3 Session validation

Typical work:

1. read session cookie
2. hash/normalize token
3. retrieve session
4. validate expiration
5. retrieve user information if needed

This path can often be much cheaper than password verification.

## 7.4 Logout

Typical work:

1. identify session
2. revoke/delete session
3. clear cookie

## 7.5 Password reset

Request phase:

1. validate identifier
2. find account without leaking existence
3. generate reset token
4. store token hash
5. enqueue email

Confirmation phase:

1. validate token
2. consume token atomically
3. update password
4. revoke appropriate sessions
5. record audit event

Reset flows require careful consistency guarantees.

---

# 8. Horizontal Scaling

Horizontal scaling means adding more application instances.

Instead of:

```text
Client -> API-1
```

use:

```text
                    Load Balancer
                  /      |       \
               API-1   API-2   API-3
```

## 8.1 Why horizontal scaling works

If API instances are stateless, any healthy instance can process a request.

This allows:

- rolling deployments
- autoscaling
- failure replacement
- traffic distribution
- capacity expansion

## 8.2 Requirements for horizontal scaling

The API should avoid relying on:

- process-local sessions
- local user state
- local authentication state
- local queues
- local durable files
- instance-specific secrets

Temporary local memory can still be used for:

- short-lived caches
- computed values
- request-local state

but correctness must not depend on it.

---

# 9. Stateless API Design

"Stateless API" does not mean the entire system has no state.

It means the application instance does not need to own the durable client session state.

Example:

```text
Browser
  |
  | session cookie
  v
API-2
  |
  | session lookup
  v
Redis/PostgreSQL
```

The browser can then send its next request to API-1.

```text
Browser
  |
  v
API-1
  |
  v
Redis/PostgreSQL
```

The request remains valid.

## 9.1 What should not be stored only in memory

Avoid storing these only in process memory:

- authenticated sessions
- password-reset tokens
- account lockout state
- distributed rate-limit counters
- security-critical authorization state

## 9.2 Local caching

Local caches are still useful.

However:

> A local cache should be an optimization, not the source of truth for security-critical state.

---

# 10. Load Balancing

A load balancer distributes incoming requests across healthy API instances.

Example:

```text
                    Internet
                       |
                Load Balancer
                /      |      \
             API-1   API-2   API-3
```

## 10.1 Responsibilities

The load balancer can provide:

- TLS termination
- health checks
- traffic distribution
- connection management
- timeouts
- retry policy
- routing
- protection from unhealthy instances

Exact responsibilities depend on the infrastructure platform.

## 10.2 Health checks

A basic health endpoint can indicate whether the process is alive.

Example:

```http
GET /health
```

A deeper readiness check can verify whether the instance can safely accept traffic.

Example:

```text
GET /ready
```

Readiness may consider:

- database connectivity
- required configuration
- migration state
- critical dependency availability

Do not make a health check depend on every optional dependency.

## 10.3 Liveness vs readiness

Liveness asks:

> Is this process alive?

Readiness asks:

> Should this process receive production traffic?

These are different questions.

---

# 11. Session Scaling

Session storage is one of the most important scaling decisions.

## 11.1 PostgreSQL sessions

Sessions can be stored in PostgreSQL.

Advantages:

- durable
- transactional
- easy to query
- strong consistency
- fewer infrastructure dependencies

Disadvantages:

- session reads add database traffic
- high request rates can increase database pressure

## 11.2 Redis sessions

Sessions can be stored in Redis.

Advantages:

- fast reads
- TTL support
- natural fit for ephemeral state
- reduces session-read pressure on PostgreSQL

Disadvantages:

- introduces another critical dependency
- requires availability planning
- memory capacity must be managed
- persistence semantics differ from PostgreSQL

## 11.3 Hybrid model

A common architecture is:

```text
PostgreSQL
  |
  | durable user/account state
  |
Redis
  |
  | session + rate-limit + ephemeral state
```

The exact split should follow consistency requirements.

---

# 12. Session Token Storage

A secure session system should avoid storing raw session tokens as database values when a hash can be used.

Conceptually:

```text
Browser
  |
  | raw opaque token
  v
API
  |
  | SHA-256(token)
  v
Session store
```

This reduces the impact of session-store disclosure.

## 12.1 Scaling implication

Hashing a session token is inexpensive compared with password hashing.

Therefore session validation generally scales differently from login.

Do not assume:

```text
login cost == authenticated request cost
```

They are different workloads.

---

# 13. Sticky Sessions

Sticky sessions route a client to the same API instance.

Example:

```text
User A -> API-1
User A -> API-1
User A -> API-1
```

This can hide state-management problems in a small deployment.

However, it is generally not a substitute for shared session storage.

If API-1 fails:

```text
User A -> API-2
```

The application still needs access to the session state.

## 13.1 Preferred approach

Prefer:

```text
Any API instance
       |
       v
Shared session store
```

over:

```text
Client
  |
Sticky routing
  |
Specific server memory
```

---

# 14. PostgreSQL Scaling

PostgreSQL should normally be the source of truth for durable account data.

Before introducing advanced database scaling, optimize the fundamentals.

## 14.1 First-line database improvements

Use:

- appropriate indexes
- bounded queries
- connection pooling
- efficient transactions
- prepared statements where appropriate
- query-plan analysis
- appropriate data types
- pagination
- cleanup policies
- controlled connection counts

## 14.2 Indexes

Important lookup paths may include:

```text
users.email
sessions.token_hash
sessions.expires_at
password_reset_tokens.token_hash
password_reset_tokens.expires_at
audit_events.user_id
audit_events.created_at
```

The exact indexes should be validated against real query patterns.

## 14.3 Avoid over-indexing

Every index has costs:

- storage
- write overhead
- maintenance
- memory pressure

Add indexes for real access patterns.

---

# 15. Connection Pooling

A database connection is a finite resource.

If every API instance creates too many connections:

```text
API-1 -> 50 connections
API-2 -> 50 connections
API-3 -> 50 connections
...
```

the database can become overloaded even when CPU usage is low.

## 15.1 Pool sizing

Pool size must consider:

- database connection limit
- number of API instances
- worker processes
- background jobs
- administrative connections
- replicas

Illustrative calculation:

```text
Database connection budget = 200

API instances = 10

Average pool budget per instance
≈ 200 / 10
≈ 20
```

This is only a planning example.

Real systems must reserve capacity and account for other workloads.

## 15.2 More connections are not always faster

Too many concurrent database queries can cause:

- CPU contention
- lock contention
- memory pressure
- queueing
- context switching

A smaller controlled pool can outperform an oversized pool.

---

# 16. Read Replicas

A read replica copies data from the primary database.

Example:

```text
                 Primary
                /       \
          Replica-1   Replica-2
```

Reads that tolerate replication lag can be routed to replicas.

## 16.1 Good candidates

Potential candidates:

- reporting
- analytics
- non-critical dashboards
- historical reads
- operational queries that tolerate stale data

## 16.2 Dangerous candidates

Do not blindly send consistency-sensitive reads to replicas.

Example:

```text
User changes password
        |
        v
Primary updated
        |
        v
Immediate login check
```

If the login check reads a lagging replica, the application may observe stale state.

## 16.3 Authentication principle

Security-critical reads should have an explicit consistency policy.

Do not introduce replicas without documenting:

- acceptable lag
- read routing
- failover behavior
- stale-read consequences

---

# 17. Write Scaling

Authentication systems generally have significant writes:

- registration
- session creation
- session revocation
- password changes
- reset-token consumption
- audit events

A single PostgreSQL primary may remain sufficient for a long time if the workload is well designed.

## 17.1 Optimize writes first

Before partitioning or sharding:

- remove unnecessary writes
- batch non-critical work
- move email to asynchronous processing
- reduce redundant session updates
- optimize indexes
- tune transactions
- avoid unnecessary audit duplication

## 17.2 Partitioning

Database partitioning can help very large tables.

Candidates may include time-oriented audit data.

Example:

```text
audit_events
  |
  +-- 2026-01
  +-- 2026-02
  +-- 2026-03
  +-- ...
```

Partitioning should be introduced only when table size and access patterns justify it.

## 17.3 Sharding

Sharding distributes data across multiple database systems.

Example:

```text
Shard A -> users 0-...
Shard B -> users ...
Shard C -> users ...
```

Sharding introduces:

- routing complexity
- cross-shard query complexity
- migration complexity
- operational complexity
- harder transactions
- harder backups and recovery

It should be treated as a later-stage architecture change.

---

# 18. Redis Scaling

Redis may support:

- sessions
- rate-limit counters
- temporary tokens
- cache entries
- distributed locks where justified
- job queues depending on architecture

Not all Redis workloads have the same durability requirements.

## 18.1 Separate logical responsibilities

Avoid turning Redis into an unstructured dumping ground.

Document key namespaces.

Example:

```text
session:{hash}
rate:{identifier}:{window}
cache:user:{id}
reset:{hash}
```

## 18.2 TTLs

Ephemeral keys should normally have explicit TTLs.

Examples:

```text
session -> expiration aligned with session policy
rate limit -> window TTL
reset token -> short expiration
cache -> application-defined expiration
```

TTL prevents abandoned state from growing indefinitely.

---

# 19. Redis Hot Keys

A hot key receives disproportionate traffic.

Example:

```text
session:abc123
```

If one account generates unusually high traffic, one key may become very hot.

Potential mitigations:

- local caching where safe
- request coalescing
- better traffic distribution
- avoiding repeated unnecessary reads
- abuse controls
- architecture-specific key distribution

Do not blindly duplicate security-sensitive state across keys.

---

# 20. Distributed Rate Limiting

Rate limiting becomes more important as the API scales horizontally.

A local limiter:

```text
API-1 -> counter 10
API-2 -> counter 10
API-3 -> counter 10
```

does not provide one global limit.

A distributed limiter can use Redis or another shared mechanism:

```text
API-1 \
API-2  ---> Shared counter
API-3 /
```

## 20.1 Example

Suppose an endpoint has an illustrative limit of:

```text
10 attempts / minute / account
```

With three API instances, the counter must still represent the account's aggregate attempts.

## 20.2 Rate-limit dimensions

Possible dimensions:

- IP address
- account identifier
- device identifier
- network prefix
- endpoint
- credential identifier
- combinations of these

The exact strategy must balance:

- abuse resistance
- legitimate shared networks
- privacy
- false positives
- attacker adaptation

---

# 21. Password Hashing as a Scaling Constraint

Password hashing is intentionally expensive.

This is a security feature.

A login request may consume substantially more CPU than a normal API request.

Therefore authentication capacity must be measured separately.

## 21.1 Capacity model

Conceptually:

```text
Login throughput
≈ available hashing capacity
  / average CPU cost per verification
```

The exact result depends on:

- Argon2 parameters
- CPU model
- worker concurrency
- memory availability
- runtime
- operating-system scheduling

## 21.2 Do not weaken hashing just to increase throughput

If login capacity becomes a bottleneck:

Consider:

- more API instances
- better CPU capacity
- controlled worker concurrency
- queueing where appropriate
- abuse controls
- capacity planning

Do not automatically reduce password-hashing cost.

---

# 22. CPU Isolation for Password Hashing

Password verification can compete with ordinary request processing.

Possible architecture:

```text
                  Load Balancer
                       |
                Authentication API
                  /          \
          Request handling   Hash workers
                               |
                            Argon2id
```

Whether separate worker pools are needed depends on traffic.

At moderate scale, the API process may perform hashing directly.

At higher scale, CPU isolation can improve predictability.

---

# 23. Caching Strategy

Caching should reduce expensive repeated work without creating incorrect authentication decisions.

Potential cache targets:

- public configuration
- non-sensitive metadata
- user display metadata
- authorization metadata with carefully controlled invalidation
- expensive read-only computations

## 23.1 Be careful with authentication state

Do not cache:

```text
"password is valid"
```

for an unsafe period.

Do not cache revoked sessions as valid indefinitely.

## 23.2 Cache invalidation

Whenever security-sensitive data is cached, define:

- TTL
- invalidation event
- stale-data behavior
- failure behavior
- consistency requirements

---

# 24. Cache-Aside Pattern

A common pattern:

```text
Application
    |
    v
Cache lookup
   / \
 hit  miss
 |     |
return  DB
        |
        v
      Cache
```

This is useful for read-heavy data.

However, the database remains the source of truth.

## 24.1 Cache stampede

If a popular cache entry expires and many requests simultaneously fetch it:

```text
1000 requests
     |
     v
Cache miss
     |
     v
1000 DB queries
```

This can overload the database.

Possible mitigations:

- request coalescing
- jittered TTLs
- prewarming
- stale-while-revalidate
- controlled refresh

The appropriate approach depends on data criticality.

---

# 25. Background Jobs

Email delivery should generally not block the authentication request.

Instead:

```text
API
 |
 | enqueue
 v
Queue
 |
 v
Worker
 |
 v
Email Provider
```

## 25.1 Benefits

- lower request latency
- retry handling
- provider failure isolation
- independent worker scaling
- burst absorption

## 25.2 Queue depth

Queue depth is an important scaling signal.

Example:

```text
Queue depth
10 -> healthy
100 -> increasing
1000 -> investigate
```

These numbers are illustrative only.

A meaningful threshold should be derived from:

- arrival rate
- processing rate
- acceptable delay
- worker capacity

---

# 26. Queue Throughput

If:

```text
arrival rate = 100 jobs/sec
processing rate = 80 jobs/sec
```

the queue grows over time.

If:

```text
arrival rate = 100 jobs/sec
processing rate = 150 jobs/sec
```

the queue can drain after bursts.

Basic capacity reasoning:

```text
Required worker capacity > sustained arrival rate
```

with additional headroom for spikes.

---

# 27. Retry Strategy

External email providers can fail temporarily.

Workers should use controlled retries.

Avoid:

```text
retry forever immediately
```

Prefer:

```text
attempt
  |
  +-- success -> done
  |
  +-- temporary failure -> backoff -> retry
  |
  +-- permanent failure -> dead-letter/terminal state
```

Use:

- exponential backoff
- jitter
- maximum attempts
- dead-letter handling
- observability

---

# 28. Idempotency

Distributed systems can process the same event more than once.

For example:

```text
worker receives reset-email job
worker sends email
worker crashes before acknowledgement
job is retried
```

The email may be sent twice.

Design operations with duplicate processing in mind.

Where appropriate, use:

- idempotency keys
- unique event IDs
- durable job state
- deduplication

Exactly-once processing is often difficult in distributed systems.

Designing for safe retries is usually more practical.

---

# 29. Audit Event Scaling

Audit events can become write-heavy.

Possible events:

- login success
- login failure
- logout
- password change
- reset requested
- reset completed
- session revoked
- authorization changes

## 29.1 Separate criticality

Not every analytics event needs the same durability path.

A security-critical audit event may require durable persistence.

A derived analytics event may be acceptable through asynchronous processing.

Document the distinction.

---

# 30. Authentication and Event-Driven Architecture

An event-driven design can decouple secondary work.

Example:

```text
Auth Service
    |
    +--> UserRegistered
    |
    +--> PasswordChanged
    |
    +--> SessionRevoked
```

Consumers can handle:

- email
- analytics
- audit pipelines
- notifications
- fraud signals

## 30.1 Do not over-eventualize security decisions

The password change itself must be authoritative and synchronous.

Secondary effects can be asynchronous.

Example:

```text
Password update
    |
    +-- synchronous database transaction
    |
    +-- asynchronous notification
```

---

# 31. Multi-Instance Deployment

A practical production deployment may look like:

```text
                    Internet
                       |
                CDN / WAF / LB
                       |
          +------------+------------+
          |            |            |
        API-1        API-2        API-3
          |            |            |
          +------------+------------+
                       |
              +--------+--------+
              |                 |
           Redis            PostgreSQL
                                |
                         +------+------+
                         |             |
                     Replica-1     Replica-2
```

Background work:

```text
API -> Queue -> Workers -> Email Provider
```

Observability:

```text
API / DB / Redis / Workers
          |
          v
Metrics + Logs + Traces + Alerts
```

---

# 32. Availability Zones

For higher availability, deploy critical components across multiple availability zones.

Example:

```text
AZ-A                 AZ-B
API-1                API-2
Redis-node-A         Redis-node-B
DB-primary           DB-standby
```

The exact topology depends on the cloud/provider.

## 32.1 Why multiple zones matter

A single-zone failure can otherwise remove:

- API capacity
- database access
- Redis access
- workers

Multi-zone architecture reduces correlated infrastructure failure.

---

# 33. Database High Availability

A production database setup should define:

- primary
- standby
- replication
- automated/manual failover
- backup
- point-in-time recovery
- restore testing

Example:

```text
                  PostgreSQL Primary
                         |
                   Replication
                         |
                 PostgreSQL Standby
```

The exact failover mechanism depends on the database platform.

## 33.1 Backups are not high availability

A backup helps recover data.

High availability helps maintain service during infrastructure failure.

Both are required for mature systems.

---

# 34. Redis High Availability

If Redis becomes a critical session store, its availability strategy must be explicit.

Possible approaches include:

- managed Redis with replication
- Redis Sentinel
- Redis Cluster
- provider-specific highly available deployments

The right choice depends on:

- dataset size
- throughput
- failover requirements
- persistence requirements
- operational expertise

---

# 35. Redis Failure Policy

Decide what happens if Redis becomes unavailable.

For sessions:

```text
Redis unavailable
      |
      +-- fail closed
      |
      +-- fallback to PostgreSQL
      |
      +-- temporary degraded mode
```

There is no universal answer.

For authentication, incorrect acceptance can be more dangerous than temporary rejection.

A security-sensitive fallback must be carefully designed.

---

# 36. Database Failure Policy

If PostgreSQL is unavailable:

- registration cannot safely complete
- password changes cannot safely complete
- session persistence may be affected
- authorization data may be unavailable

The service should return controlled errors rather than pretending writes succeeded.

Never report success for a security-sensitive write that was not durably committed.

---

# 37. Graceful Degradation

Not every dependency is equally critical.

Example:

```text
Email provider down
       |
       +-- registration succeeds
       +-- verification email queued
       +-- user receives message later
```

if the product's policy permits it.

But:

```text
Database unavailable
       |
       +-- do not fake successful registration
```

The system should define dependency criticality explicitly.

---

# 38. Timeouts

Every network dependency should have bounded timeouts.

Examples:

- PostgreSQL connection timeout
- Redis timeout
- email-provider timeout
- HTTP client timeout
- queue publish timeout

Without timeouts, requests can accumulate while waiting for a failed dependency.

---

# 39. Retry Storms

Retries can make an outage worse.

Example:

```text
Dependency slows down
       |
API requests timeout
       |
clients retry
       |
more requests
       |
dependency becomes even slower
```

Use:

- bounded retries
- exponential backoff
- jitter
- circuit-breaking where appropriate
- idempotency
- retry budgets

Do not retry every failure.

---

# 40. Concurrency Control

Scaling is not only about adding instances.

Uncontrolled concurrency can overwhelm dependencies.

For example:

```text
100 API instances
x
50 database connections each
=
5000 possible connections
```

That may exceed the database's safe capacity.

Use controlled concurrency for:

- database access
- password hashing
- email workers
- external API calls

---

# 41. Capacity Planning

Capacity planning estimates how much traffic the system can safely handle.

Start with measured values.

Example:

```text
Current peak login rate = 200/sec
One API instance safely handles = 50 login/sec

Required instances:
200 / 50 = 4
```

Add headroom according to the application's reliability requirements.

For example, a team might provision more than the theoretical minimum to tolerate an instance failure.

The exact headroom percentage is a business and reliability decision.

---

# 42. Capacity Model

A useful model is:

```text
Required capacity =
Peak load
x
growth factor
x
failure headroom
```

Example:

```text
Peak = 500 req/sec
Growth assumption = 1.5
Base capacity target = 750 req/sec
```

Then determine how many instances are required.

Do not confuse this planning model with a guarantee.

Actual capacity must be validated with load tests.

---

# 43. CPU Capacity

Track:

- total CPU
- per-instance CPU
- CPU during login
- CPU during registration
- CPU during normal authenticated traffic

Password hashing can dominate CPU.

Therefore:

```text
API CPU at 30%
```

does not necessarily mean:

```text
Authentication capacity has 70% free
```

A workload may have a critical CPU-heavy endpoint approaching saturation while aggregate averages remain moderate.

---

# 44. Memory Capacity

Track:

- process RSS
- heap usage
- garbage collection
- Redis memory
- PostgreSQL memory
- queue-worker memory

Memory leaks are especially dangerous in long-running API instances.

Autoscaling based only on CPU may miss memory pressure.

---

# 45. Database Capacity

Track:

- CPU
- memory
- IOPS
- disk latency
- active connections
- connection wait time
- lock waits
- transaction duration
- query latency
- slow queries
- replication lag

Database capacity should be measured from both the infrastructure and query perspectives.

---

# 46. Redis Capacity

Track:

- memory usage
- command latency
- operations/sec
- evictions
- key count
- hit rate where relevant
- connection count
- replication health

Unexpected evictions can be especially dangerous if the application incorrectly treats cache state as durable state.

---

# 47. Queue Capacity

Track:

- queue depth
- oldest job age
- jobs/sec
- retry rate
- worker utilization
- dead-letter count

Queue depth alone is not enough.

A queue of 10,000 jobs may be healthy if workers can process them quickly.

A queue of 100 jobs may be unhealthy if processing is stalled.

---

# 48. Load Testing

Load tests should model real authentication traffic.

Do not test only:

```text
GET /health
```

That tests almost nothing about authentication capacity.

## 48.1 Useful scenarios

Test:

- login success
- login failure
- registration
- session validation
- logout
- password reset request
- password reset confirmation
- mixed production-like traffic

---

# 49. Load Test Mix

A realistic test might use an illustrative mix such as:

```text
50% session validation
25% login
10% logout
5% registration
5% reset request
5% other authentication operations
```

These percentages are examples, not universal production ratios.

Use real telemetry when available.

---

# 50. Load Test Types

## 50.1 Baseline test

Measures normal behavior.

## 50.2 Load test

Tests expected peak traffic.

## 50.3 Stress test

Increases traffic beyond expected capacity to discover failure behavior.

## 50.4 Spike test

Tests sudden traffic increases.

## 50.5 Soak test

Runs for a long period to find:

- memory leaks
- connection leaks
- queue buildup
- gradual degradation

## 50.6 Failover test

Removes or degrades a dependency and verifies recovery.

---

# 51. Performance Metrics

Important metrics include:

- throughput
- p50 latency
- p95 latency
- p99 latency
- error rate
- timeout rate
- saturation
- queue delay

Average latency can hide tail problems.

For example:

```text
Average = 100 ms
p99 = 4 seconds
```

The system may feel fast for many users while a meaningful subset experiences severe latency.

---

# 52. Bottleneck Identification

When performance degrades, determine where time is spent.

Example request:

```text
Request
  |
  +-- validation: 2 ms
  +-- DB lookup: 10 ms
  +-- password verify: 180 ms
  +-- session write: 5 ms
  +-- response: 3 ms
```

The password verification dominates.

Adding more database replicas would not solve that bottleneck.

This is why tracing and profiling matter.

---

# 53. Scaling Bottleneck Matrix

| Symptom | Likely area | First investigation |
|---|---|---|
| High API CPU during login | password hashing | hash timing and concurrency |
| High DB CPU | queries/writes | slow queries and indexes |
| High DB connections | pool sizing | connection budgets |
| High Redis latency | Redis capacity | commands, memory, hot keys |
| Queue growing | workers | arrival vs processing rate |
| High p99 | saturation/dependency | traces and tail latency |
| High 5xx | dependency/application | logs and error breakdown |
| Session failures | session store | Redis/DB availability |
| Login abuse spike | security traffic | rate limits and traffic source |
| Replication lag | database | write rate and replica capacity |

---

# 54. Autoscaling

Autoscaling adds or removes instances based on measured demand.

Possible signals:

- CPU utilization
- memory utilization
- requests/sec
- request latency
- queue depth
- custom workload metrics

## 54.1 CPU-only autoscaling

CPU-only scaling may work for normal API traffic.

But authentication has heterogeneous workloads.

Login CPU may be much higher than `/health`.

Custom metrics can sometimes provide better scaling decisions.

---

# 55. Autoscaling Safety

Autoscaling must not create a dependency overload.

Example:

```text
Traffic increases
    |
API scales 5 -> 50
    |
50 instances each open large DB pools
    |
Database collapses
```

The API scaled successfully but the system failed.

Every tier needs a capacity budget.

---

# 56. Scaling the Database Safely

When API instances increase:

- review DB pool limits
- review query volume
- review connection usage
- review lock contention
- review transaction rates

Do not scale application servers independently of shared dependencies.

---

# 57. Queue-Based Load Smoothing

Queues can absorb temporary spikes.

Example:

```text
Traffic spike
     |
     v
API
     |
     v
Queue
     |
     v
Workers process at controlled rate
```

This is useful for asynchronous work.

It should not be used to hide synchronous authentication correctness requirements.

---

# 58. Login Burst Protection

Large events can cause login bursts.

Examples:

- university admission results
- product launch
- company-wide onboarding
- event registration
- exam results

Potential controls:

- rate limits
- autoscaling
- prewarming
- queueing non-critical work
- capacity reservations
- database headroom
- CDN/WAF protection

Password verification remains a CPU constraint.

---

# 59. Abuse Traffic

An authentication service may be attacked with:

- credential stuffing
- password spraying
- account enumeration attempts
- reset-email abuse
- registration abuse
- bot traffic

Attack traffic can become the dominant workload.

Therefore scaling and security are connected.

## 59.1 Edge protection

Possible layers:

```text
Internet
   |
WAF / bot protection
   |
Load balancer
   |
API
   |
Rate limiter
```

The exact controls depend on threat model and infrastructure.

---

# 60. Rate Limiting and Autoscaling

Autoscaling should not replace rate limiting.

Without rate limiting:

```text
Attacker
   |
millions of requests
   |
autoscaler
   |
many API instances
   |
large infrastructure bill
```

Rate limiting can stop abusive traffic earlier.

Scaling provides capacity.

Rate limiting controls abuse.

They solve different problems.

---

# 61. Multi-Region Architecture

Multi-region authentication is significantly more complex.

A conceptual deployment:

```text
                Global Traffic
                 /          \
              Region A     Region B
              /    \       /    \
            API    API    API    API
              \     |      |    /
               Shared/replicated data
```

The exact data architecture is the difficult part.

## 61.1 Reasons to use multiple regions

Potential reasons:

- geographic latency
- regional availability requirements
- disaster recovery
- regulatory requirements
- global user base

Do not deploy multiple regions only because it sounds scalable.

---

# 62. Multi-Region Consistency

Authentication has state that may require strong consistency.

Examples:

- password changes
- session revocation
- account deletion
- role changes
- account lockouts

If Region A changes a password and Region B immediately accepts the old password, security correctness can be affected.

Therefore multi-region design needs explicit consistency guarantees.

---

# 63. Active-Passive

A simpler disaster-recovery model:

```text
Region A
  |
Active

Region B
  |
Standby
```

Traffic normally goes to Region A.

Region B is prepared for failover.

Advantages:

- simpler consistency model
- simpler operational model

Tradeoff:

- standby capacity may be underutilized
- failover takes time

---

# 64. Active-Active

Both regions serve traffic:

```text
Region A <--> Region B
```

Advantages:

- better geographic utilization
- lower regional failover impact

Challenges:

- data consistency
- conflict resolution
- global rate limits
- session revocation propagation
- operational complexity

Active-active should be justified by requirements.

---

# 65. Global Sessions

If sessions are region-local:

```text
User -> Region A -> Session A
```

a move to Region B may not recognize the session.

If sessions are globally shared, latency and consistency become concerns.

Possible approaches:

- globally replicated session store
- region-aware routing
- stateless signed tokens with carefully designed revocation
- durable shared session database

The correct choice depends on the security model.

---

# 66. Disaster Recovery

Define:

- RTO
- RPO
- backup frequency
- restore procedure
- failover procedure
- recovery ownership
- communication process

RTO means:

> how quickly service should be restored.

RPO means:

> how much data loss is acceptable.

Authentication systems should define these explicitly.

---

# 67. Backup Strategy

Back up:

- user data
- credential metadata
- sessions if required by recovery policy
- reset-token state where relevant
- audit data
- configuration that cannot otherwise be reconstructed

Do not assume backups are valid until restoration is tested.

---

# 68. Restore Testing

A mature process periodically verifies:

```text
Backup
  |
  v
Restore
  |
  v
Validate schema
  |
  v
Validate critical records
  |
  v
Application smoke test
```

A backup that cannot be restored is not a dependable recovery mechanism.

---

# 69. Schema Migrations at Scale

Database migrations become more sensitive as the number of instances increases.

Avoid migrations that:

- lock large tables for long periods
- require all API instances to upgrade simultaneously
- remove columns before old code stops using them

Prefer compatible migration patterns.

---

# 70. Expand-and-Contract Migration

A common approach:

### Phase 1

Add new field/table without removing old behavior.

### Phase 2

Deploy code that writes both if required.

### Phase 3

Backfill data.

### Phase 4

Switch reads.

### Phase 5

Remove old behavior.

This reduces deployment coupling.

---

# 71. Deployment and Scaling

Rolling deployments should maintain enough healthy capacity.

Example:

```text
Old:
API-1 API-2 API-3

Deploy new version:
API-1-new API-2 API-3

Then:
API-1-new API-2-new API-3

Finally:
API-1-new API-2-new API-3-new
```

Do not terminate all instances simultaneously unless downtime is explicitly acceptable.

---

# 72. Graceful Shutdown

An API instance being removed should:

1. stop accepting new traffic
2. finish in-flight requests
3. close connections
4. stop workers
5. exit

This prevents:

- dropped requests
- partial writes
- broken responses

---

# 73. Connection Draining

Load balancers should stop routing new requests to an instance before it terminates.

This gives the application time to complete active work.

The exact drain period should be based on observed request duration and infrastructure behavior.

---

# 74. Cold Starts

If the platform creates instances dynamically, startup time matters.

Measure:

- process startup
- dependency initialization
- connection establishment
- configuration loading

A service that takes 30 seconds to become ready may not respond well to sudden traffic spikes.

---

# 75. Prewarming

For predictable traffic spikes, instances can be started before demand arrives.

Examples:

- known launch time
- scheduled registration window
- major event

Prewarming reduces cold-start pressure.

---

# 76. Cost-Aware Scaling

Scaling has financial cost.

Track:

- compute cost
- database cost
- Redis cost
- bandwidth
- logging cost
- monitoring cost
- queue cost
- email-provider cost

The objective is not:

```text
maximum infrastructure
```

The objective is:

```text
required reliability and performance
at sustainable cost
```

---

# 77. Observability for Scaling

Scaling decisions require telemetry.

Important dashboards:

### API

- requests/sec
- error rate
- p50/p95/p99
- CPU
- memory
- instance count

### Authentication

- login attempts/sec
- registration attempts/sec
- login success rate
- login failure rate
- password verification duration
- reset requests/sec

### PostgreSQL

- connections
- query latency
- CPU
- locks
- IOPS
- replication lag

### Redis

- operations/sec
- latency
- memory
- evictions
- hit ratio where applicable

### Queue

- depth
- oldest message
- processing rate
- retries
- dead letters

---

# 78. SLO-Oriented Scaling

Scaling decisions should connect to service objectives.

For example:

```text
SLO:
99.9% of login requests complete
within defined latency target
under defined production conditions.
```

The actual target must be chosen by the product/team.

Then capacity decisions can be evaluated against the SLO.

---

# 79. Error Budgets

An error budget converts availability expectations into an operational budget.

If the service has a 99.9% availability objective, the allowed unavailability is approximately:

```text
0.1%
```

over the chosen measurement period.

Do not treat this as a universal target.

The important point is that reliability requirements should be explicit.

---

# 80. Scaling Milestone: Small Deployment

Illustrative stage:

```text
Users: hundreds to low thousands
Traffic: modest
```

Possible architecture:

```text
Load Balancer
      |
   API x2
      |
 PostgreSQL
```

Redis may not yet be necessary.

Focus on:

- correctness
- indexes
- security
- backups
- monitoring

---

# 81. Scaling Milestone: Growing Deployment

Illustrative stage:

```text
Users: thousands to tens of thousands
Traffic: increasing
```

Possible architecture:

```text
Load Balancer
      |
   API xN
      |
  +---+---+
  |       |
Redis   PostgreSQL
          |
       Replica
```

Add:

- shared sessions
- distributed rate limiting
- connection pooling
- background workers
- queue
- stronger observability

---

# 82. Scaling Milestone: Large Deployment

Illustrative stage:

```text
Users: tens of thousands to hundreds of thousands+
Traffic: high and bursty
```

Possible architecture:

```text
             WAF / LB
                 |
          +------+------+
          |      |      |
        API    API    API
          |      |      |
          +------+------+
                 |
        +--------+--------+
        |                 |
      Redis           PostgreSQL
        |             /       \
        |         Primary    Replicas
        |
      Queue
        |
     Workers
```

Focus on:

- capacity planning
- workload isolation
- failure testing
- queue management
- database performance
- abuse prevention

---

# 83. Scaling Milestone: Very Large Deployment

At very large scale, architecture becomes workload-specific.

Potential technologies include:

- database partitioning
- sharding
- multi-region deployment
- regional services
- dedicated authentication clusters
- specialized abuse-detection systems
- event streaming

These should be introduced based on measured constraints.

---

# 84. Anti-Pattern: Scaling Only the API

Bad approach:

```text
API overloaded
   |
add more API servers
```

But the database is already saturated.

Result:

```text
More API servers
       |
More DB connections
       |
Database overload
```

Always inspect the entire dependency chain.

---

# 85. Anti-Pattern: Huge Connection Pools

Bad approach:

```text
Every API instance:
pool = 100
```

With 30 instances:

```text
3000 possible connections
```

The database may fail before API CPU reaches saturation.

---

# 86. Anti-Pattern: Sticky Sessions as the Main Design

Sticky sessions hide state-management problems.

They reduce flexibility and complicate failover.

Shared state should be externalized when horizontal scaling is required.

---

# 87. Anti-Pattern: Local Rate Limiting Only

Each server may independently allow:

```text
10 requests/minute
```

With 10 servers, the attacker may effectively receive:

```text
100 requests/minute
```

A shared rate-limit strategy is required when the policy is global.

---

# 88. Anti-Pattern: Read Replicas Everywhere

Replication lag can break assumptions.

Do not route security-sensitive reads to replicas without understanding consistency.

---

# 89. Anti-Pattern: Cache as Source of Truth

A cache can disappear.

If authentication correctness depends entirely on cache state, failure can become a security incident.

Durable state must have an authoritative source.

---

# 90. Anti-Pattern: Scaling by Weakening Security

Examples:

- reducing password-hashing cost without security review
- removing rate limits
- accepting stale authorization data
- disabling audit logging
- extending session lifetimes solely for performance

Performance changes must preserve security requirements.

---

# 91. Anti-Pattern: Premature Microservices

Breaking authentication into many services too early can introduce:

- network hops
- distributed transactions
- deployment complexity
- debugging complexity
- more failure modes

A modular monolith can scale very well.

Split services when organizational, workload, or reliability boundaries justify it.

---

# 92. Scaling Checklist: Application

- [ ] API instances are horizontally scalable
- [ ] Durable state is externalized
- [ ] No correctness-critical local session state
- [ ] Graceful shutdown implemented
- [ ] Readiness checks exist
- [ ] Timeouts exist
- [ ] Retry policies are bounded
- [ ] Request limits exist
- [ ] Resource usage is observable

---

# 93. Scaling Checklist: Database

- [ ] Queries are indexed
- [ ] Slow queries are monitored
- [ ] Connection pools are bounded
- [ ] Database connection budget is documented
- [ ] Transactions are short where possible
- [ ] Backups exist
- [ ] Restore tests exist
- [ ] High-availability plan exists
- [ ] Replica strategy is documented
- [ ] Migration strategy is safe

---

# 94. Scaling Checklist: Redis

- [ ] Key namespaces are documented
- [ ] TTLs are defined
- [ ] Memory capacity is monitored
- [ ] Eviction policy is understood
- [ ] High availability is configured where required
- [ ] Failure behavior is documented
- [ ] Hot keys are monitored
- [ ] Security-sensitive state has explicit consistency requirements

---

# 95. Scaling Checklist: Rate Limiting

- [ ] Limits are defined by endpoint
- [ ] Limits are defined by relevant identity dimensions
- [ ] Distributed state is used when required
- [ ] Limits are observable
- [ ] Abuse responses are documented
- [ ] Legitimate shared-IP scenarios are considered
- [ ] Rate-limit storage has failure behavior

---

# 96. Scaling Checklist: Queues

- [ ] Background work is separated from request path
- [ ] Worker concurrency is bounded
- [ ] Retries use backoff
- [ ] Jobs are idempotent where possible
- [ ] Dead-letter handling exists
- [ ] Queue depth is monitored
- [ ] Oldest-job age is monitored
- [ ] Worker capacity can scale independently

---

# 97. Scaling Checklist: Security

- [ ] Password hashing remains strong
- [ ] Session tokens remain protected
- [ ] Reset tokens remain one-time use
- [ ] Authorization remains server-side
- [ ] Audit events remain trustworthy
- [ ] Rate limits scale across instances
- [ ] Secrets are centrally managed
- [ ] TLS is enforced in production
- [ ] Security-sensitive failures fail safely

---

# 98. Scaling Checklist: Multi-Region

- [ ] Regional routing strategy exists
- [ ] Session strategy is documented
- [ ] Password-change consistency is defined
- [ ] Revocation propagation is defined
- [ ] Global rate limits are defined
- [ ] Database replication strategy exists
- [ ] Failover is tested
- [ ] RTO is documented
- [ ] RPO is documented
- [ ] Disaster recovery is rehearsed

---

# 99. Capacity-Planning Worksheet

Record:

```text
Peak requests/sec:
Peak login requests/sec:
Peak registration requests/sec:
Peak reset requests/sec:

API instance capacity:
Required API instances:

Database CPU capacity:
Database connection budget:
Expected connections:

Redis operations/sec:
Redis memory budget:

Queue arrival rate:
Queue processing rate:
Worker count:

Expected growth:
Failure headroom:
```

The values should come from measurement or documented assumptions.

---

# 100. Scaling Decision Framework

When the system approaches a limit:

### Step 1

Identify the bottleneck.

### Step 2

Confirm it with metrics.

### Step 3

Check whether configuration can solve it.

### Step 4

Optimize the workload.

### Step 5

Scale the affected tier.

### Step 6

Load test again.

### Step 7

Verify failure behavior.

### Step 8

Document the new capacity model.

This creates a repeatable engineering process.

---

# 101. Example Scaling Investigation

Suppose login latency rises.

Metrics show:

```text
API CPU: 92%
DB CPU: 35%
Redis CPU: 20%
Password verification: 180 ms
```

Likely bottleneck:

```text
CPU-intensive password verification
```

Possible response:

- add API capacity
- control hashing concurrency
- verify Argon2 configuration
- investigate abusive traffic
- rerun load tests

Not the first response:

```text
Add another PostgreSQL replica
```

because the measured bottleneck is elsewhere.

---

# 102. Example Database Investigation

Suppose `/auth/me` latency rises.

Metrics:

```text
API CPU: 25%
DB CPU: 85%
DB query p99: 900 ms
Redis healthy
```

Investigate:

- query plan
- missing index
- connection contention
- lock waits
- slow query frequency

Only after diagnosis should infrastructure be changed.

---

# 103. Example Queue Investigation

Suppose password-reset emails are delayed.

Metrics:

```text
Queue arrival: 200 jobs/sec
Worker processing: 120 jobs/sec
Queue depth: increasing
```

The system is under-provisioned for sustained arrival rate.

Possible actions:

- increase worker count
- optimize worker processing
- improve provider throughput
- introduce provider-aware backpressure
- investigate unexpected traffic

---

# 104. Scaling and Security Tradeoffs

Scaling can create new security risks.

Examples:

### More API instances

Requires distributed session and rate-limit state.

### More regions

Creates consistency challenges.

### More caching

Creates stale-security-state risk.

### More asynchronous processing

Creates delayed side effects.

### More replicas

Creates read-after-write consistency issues.

### More automation

Creates larger blast radius for configuration errors.

Every scaling decision should include a security review.

---

# 105. Scaling and Consistency

A useful rule:

> Make consistency requirements explicit before choosing a scaling technology.

For each piece of data ask:

```text
Is it durable?
Is it security-sensitive?
Can it be stale?
For how long?
Can it be eventually consistent?
What happens during dependency failure?
```

Examples:

| Data | Durable | Security-sensitive | Stale allowed? |
|---|---:|---:|---:|
| User password hash | Yes | Yes | No |
| Session revocation | Yes/controlled | Yes | Usually very limited |
| Email delivery status | Yes | Moderate | Often yes |
| Analytics event | Often | Low | Usually yes |
| Public metadata | Often | Low | Usually yes |

---

# 106. Scaling and Availability Tradeoffs

Higher availability often introduces:

- replication
- failover
- redundancy
- distributed state
- operational complexity

The architecture should match the application's business requirements.

A small internal application may not need multi-region active-active infrastructure.

A global authentication provider may.

---

# 107. Scaling and Operational Complexity

Every new infrastructure component adds:

- monitoring
- upgrades
- security configuration
- failure modes
- cost
- on-call responsibility

Before adding a component, ask:

```text
What measured problem does this solve?
What simpler option was rejected?
How will we operate it?
How will it fail?
How will we remove it?
```

---

# 108. Reference Architecture: Production Baseline

A strong production baseline can look like:

```text
                         Internet
                            |
                       WAF / LB
                            |
              +-------------+-------------+
              |             |             |
            API-1         API-2         API-3
              |             |             |
              +-------------+-------------+
                            |
             +--------------+--------------+
             |                             |
           Redis                      PostgreSQL
             |                       /          \
        Sessions /                Primary       Replica
        rate limits                   |
                                   Backups

             API
              |
             Queue
              |
           Workers
              |
        Email Provider

All components
      |
      v
Metrics / Logs / Traces
```

This architecture is sufficient for a large class of production applications without requiring sharding or multi-region complexity.

---

# 109. Reference Architecture: Multi-Region

For systems that genuinely require geographic redundancy:

```text
                    Global Router
                   /             \
             Region A           Region B
             /      \           /      \
           API      API       API      API
             \      /           \      /
             Redis                Redis
                \                 /
                 \               /
                 Replicated Data Layer
                         |
                  Durable Storage
```

The exact implementation must define:

- data ownership
- replication direction
- conflict handling
- failover
- session behavior
- password-change propagation
- rate-limit behavior

A diagram alone is not an implementation.

---

# 110. Practical Scaling Roadmap

A sensible progression is:

```text
1. Correct single deployment
        |
2. Add monitoring
        |
3. Externalize durable state
        |
4. Add horizontal API scaling
        |
5. Add shared sessions/rate limits
        |
6. Add connection pooling
        |
7. Add background jobs
        |
8. Add database replicas if needed
        |
9. Add high availability
        |
10. Add advanced partitioning/sharding only if required
        |
11. Add multi-region only if requirements justify it
```

The sequence may differ for a particular workload.

---

# 111. What to Measure Before Each Stage

Before horizontal scaling:

```text
CPU
memory
request latency
DB connections
```

Before Redis:

```text
session read volume
rate-limit requirements
latency requirements
```

Before read replicas:

```text
read/write ratio
replication lag tolerance
query patterns
```

Before partitioning:

```text
table size
query performance
write volume
retention requirements
```

Before sharding:

```text
single-primary limits
data distribution
cross-entity queries
operational requirements
```

Before multi-region:

```text
RTO
RPO
geographic latency
consistency requirements
regional failure impact
```

---

# 112. Interview Question: Why Stateless APIs?

A strong answer:

> Stateless application instances allow requests to be routed to any healthy server. Session and durable state are stored in shared infrastructure, so instances can be added, removed, or replaced without breaking user sessions.

---

# 113. Interview Question: Why Redis for Sessions?

A strong answer:

> Redis provides low-latency shared storage with TTL support, making it useful for ephemeral session state. PostgreSQL can remain the durable source of truth for user data. The tradeoff is that Redis becomes an additional dependency that needs availability and failure planning.

---

# 114. Interview Question: Why Not Store Sessions in Memory?

A strong answer:

> Process memory is local to one instance. In a horizontally scaled deployment, another instance cannot see that state. Shared session storage allows any healthy instance to validate the same session.

---

# 115. Interview Question: Why Not Use Sticky Sessions?

A strong answer:

> Sticky sessions can reduce routing changes but they do not solve instance failure or provide durable shared state. Externalizing session state makes horizontal scaling and failover more robust.

---

# 116. Interview Question: What Becomes the Bottleneck First?

There is no universal answer.

Possible bottlenecks include:

- password hashing CPU
- PostgreSQL
- Redis
- network
- connection pools
- external providers
- rate-limit infrastructure
- queue workers

The correct engineering answer is:

> Measure the workload and identify the actual bottleneck.

---

# 117. Interview Question: How Would You Scale to Millions of Users?

A strong structured answer:

1. Make API instances stateless.
2. Put them behind a load balancer.
3. Externalize sessions and rate limits.
4. Optimize PostgreSQL indexes and queries.
5. Add connection pooling.
6. Move email to asynchronous workers.
7. Add read replicas where consistency permits.
8. Monitor password-hashing CPU separately.
9. Load test realistic traffic.
10. Introduce partitioning or sharding only if measured limits require it.
11. Add multi-region architecture only when availability or latency requirements justify it.

---

# 118. Interview Question: How Does Rate Limiting Scale?

A strong answer:

> A local in-memory limiter is not globally accurate once multiple instances exist. For a global policy, instances need shared rate-limit state, commonly backed by Redis or another distributed counter system. The design must also define behavior when that shared dependency is unavailable.

---

# 119. Interview Question: Why Are Read Replicas Dangerous for Authentication?

A strong answer:

> Replicas can lag behind the primary. If a security-sensitive operation changes state and a subsequent authentication request reads stale data, the system can make an incorrect decision. Security-sensitive reads therefore need an explicit consistency strategy.

---

# 120. Interview Question: Why Is Password Hashing a Scaling Concern?

A strong answer:

> Password hashing is intentionally CPU- and memory-intensive to make password cracking expensive. That means login traffic can consume much more compute than ordinary API traffic. Authentication capacity therefore needs to be measured separately from generic request capacity.

---

# 121. Interview Question: Why Use Queues for Email?

A strong answer:

> Email providers are external and can be slow or temporarily unavailable. A queue lets the authentication request complete without waiting for email delivery, while workers handle retries and provider failures independently.

---

# 122. Interview Question: What Is the Difference Between Scaling and High Availability?

Scaling increases capacity.

High availability reduces downtime.

They overlap but are not identical.

Example:

```text
10 API instances in one zone
```

may provide more capacity than:

```text
2 API instances
```

but still have a large zone-level failure risk.

---

# 123. Interview Question: When Would You Shard?

A strong answer:

> Only after measuring that a well-optimized single primary and conventional replication cannot meet the required workload. Sharding increases routing, transaction, migration, and operational complexity, so it should solve a demonstrated bottleneck.

---

# 124. Interview Question: What Happens If Redis Goes Down?

A strong answer:

> It depends on what Redis stores. For security-sensitive session state, the system should have an explicit fail-closed or carefully designed fallback policy. For ordinary cache data, the application may bypass the cache and use the authoritative store. The important part is that the failure behavior is designed rather than accidental.

---

# 125. Interview Question: How Do You Prevent Autoscaling From Taking Down the Database?

A strong answer:

> Treat database connections as a shared capacity budget. Bound connection pools per instance, monitor database saturation, and scale API capacity together with dependency limits. More API instances should not create unbounded database connections.

---

# 126. Final Scaling Principles

A scalable authentication system follows a small number of durable ideas:

1. Keep API instances horizontally scalable.
2. Externalize shared state.
3. Protect PostgreSQL with good schema and query design.
4. Use Redis deliberately for appropriate ephemeral workloads.
5. Scale password hashing as its own workload.
6. Use distributed rate limiting when multiple instances require global limits.
7. Move slow external work to queues.
8. Bound concurrency and connection pools.
9. Measure before introducing complexity.
10. Test realistic traffic.
11. Design dependency failure behavior explicitly.
12. Treat security requirements as non-negotiable.
13. Add replicas, partitioning, sharding, and regions only when justified.
14. Make consistency requirements explicit.
15. Treat backups and recovery as part of scalability and reliability.
16. Scale the bottleneck, not the diagram.

---

# 127. Acceptance Criteria

The scaling design is complete when the team can answer:

### Application

- Can another API instance be added without changing client behavior?
- Can an instance fail without losing all sessions?
- Can instances shut down gracefully?

### Database

- Is the connection budget known?
- Are critical queries indexed?
- Is database failover documented?
- Are backups tested?

### Redis

- Is its role documented?
- Are TTLs defined?
- Is failure behavior documented?
- Is capacity monitored?

### Security

- Do rate limits work across instances?
- Can revoked sessions remain invalid?
- Can reset tokens remain one-time use?
- Does scaling preserve auditability?

### Background jobs

- Can workers scale independently?
- Are retries bounded?
- Are jobs observable?
- Is duplicate processing safe?

### Operations

- Are p95/p99 latencies monitored?
- Are saturation signals monitored?
- Are load tests repeatable?
- Are failure scenarios tested?

### Advanced scale

- Is there evidence for read replicas?
- Is there evidence for partitioning?
- Is there evidence for sharding?
- Is there a documented reason for multi-region deployment?

---

# 128. Verification Commands

The implementation and documentation should be verified locally.

From the repository root:

```bash
cd ~/Dev/Projects/shipstack
```

Inspect the scaling document:

```bash
wc -l scenarios/authentication/scaling.md
```

Check repository state:

```bash
git status --short
```

Build the current authentication reference:

```bash
cd scenarios/authentication/src
npm run typecheck
npm run build
npm test
```

Return to the repository:

```bash
cd ~/Dev/Projects/shipstack
```

Review the complete authentication scenario:

```bash
find scenarios/authentication -maxdepth 2 -type f | sort
```

---

# 129. Definition of Done

The scaling scenario is considered complete when:

- scaling principles are documented
- horizontal API scaling is explained
- session scaling is explained
- database scaling is explained
- Redis scaling is explained
- rate-limit scaling is explained
- caching is explained
- password-hashing capacity is explained
- asynchronous workloads are explained
- queue scaling is explained
- capacity planning is explained
- load testing is explained
- failure handling is explained
- multi-zone architecture is explained
- multi-region tradeoffs are explained
- scaling milestones are documented
- anti-patterns are documented
- interview questions are included
- production limitations are explicit
- no numerical capacity claim is presented as a universal guarantee

---

# 130. Closing

The strongest scaling architecture is not the one with the most infrastructure.

It is the one that can explain:

```text
What is the current bottleneck?
Why is it the bottleneck?
What evidence proves it?
What is the smallest change that fixes it?
What new failure mode does that change introduce?
How will we measure the result?
```

That is the mindset this authentication scenario is designed to teach.

Scale deliberately.

Measure continuously.

Keep security and correctness intact.
