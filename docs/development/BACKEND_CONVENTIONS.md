# Backend Conventions

**Status:** Approved technical baseline  
**Version:** 0.2.0

## 1. Scope

These rules apply to:

- `apps/api`.
- `apps/worker`.
- Backend-facing workspace packages.

The backend is a NestJS modular monolith with strict TypeScript and PostgreSQL.

## 2. Module ownership

Each business module owns its:

- Domain concepts.
- Use cases.
- Repository interfaces.
- Persistence adapters.
- Controllers and transport DTOs.
- Events.
- Errors.
- Tests.

A module must not read or mutate another module's database tables through that module's persistence implementation.

## 3. Layer responsibilities

### Domain

Contains:

- Entities.
- Value objects.
- Domain services.
- Domain events.
- Domain errors.
- Repository interfaces when domain-owned.
- Business invariants.

Domain code must not import NestJS, an ORM, HTTP types, queue clients, or vendor SDKs.

### Application

Contains:

- Commands.
- Queries.
- Handlers/use cases.
- Application services.
- Ports.
- Transaction coordination.
- DTOs internal to use cases.
- Mappers between application and domain.

Application code orchestrates domain behavior but does not contain HTTP or persistence details.

### Infrastructure

Contains:

- ORM implementation.
- Repository adapters.
- Object-storage adapters.
- Queue adapters.
- Payment-provider adapters.
- Notification adapters.
- Cache adapters.
- Configuration binding.

Infrastructure implements ports; it does not define business rules.

### Presentation

Contains:

- Controllers.
- Request/response DTOs.
- Guards.
- Presenters.
- Transport-specific validation and mapping.

Controllers remain thin and call application use cases.

## 4. Use-case structure

Use one folder per command or query:

```text
application/commands/create-quotation/
├── create-quotation.command.ts
├── create-quotation.handler.ts
├── create-quotation.validator.ts
└── create-quotation.handler.spec.ts
```

A handler should coordinate one business use case. Split orchestration services when a handler grows beyond one coherent responsibility.

## 5. Domain modeling

- Use explicit domain terms from `DOMAIN-GLOSSARY.md`.
- Model status transitions explicitly.
- Protect invariants inside the domain or application boundary.
- Use value objects for concepts requiring validation or behavior.
- Do not expose ORM entities as domain entities or API responses.
- Do not use strings for domain statuses when a defined type or enum exists.
- Monetary values use exact decimal semantics.
- Timestamps use a consistent UTC strategy.
- IDs use stable typed conventions selected by ADR.

## 6. Standard API response envelope

All internal JSON APIs must return a consistent response envelope.

### Success shape

```ts
interface ApiSuccessResponse<TData, TMeta = ApiResponseMeta> {
  success: true;
  code: string;
  message: string;
  data: TData;
  meta: TMeta;
}
```

Example:

```json
{
  "success": true,
  "code": "QUOTATION_CREATED",
  "message": "Quotation created successfully",
  "data": {
    "quotationId": "quotation-id"
  },
  "meta": {
    "requestId": "request-id",
    "timestamp": "2026-07-13T12:00:00.000Z"
  }
}
```

### Error shape

```ts
interface ApiErrorResponse<TError = ApiFieldError> {
  success: false;
  code: string;
  message: string;
  errors?: TError[];
  meta: ApiResponseMeta;
}
```

Example:

```json
{
  "success": false,
  "code": "INVALID_ORDER_TRANSITION",
  "message": "The order cannot move to production",
  "errors": [
    {
      "field": "status",
      "code": "DEPOSIT_NOT_PAID",
      "message": "A verified deposit is required before production"
    }
  ],
  "meta": {
    "requestId": "request-id",
    "timestamp": "2026-07-13T12:00:00.000Z"
  }
}
```

### Envelope rules

