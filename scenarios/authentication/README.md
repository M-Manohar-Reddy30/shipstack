# Production-Grade Authentication

> Design authentication as an engineering system — not just a login form.

Authentication is one of the first systems developers build and one of the
easiest places to introduce serious security and reliability problems.

This SHIPSTACK scenario takes authentication from requirements to production.

## What You Will Build

A production-oriented authentication system supporting:

- User registration
- Login
- Logout
- Secure sessions
- Password reset
- Authorization
- Rate limiting
- Security controls
- Automated testing
- Observability
- Deployment
- Failure handling
- Scaling

## Engineering Lifecycle

```text
Requirements
     ↓
Architecture
     ↓
Data Model
     ↓
API Contract
     ↓
Implementation
     ↓
Security
     ↓
Testing
     ↓
Observability
     ↓
Deployment
     ↓
Scaling
     ↓
Failure Modes
     ↓
Interview
## Scenario Philosophy

This scenario does not assume that a technology is automatically correct
because it is popular.

Every important engineering decision should answer:

> What are we doing?

> Why are we doing it?

> What alternatives exist?

> What trade-offs are we accepting?

> How can we verify that the decision works?

## Technology Direction

The reference implementation is designed around:

- TypeScript
- Node.js
- Next.js
- PostgreSQL
- Redis
- Docker
- GitHub Actions

Technology choices are implementation details.

The engineering principles should remain useful even when the technology
changes.

## Evidence Over Claims

SHIPSTACK does not treat statements such as:

- "secure"
- "scalable"
- "production-ready"

as evidence.

Important claims should be supported by reproducible tests, measurements,
documentation, or other engineering evidence.

## Scenario Map

| Document | Purpose |
|---|---|
| [Requirements](./requirements.md) | Define the problem and constraints |
| [Architecture](./architecture.md) | Define system boundaries and decisions |
| [Data Model](./data-model.md) | Design persistence and relationships |
| [API](./api.md) | Define API contracts |
| [Implementation](./implementation.md) | Explain implementation |
| [Security](./security.md) | Analyze threats and mitigations |
| [Testing](./testing.md) | Define the verification strategy |
| [Observability](./observability.md) | Define logs, metrics, and traces |
| [Deployment](./deployment.md) | Define the production delivery path |
| [Scaling](./scaling.md) | Explain how the system evolves with load |
| [Failure Modes](./failure-modes.md) | Understand how the system fails |
| [Interview](./interview.md) | Connect engineering decisions to technical interviews |

## Prerequisites

You should have a basic understanding of:

- HTTP
- REST APIs
- JavaScript or TypeScript
- SQL
- Git
- Basic web security

You do not need to know every technology listed above before starting.

## Goal

By completing this scenario, you should be able to explain not only how
authentication works, but also why the system is designed the way it is,
how it can be tested, how it can fail, and how it can evolve.
