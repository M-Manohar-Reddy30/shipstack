# API: Secure File Upload and Processing

## 1. Conventions

- Base path: `/api/v1`.
- Authentication is required for all file operations.
- Use HTTPS in deployed environments.
- Request and response bodies use JSON except for file content.
- Return a request ID for troubleshooting.
- Enforce authorization on every file-specific request.

## 2. Create an upload

`POST /api/v1/files`

Creates a file record and begins an upload. The implementation may use streaming multipart upload or a separate upload-session workflow.

Example response (`202 Accepted`):

```json
{
  "id": "file_123",
  "status": "quarantined",
  "sizeBytes": 524288,
  "checksumSha256": "example-digest",
  "createdAt": "2026-01-01T12:00:00Z"
}
```

The example is illustrative. Production identifiers, checksums, and timestamps must come from actual data.

## 3. Get file status

`GET /api/v1/files/{fileId}`

Returns metadata and processing state when the caller is authorized to access the file.

Example response (`200 OK`):

```json
{
  "id": "file_123",
  "status": "processing",
  "sizeBytes": 524288,
  "createdAt": "2026-01-01T12:00:00Z",
  "updatedAt": "2026-01-01T12:00:05Z"
}
```

## 4. List files

`GET /api/v1/files?limit=20&cursor=...`

Lists only files visible to the authenticated user or tenant. Use bounded page sizes and opaque cursors. Never allow clients to override the owner identity in the query.

## 5. Download an approved file

`GET /api/v1/files/{fileId}/download`

Returns file content or a short-lived download URL only if the file is approved and the caller is authorized. Never expose quarantine objects.

## 6. Delete a file

`DELETE /api/v1/files/{fileId}`

Marks the file as deleted and schedules object cleanup. The file must immediately become unavailable for download, even if physical deletion is delayed.

## 7. Error responses

Use a consistent error structure:

```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "The uploaded file exceeds the permitted size.",
    "requestId": "req_example"
  }
}
```

Common status codes:

- `400 Bad Request`: malformed input.
- `401 Unauthorized`: authentication is missing or invalid.
- `403 Forbidden`: the caller lacks permission.
- `404 Not Found`: the file does not exist or must not be disclosed to this caller.
- `409 Conflict`: incompatible state transition or idempotency conflict.
- `413 Content Too Large`: upload exceeds the configured limit.
- `415 Unsupported Media Type`: unsupported content type.
- `429 Too Many Requests`: rate limit exceeded.
- `500 Internal Server Error`: unexpected server failure.
- `503 Service Unavailable`: required infrastructure is unavailable.

## 8. Idempotency and retries

For upload creation, support an idempotency key where the upload protocol permits it. Scope keys to the authenticated owner and reject reuse with conflicting parameters.

Clients may retry transient failures using bounded backoff. A timeout does not prove that an upload failed; query its status or retry with the same idempotency key.

## 9. Security requirements

- Enforce authentication and object-level authorization.
- Apply request, file-size, concurrency, and rate limits.
- Validate actual file content instead of trusting filenames or declared MIME types.
- Keep storage private and prevent path traversal.
- Never expose storage credentials, internal paths, or raw scanner output.

## 10. API implementation status

This document defines the intended API contract. Treat endpoints as implemented only after their handlers and automated tests exist.