- The envelope does not replace HTTP semantics. Return the correct HTTP status.
- `code` is a stable machine-readable code and must not be derived from free-form text.
- `message` is human-readable and must not be used by clients for branching.
- `data` is present on successful JSON responses, including `null` where the contract explicitly has no payload.
- `errors` contains structured validation or domain details when safe.
- `meta` includes at least `requestId` and `timestamp`.
- Pagination uses `meta.pagination`.
- Sensitive internal details, stack traces, SQL, storage keys, and provider secrets are never included.
- A centralized response mapper/interceptor and centralized exception mapping should enforce consistency.
- Controllers must not manually construct arbitrary response shapes.

Allowed exceptions:

- Binary file or streaming responses.
- Health, liveness, and readiness endpoints when required by platform tooling.
- Third-party webhook acknowledgements that must follow provider contracts.
- Redirect responses.
- Protocol-specific endpoints that cannot use the JSON envelope.

## 8. Controllers and DTOs

Controllers may:

- Validate transport input.
- Resolve authenticated actor.
- Call a use case.
- Map output through a presenter.
- Set transport status and headers.

Controllers must not:

- Query ORM repositories.
- Implement business transitions.
- Calculate money.
- Create approval snapshots.
- Apply payment state.
- Mutate inventory directly.

Transport DTOs are not domain objects.

### API contract and OpenAPI (canonical pointer)

The API contract mechanism is governed by the implementation standards; this section only points to them:

- NestJS Swagger/OpenAPI is **mandatory** for feature APIs. Controllers and DTOs must generate accurate OpenAPI with stable operation IDs.
- The generated OpenAPI document is the contract used to generate TypeScript types and the Axios client. Frontend does not hand-write DTOs where they can be generated; TanStack Query hooks are written manually.
- API checkpoint sizing (endpoint limit, grouping) is governed by delivery governance.

Canonical documents:

- [`docs/implementation/04-BACKEND-API-DELIVERY-STANDARD.md`](../implementation/04-BACKEND-API-DELIVERY-STANDARD.md)
- [`docs/implementation/06-OPENAPI-AND-CLIENT-CONTRACT.md`](../implementation/06-OPENAPI-AND-CLIENT-CONTRACT.md)

## 8. Validation

Validation occurs at multiple boundaries:

- Transport validation for request shape.
- Application validation for use-case preconditions.
- Domain validation for invariants.
- Infrastructure validation for external provider responses.

Never rely solely on frontend validation.

The schema/validation library remains an open decision unless locked by ADR.

## 9. Persistence

The ORM is an open decision.

Regardless of ORM:

- Repositories expose domain-oriented operations.
- Queries should avoid loading unnecessary graphs.
- Transactions are explicit for critical operations.
- Migrations are versioned and tested.
- Database constraints reinforce important invariants.
- Historical quotation and approved-design records are immutable.
- No floating-point storage for money.
- No permanent public asset URLs stored as authority.
- Avoid generic repositories that erase domain meaning.

## 10. Cross-module communication

Approved mechanisms:

- Public application service.
- Explicit port.
- Query contract.
- Domain/application event.
- Shared stable contract where ownership is clear.

Prohibited mechanisms:

- Importing another module's ORM entity.
- Calling another module's concrete repository.
- Writing directly to another module's tables.
- Circular module dependency.
- Event use that hides a synchronous invariant.

Use events for decoupled consequences, not to avoid clear transactional coordination.

## 11. Transactions and side effects

Use explicit transaction boundaries for:

- Approval.
- Payment application.
- Inventory reservation.
- Quotation versioning.
- Production transition.
- Order completion.

Do not call an unreliable external provider inside a database transaction and assume atomicity.

When a committed transaction must cause asynchronous work, use an outbox or equivalent reliable-delivery pattern.

## 12. Idempotency

Idempotency is mandatory for:

- Payment callbacks.
- Payment reconciliation.
- Retried jobs.
- Customer submission where duplicate requests are possible.
- Asset-processing callbacks.
- Notification jobs where duplicate delivery matters.

Idempotency keys and result storage must be scoped and expired intentionally.

## 13. Payment rules

