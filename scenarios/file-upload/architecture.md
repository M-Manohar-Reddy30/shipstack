# Architecture: Secure File Upload and Processing

## 1. Architecture overview

The service separates upload acceptance, file storage, metadata management, and asynchronous processing. An upload is not downloadable merely because the API accepted its bytes.

## 2. Components

### Upload API

An Express API authenticates users, authorizes the operation, validates request metadata, enforces size limits, streams content to private quarantine storage, and creates a processing record.

### Metadata database

Stores file identifiers, owner identifiers, generated storage keys, detected content type, byte size, checksum, processing status, timestamps, and failure information.

### Quarantine object storage

Stores newly uploaded content in a private location. Objects are not publicly accessible, and client filenames are never used directly as storage paths.

### Durable queue

Carries file-processing jobs. Jobs reference file identifiers rather than embedding file contents. Queue delivery may be repeated, so workers must be idempotent.

### Processing worker

Loads the quarantined object, verifies integrity, performs file-signature and policy checks, invokes a configured malware scanner, and applies any permitted transformations.

### Approved storage

Contains only files that have passed the required checks. Downloads still require authentication and authorization.

## 3. Upload lifecycle

1. Authenticate the caller and verify upload permission.
2. Validate the declared request parameters and enforce upload limits.
3. Stream bytes to private quarantine storage while calculating a checksum.
4. Persist metadata and processing state.
5. Enqueue processing using a durable job mechanism.
6. Validate content, scan for malware, and transform if required.
7. Mark the file available only after all required checks succeed.
8. On failure, retain a safe state, record the outcome, and retry only transient errors.

## 4. Trust boundaries

- Client to API: untrusted requests and file bytes.
- API to storage: service credentials and private object access.
- API to database and queue: authenticated service connections.
- Worker to uploaded content: treat all bytes as potentially malicious.
- Download API to user: recheck ownership and approved status.

## 5. Consistency and failure handling

Database writes and queue publication are not automatically atomic. A production design should use a transactional outbox or a recoverable dispatch process so a committed upload cannot remain permanently unqueued.

Workers should use conditional state transitions, bounded retries, and a dead-letter mechanism for jobs that cannot succeed.

## 6. Storage and processing boundaries

Keep quarantine and approved objects private. Prefer separate storage prefixes or buckets with distinct permissions. The worker should have only the access needed to scan and promote files.

## 7. Deployment model

Run API instances independently from background workers. Use managed object storage, a durable database, and a persistent queue in production. Scale worker concurrency according to CPU, memory, file size, and scanner capacity.

## 8. Reference implementation limitations

This document describes the target architecture. The executable reference code and its configured integrations must be documented separately; optional components are not considered implemented until verified by tests and configuration.
