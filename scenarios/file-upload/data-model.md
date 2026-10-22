# Data Model: Secure File Upload and Processing

## 1. Design goals

Store enough metadata to authorize access, track processing, verify integrity, support retries, and audit important events without placing file contents in the database.

## 2. File record

| Field | Type | Purpose |
|---|---|---|
| id | UUID | Stable file identifier |
| owner_id | UUID | User or tenant that owns the file |
| original_filename | Text | Sanitized display name supplied by the client |
| storage_key | Text | Server-generated quarantine object key |
| approved_storage_key | Text, nullable | Object key after successful processing |
| declared_content_type | Text | Client-declared MIME type; untrusted |
| detected_content_type | Text, nullable | Type determined from file content |
| size_bytes | Integer | Actual number of bytes accepted |
| checksum_sha256 | Text | Digest of the accepted file content |
| status | Enum | Current lifecycle state |
| failure_code | Text, nullable | Safe machine-readable processing failure |
| created_at | Timestamp | Record creation time |
| updated_at | Timestamp | Most recent state change |
| expires_at | Timestamp, nullable | Retention or expiration deadline |

## 3. Processing job record

| Field | Type | Purpose |
|---|---|---|
| id | UUID | Stable job identifier |
| file_id | UUID | Associated file |
| attempt_count | Integer | Number of processing attempts |
| status | Enum | queued, running, succeeded, retrying, or dead-lettered |
| available_at | Timestamp | Earliest eligible processing time |
| locked_until | Timestamp, nullable | Worker lease expiry |
| last_error_code | Text, nullable | Sanitized failure category |
| created_at | Timestamp | Job creation time |
| updated_at | Timestamp | Most recent job change |

## 4. Lifecycle states

- `uploading`: bytes are still being received.
- `quarantined`: bytes are stored privately and await validation.
- `queued`: a processing job has been published or is awaiting dispatch.
- `processing`: a worker currently owns the processing attempt.
- `available`: all required checks passed and download is permitted.
- `rejected`: content failed a security or policy check.
- `failed`: processing cannot continue after retry policy is exhausted.
- `deleted`: the file has been logically deleted and is unavailable.

## 5. State transition rules

- Only validated, scanned content can transition to `available`.
- A retryable error may return a job to `retrying` or `queued`.
- A permanent validation or malware failure transitions the file to `rejected`.
- Exhausted transient retries transition the file to `failed`.
- A deleted file must never become downloadable again.
- State updates should use conditional writes or version checks to avoid races.

## 6. Constraints and indexes

- Primary key on `file.id`.
- Index files by `(owner_id, created_at)` for user listings.
- Index files by `(status, updated_at)` for operational recovery jobs.
- Index jobs by `(status, available_at)` for queue dispatch and retries.
- Use a unique idempotency key scoped to the owner when upload creation supports retries.
- Enforce non-negative file size and bounded attempt counts.
- Use foreign keys between processing jobs and file records where supported.

## 7. Integrity and consistency

Compute SHA-256 while streaming bytes and verify it during processing when practical. Do not trust a checksum supplied by the client as proof of integrity.

Object storage and the metadata database do not share one transaction. Use compensating cleanup, reconciliation jobs, and a transactional outbox or equivalent durable dispatch strategy to recover from partial failures.

## 8. Privacy and retention

Store only necessary metadata. Do not persist file contents, authentication tokens, or sensitive file data in application logs. Apply retention rules to quarantine objects, approved objects, job records, and audit records.