- Verify provider signature.
- Verify amount, currency, and business reference.
- Do not mark success from browser redirect.
- Handle duplicate and out-of-order callbacks.
- Preserve provider references for reconciliation.
- Keep deposit and remaining payment as distinct obligations.
- Never allow production without approved design and verified deposit.
- Never allow delivery without verified remaining payment.
- Log sensitive payloads only in redacted form.

## 14. Asset and upload rules

- Validate file size, signature, MIME type, dimensions, and decoding.
- Sanitize SVG.
- Apply authorized object-storage access.
- Use short-lived signed access where appropriate.
- Keep production and digitized files internal.
- Store metadata in PostgreSQL and binaries in object storage.
- Do not couple domain code to a concrete storage product.
- Cleanup and retention are explicit jobs, not ad hoc controller logic.

## 15. Worker rules

Worker jobs:

- Are small and idempotent.
- Receive stable identifiers, not full mutable domain objects.
- Re-load current authoritative state.
- Record attempts and terminal failures.
- Use bounded retries.
- Expose dead-letter or manual-review behavior.
- Do not duplicate domain rules.
- Do not assume exactly-once delivery.

The concrete queue/broker remains an open decision.

## 16. Configuration and secrets

- All environment configuration is validated at startup.
- Secrets never appear in source, Docker images, logs, or client bundles.
- Business configuration is separated from deployment secrets.
- Timeouts, limits, percentages, and URLs are named configuration values.
- No silent fallback for security-critical settings.
- Production must fail fast when mandatory configuration is missing.

## 17. Error model

Use explicit categories:

- Domain error.
- Validation error.
- Authorization error.
- Conflict/state-transition error.
- Not-found error.
- External-provider error.
- Infrastructure error.

Map internal errors to safe transport responses.

Do not expose stack traces, SQL, storage keys, provider secrets, or internal topology to clients.

## 18. Logging and audit

Application logs and business audit logs are different.

### Application logs

Used for operations:

- Structured.
- Correlated.
- Redacted.
- Severity-based.

#### Structured logging (canonical)

Locked by APP0-B05 (`apps/api/src/platform/logging/`); evidence in [`../implementation/reports/APP0-B05-COMPLETION-REPORT.md`](../implementation/reports/APP0-B05-COMPLETION-REPORT.md).

- Logging is repository-owned and **API-local**: one line of JSON per record, on a fixed platform schema (`schemaVersion`, `timestamp`, `level`, `service`, `event`, `message`, plus request/actor correlation and optional `context`/`http`/`error`/`attributes`). Levels are `debug`/`info`/`warn`/`error`. No third-party logging framework and no remote/file transport; the sink is newline-delimited JSON on stdout/stderr.
- The event taxonomy is platform-only (`application.log`, `http.request.completed`, `platform.error`). Business/audit event names are never emitted from the platform logger.
- Correlation is read from the B02 request context and the B04 actor at emit time; the reserved fields (`timestamp`, `level`, `service`, `requestId`, `actor`, `schemaVersion`) cannot be overridden by a caller — caller data lives only under `attributes`, after redaction.
- **Redaction runs before serialization**: a sensitive-key denylist plus conservative value patterns (bearer tokens, credential URLs, JWTs, PEM blocks, inline secret assignments), with bounded depth/size and circular/throwing-value safety. The query string, request/response body and raw headers/cookies are never logged; a route template is preferred over a concrete path. Stack traces are gated by `LOG_STACK_ENABLED` and default off in production.
- A structured **log is not an audit event** (contrast the audit context above): it persists nothing and satisfies no business audit requirement. The shared `@embroidery/observability` package stays empty until it is made runtime-loadable (IMP-D018); until then the runtime lives in the API.

### Audit logs

Used for business traceability:

- Actor.
- Action.
- Target.
- Before/after or relevant metadata.
- Timestamp.
- Reason where required.
- Immutable retention policy.

### Actor and audit context (canonical)

