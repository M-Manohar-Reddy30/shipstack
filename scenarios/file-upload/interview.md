# Interview Guide: Secure File Upload and Processing

## 1. Explain the system

This system accepts user-uploaded files, stores them privately in quarantine, processes them asynchronously, validates their content, performs required malware scanning, and allows authorized users to download approved files.

The design separates the upload API from processing workers so that slow scanning and conversion do not need to run inside the original HTTP request.

## 2. Why process files asynchronously?

File validation and scanning can take significant time and consume CPU or memory. Performing all work synchronously increases request latency and makes uploads more vulnerable to request timeouts.

A durable queue lets the API accept work after required persistence succeeds, while independent workers process files with controlled concurrency and retry behavior.

The design must account for the gap between database persistence and queue publication, for example with a transactional outbox or reconciliation process.

## 3. Why quarantine uploads?

Uploaded content is untrusted. Quarantine prevents files from becoming downloadable before required validation and scanning finish.

Quarantine storage should be private, isolated from approved storage, and inaccessible through normal download endpoints. A scanner failure must never be treated as approval.

## 4. Why not trust file extensions or MIME types?

Extensions and declared MIME types are supplied or influenced by the client and can be misleading. The server should validate file signatures and supported formats, enforce size limits, and apply content-specific checks.

No single signature check proves that a file is safe, so validation must be combined with scanning and safe processing.

## 5. How do you prevent unauthorized downloads?

Authenticate callers and perform object-level authorization for every file operation. Derive ownership from the authenticated identity, not from client-supplied owner fields.

Downloads must be allowed only for approved files. Quarantined, rejected, failed, and deleted files must remain unavailable, even when a client knows a file identifier.

## 6. How do you handle duplicate queue messages?

Assume the queue provides at-least-once delivery unless the selected technology guarantees otherwise. Make processing idempotent using stable job identifiers, conditional state transitions, and safe-to-repeat storage operations.

Do not let an old retry overwrite a newer result or publish a file that has since been deleted.

## 7. What happens if the scanner is unavailable?

Keep the file quarantined and do not approve it. Apply bounded retries, record a safe failure category, and alert operators when scanner availability or latency crosses defined thresholds.

Security checks must fail closed. Availability problems are not a reason to bypass required scanning.

## 8. How do you handle partial failures across the database, storage, and queue?

These systems generally do not share one atomic transaction. Define an explicit persistence sequence, track incomplete operations, and use an outbox or reconciliation workflow to recover gaps between metadata commits and queue publication.

Make operations idempotent and ensure files cannot become downloadable until their approved state and storage location are consistent.

## 9. How would you scale the system?

Scale stateless API instances independently from processing workers. Use a durable queue to absorb temporary bursts, and adjust worker concurrency based on queue age, CPU, memory, scanner capacity, and storage performance.

Apply backpressure and tenant quotas to prevent overload. Adding workers alone will not help when a shared dependency is saturated.

## 10. How would you investigate stuck files?

Inspect file states, job attempts, queue depth, oldest-job age, scanner health, storage errors, and recent deployments. Use request IDs, file IDs, job IDs, logs, metrics, and traces to correlate events without logging file contents or secrets.

Use a reconciliation process to identify incomplete uploads, missing objects, orphaned objects, and jobs that require safe retry or operator review.

## 11. How do you prevent archive bombs and path traversal?

Restrict archive entry counts, nesting depth, total decompressed size, processing time, and temporary disk usage. Reject archive paths that escape the designated extraction directory, and never extract files using untrusted paths without validation.

## 12. How should file deletion work?

First revoke application-level access and mark the file deleted through a valid state transition. Then schedule physical object cleanup as a retryable operation.

This separates immediate access revocation from potentially delayed storage cleanup. Cleanup failures should remain observable and must not restore download access.

## 13. What would you monitor in production?

Monitor upload success and failure rates, API latency, queue depth, oldest queued-job age, processing duration, retry counts, scanner availability, storage usage, and cleanup backlog.

Use structured logs and correlation identifiers to investigate individual failures. Avoid high-cardinality metric labels and never log file contents or credentials.

## 14. What are the main trade-offs?

- **Synchronous versus asynchronous processing:** synchronous flows are simpler, but asynchronous workers improve isolation and throughput at the cost of queue and recovery complexity.
- **Local disk versus object storage:** local disk may be simpler for a single instance, but shared private object storage supports independent scaling and instance replacement.
- **Immediate deletion versus asynchronous cleanup:** immediate physical deletion can be difficult across systems; immediate access revocation with retryable cleanup is more resilient.
- **Throughput versus isolation:** more worker concurrency can increase throughput but also increases resource consumption and dependency contention.
- **Security versus availability:** required security checks must not be bypassed just to keep files flowing.

## 15. Implementation discussion checklist

- [ ] Explain the trust boundaries and upload lifecycle.
- [ ] Explain authentication and object-level authorization.
- [ ] Explain quarantine and the approval decision.
- [ ] Explain idempotency and recovery from partial failures.
- [ ] Explain queue-based processing and backpressure.
- [ ] Explain the security test strategy.
- [ ] Explain operational metrics and incident response.
- [ ] Clearly distinguish implemented behavior from planned integrations.

## 16. Final interview advice

Describe the system as a set of explicit guarantees and trade-offs. Support claims with implementation details, automated tests, and measured results. Do not claim malware detection, durable delivery, or production readiness unless the chosen integrations and failure behavior have been verified.
