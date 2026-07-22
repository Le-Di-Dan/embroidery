# Backend API Delivery Standard

## 1. Scope

Applies to `apps/api`, `apps/worker`, backend packages, and API-facing contracts.

## 2. API checkpoint size

An API means one HTTP method plus one route.

Examples:

- `GET /admin/products` = one API.
- `GET /admin/products/:productId` = a second API.
- `POST /admin/products` = a third API.

Rules:

- Preferred: one to three APIs.
- Maximum: five APIs.
- APIs in one checkpoint must share one aggregate/use-case boundary.
- Swagger infrastructure, health, and metrics endpoints do not count as feature APIs, but still require review.
- A provider webhook counts as an API and is normally isolated because of signature, idempotency, and security concerns.

## 3. NestJS layering

Every feature follows the existing modular monolith responsibilities:

```text
presentation
→ application
→ domain
→ infrastructure ports/adapters
```

- Controllers are thin.
- Application handlers own use-case orchestration and transaction coordination.
- Domain/application boundaries protect lifecycle and invariants.
- Repositories expose domain-oriented operations.
- No cross-module repository access.
- Drizzle/PostgreSQL types do not leak into transport or domain contracts.

## 4. Required API contract elements

Every endpoint must define:

- Stable operation ID.
- Tag/module.
- Method and path.
- Actor and authorization policy.
- Request path/query/header/body schema.
- Success status and response DTO.
- Standard response envelope.
- Error codes and transport statuses.
- Idempotency requirements.
- Pagination/filter/sort semantics where applicable.
- Concurrency/conflict behavior where applicable.
- Audit action where applicable.
- Rate-limit/security notes where applicable.

## 5. Swagger/OpenAPI

NestJS Swagger is mandatory.

- Controllers and DTOs must generate accurate OpenAPI.
- Schemas must not be left as untyped generic objects.
- Operation IDs remain stable because the frontend client depends on them.
- Examples must not contain secrets or real PII.
- Error responses must be documented, not only success responses.
- The generated OpenAPI document is checked in CI for generation success and unintended drift.

## 6. Endpoint grouping examples

Valid checkpoint:

```text
POST /admin/products
GET  /admin/products/:productId
PATCH /admin/products/:productId
```

Prefer separate checkpoint:

```text
POST /admin/products/:productId/publish
POST /admin/products/:productId/unpublish
```

Publish transitions are separated because they involve lifecycle, permission, validation, visibility, and audit behavior.

Invalid checkpoint:

```text
All product, asset, inventory, template, publication, and storefront APIs
```

## 7. Validation and errors

Validation occurs at transport, application, domain, and infrastructure boundaries.

- Frontend validation is never authoritative.
- Raw PostgreSQL, storage, queue, or provider errors never reach clients.
- Constraint/guard violations map to stable client-safe error codes.
- State conflicts use explicit conflict semantics.
- Not-found must not leak unauthorized object existence when security requires concealment.

## 8. Transactions, concurrency, and side effects

- Transaction boundaries belong to application use cases.
- External provider calls do not occur inside long database transactions.
- Committed work that requires asynchronous consequences uses outbox/reliable delivery.
- Critical operations preserve DB7/DB8 transaction and concurrency guarantees.
- Idempotency is mandatory for customer submission retries, payment callbacks, jobs, and other identified duplicate-prone operations.

## 9. API checkpoint evidence

Minimum evidence:

- Unit/use-case tests.
- Repository integration test when persistence is involved.
- HTTP integration tests.
- Authorization negative tests.
- Validation/error tests.
- OpenAPI generation check.
- Contract/client generation check when contract changes.
- Changed endpoint table in the completion report.