Locked by APP0-B04 (`apps/api/src/platform/actor-context/`, `apps/api/src/platform/audit-context/`); evidence in [`../implementation/reports/APP0-B04-COMPLETION-REPORT.md`](../implementation/reports/APP0-B04-COMPLETION-REPORT.md).

- The request actor is provider-neutral. Its authenticated kinds are the canonical audit actor kinds — `ADMIN` (admin account id), `CUSTOMER` (customer id, optionally the secure-access grant id) and `SYSTEM` (job key) — plus `ANONYMOUS`, which exists only in the request view and is never persisted.
- An unauthenticated request is anonymous, never absent. Anonymous carries no identifier, role or privilege, and is never treated as `SYSTEM`.
- The actor is bound **once** per request, by the authentication layer, through `RequestContextService.bindActor()`. A second bind fails; there is no silent overwrite and no merge. The bound value is rebuilt through its factory and frozen, so no credential, token, claim set or contact detail can ride along and no caller can change it afterwards.
- `requireAuthenticatedActor()` asserts that an identity exists. It is not an authorization decision.
- Audit metadata (`AuditMetadataFactory.forCurrentRequest()`) is an immutable snapshot of the request id (the audit `correlation_id`), the current actor and the instant from an injected clock. It carries no request, response, header, body, query, token or free-form metadata, writes nothing and logs nothing. Outside a request it fails rather than inventing a correlation id or an actor.

Do not use console logging as the production logging strategy.

## 19. Testing expectations

Backend tests must cover:

- Domain invariants.
- Use-case handlers.
- Repository integration.
- Database constraints and migrations.
- Authorization.
- State transitions.
- Payment idempotency.
- Inventory reservation.
- Approval immutability.
- Object-storage authorization.
- Job retry behavior.
- API contracts.
- Critical end-to-end workflows.

Mocks should isolate external systems, not replace the domain under test.

### 19.1 Integration harness (canonical)

Application/API integration tests reuse the canonical DB7 harness — never a second database harness (APP0-T01):

- `@embroidery/database/testing` owns the whole database lifecycle: unique disposable database naming, create/drop, migration execution, schema/fingerprint verification, pool cleanup, and setup-failure cleanup. Do not reimplement any of it.
- `@embroidery/test-utils` holds only package-neutral teardown orchestration (`CleanupStack`).
- Each app owns its own bootstrap adapter (for the API: `apps/api/test/support/api-integration-context.ts`), which boots the real `AppModule` via the shared `GLOBAL_ROUTE_PREFIX` against a disposable database and exposes a Supertest client. It never imports `AppModule` into a shared package. Integration test code lives under `apps/api/test/**`, outside the compiled production source tree (`apps/api/src/**`), so it can never be emitted into `dist`.
- A mutating integration context must run against a disposable database, refuse the persistent database name, snapshot/restore `DATABASE_URL`/`NODE_ENV` around module init, and drop the database on both success and failure. The persistent development database is read-only in tests.

## 20. Constants and hard-coding

Extract:

- Business percentages.
- Limits.
- Timeouts.
- Status values.
- Event names.
- Error codes.
- Routes and provider endpoints.
- Retention periods.
- Retry policy.
- User-visible messages where backend-owned.

Do not create constants for obvious syntax-only values without domain or reuse meaning.

## 21. File and function discipline

- Source hard limit: 400 lines.
- Test hard limit: 600 lines.
- Review source at 300 lines.
- Review tests at 500 lines.
- Keep functions cohesive.
- Avoid deep nesting.
- Avoid excessive parameters; introduce a named input object when appropriate.
- Split by responsibility and ownership, not arbitrary line count.

## 22. Prohibited patterns

- Fat controllers.
- ORM entities returned directly.
- Generic catch-all service.
- Shared module containing unrelated business logic.
- Cross-module database writes.
- `any` used to suppress design problems.
- Swallowed errors.
- Disabled validation.
- Business logic in decorators or guards.
- Vendor SDK types leaking into domain/application layers.
- Placeholder production implementations.
