# Secure File Upload and Processing

## Overview

This ShipStack scenario documents how to design a secure, reliable file-upload system that accepts untrusted files, validates them, processes them asynchronously, and makes approved files available to authorized users.

The scenario emphasizes security boundaries, durable processing, file integrity, operational visibility, and failure recovery.

## Problem statement

Applications often accept documents, images, and other files from users. Treating uploads as ordinary HTTP requests creates risks such as malicious content, oversized payloads, unauthorized access, storage exhaustion, and unreliable processing.

A robust design separates upload acceptance from file processing and file delivery.

## Goals

- Authenticate and authorize file operations.
- Enforce file-size and file-type restrictions.
- Keep new uploads in private quarantine storage.
- Process files asynchronously through a durable job queue.
- Integrate malware scanning before approving files.
- Make processing status observable and retries safe.
- Serve only approved files to authorized users.
- Document deployment, scaling, testing, and failure recovery.

## Non-goals

- Building a general-purpose cloud storage product.
- Guaranteeing that any scanner detects every malicious file.
- Supporting every file format or unlimited upload sizes.
- Making quarantined uploads publicly accessible.
- Claiming production readiness without implementation and security testing.

## Reference technology choices

- **Language:** TypeScript
- **Runtime:** Node.js
- **HTTP API:** Express
- **Metadata database:** PostgreSQL or an equivalent transactional database
- **Object storage:** Private S3-compatible storage or an equivalent service
- **Job queue:** A durable queue, optionally backed by Redis
- **Malware scanning:** An approved scanner integration, such as ClamAV

Database, object storage, queue, and scanner integrations are architectural options until they are implemented and tested in the reference code.

## Architecture at a glance

1. An authenticated client submits a file through the upload API.
2. The API validates the request and enforces size and rate limits.
3. The file is stored privately in quarantine, and its metadata is recorded.
4. A durable job queue schedules asynchronous validation and processing.
5. A worker verifies file content and invokes the configured malware scanner.
6. Approved files are published to private approved storage.
7. Authorized clients retrieve file status or download approved content.

The implementation must define recovery behavior for partial writes, duplicate jobs, queue outages, and worker crashes.

## File lifecycle

`uploading` → `quarantined` → `processing` → `approved`

Alternative terminal states include `rejected`, `failed`, and `deleted`. Only approved files may be downloaded, subject to authorization.

## Security principles

- Treat all uploaded content and client-supplied metadata as untrusted.
- Keep quarantine and approved storage private.
- Check ownership or tenant permissions on every file-specific request.
- Never trust a filename extension or declared MIME type by itself.
- Fail closed when required security scanning cannot complete.
- Apply resource limits to uploads, parsers, archives, and workers.
- Do not expose secrets, internal storage paths, or file contents in logs.

## Documentation guide

- `requirements.md`: functional and nonfunctional requirements.
- `architecture.md`: system components and data flow.
- `data-model.md`: file metadata and processing state.
- `api.md`: HTTP endpoints and error contracts.
- `security.md`: threats and required security controls.
- `implementation.md`: implementation structure and design decisions.
- `testing.md`: verification strategy.
- `observability.md`: logs, metrics, traces, and alerts.
- `deployment.md`: configuration and release procedures.
- `scaling.md`: capacity and throughput considerations.
- `failure-modes.md`: recovery and resilience scenarios.
- `interview.md`: engineering discussion questions.

## Current status

This scenario is a reference design. Documented architecture and security controls must not be interpreted as implemented features until code, configuration, and tests demonstrate them.
