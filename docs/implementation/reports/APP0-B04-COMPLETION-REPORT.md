# APP0-B04 — Actor context and audit metadata foundation — Completion report

Checkpoint: `APP0-B04`
Phase: [APP0 — Application Delivery Foundation](../phases/APP0-APPLICATION-DELIVERY-FOUNDATION.md)
Verdict: **PASS_WITH_FOLLOW_UPS**

---

## A. Preflight

| Item | Evidence |
|---|---|
| Branch | `production` |
| Initial `HEAD` | `7572a58e89d5efa4ef23c29b27257639683dd2b6` — `feat(api): add global response envelope and safe errors` |
| Initial working tree | Clean (`git status --short` produced no output) |
| Unrelated user changes | None; nothing was reset, stashed or discarded |

### B03 evidence revalidation

| Claim | Result |
|---|---|
| Ancestry `C01 → S01A → S01B → S01B-C1 → B01 → B02 → B03` | Confirmed in `git log -15 --oneline`: `1e03997`, `9de65b0`, `86a082a`, `3563843`, `3a2cdde`, `e6749fa`, `7572a58` |
| B02 request-context tests | Pass before and after this checkpoint (`request-context.service.spec.ts`, `request-id.*`) |
| B03 envelope/error tests | Pass before and after (`api-envelope.factory.spec.ts`, `api-error-mapper.spec.ts`, `api-response.integration.spec.ts`, `contracts-package-boundary.spec.ts`) |
| `pnpm check:openapi` | Passes against the unchanged artifact |
| Gateway remains response-header owner | Unchanged; the API still sets no `X-Request-ID` header |

### Canonical sources read

Repository truth first: `packages/database/src/schema/audit/audit-events.ts` (TBL-072, CST-072), `apps/api/src/modules/audit/domain/repositories/audit-event.repository.ts` (`AuditActor`, `AppendAuditEventInput`), `apps/api/src/platform/request-context/**`, `apps/api/src/platform/http-response/**`, `apps/api/src/bootstrap/app.module.ts`.
Documents: `docs/database/DB3_AUDIT_SPECIFICATION.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md` §8.1, `docs/architecture/REPOSITORY_STRUCTURE.md` §11/§11a, `docs/development/BACKEND_CONVENTIONS.md` §6/§8/§17/§18, `docs/implementation/README.md`, `04-BACKEND-API-DELIVERY-STANDARD.md`, `08-DATABASE-CHANGE-CONTROL.md`, `14-IMPLEMENTATION-DECISION-REGISTER.md`, the APP0 phase plan, and the B02/B03 completion reports.

---

## B. Canonical actor findings

Answered from evidence before any code was written.

| Question | Finding | Source |
|---|---|---|
| Canonical actor kinds | `ADMIN`, `CUSTOMER`, `SYSTEM` — no more, no fewer | `audit_events.actor_kind` CST-072; `AuditActor`; DB3 §"Actor classes" |
| Canonical term for staff | **`ADMIN`**, not `staff` — the account table is `admin_accounts` | `audit-events.ts`, `AuditActor` |
| Identifier semantics | `ADMIN` → `admin_accounts.id`; `CUSTOMER` → `customers.id` plus an optional `secure_access_grants.id`; `SYSTEM` → a bare `system_job_key` string with no target table | CST-072, REL-105, `AuditActor` |
| Anonymous representation | **Not representable in the audit table**: every kind requires its matching reference, so an unauthenticated caller has no persistable actor. Anonymity therefore exists only in the request view | CST-072 |
| System actor identifier | `system_job_key` — bare value evidence | `audit-events.ts` |
| Existing audit metadata type | `AppendAuditEventInput` (audit module) already fixes `occurredAt`, `actor`, `correlationId`; no platform-level metadata type existed | `audit-event.repository.ts` |
| Required correlation | `correlation_id` is `NOT NULL` on every audit row and is the envelope `meta.requestId` | CST-080, DB3 |
| Timestamp owner | The **application** supplies `occurred_at` (`AppendAuditEventInput.occurredAt: Date`); the database owns only `created_at` | `audit-events.ts`, `AuditActor` contract |
| Existing clock abstraction | `ResponseClock` exists but returns an ISO **string** for the HTTP envelope and is owned by the response layer | `http-response/response-clock.ts` |
| Existing auth implementation | None anywhere in `apps/api/src` — no guard, strategy, cookie or token code | repository search for `*auth*` |
| Package ownership | `packages/contracts` is still type-only for the API (IMP-D018); `packages/domain-types` does not exist on disk | B03 report, `packages/` listing |
| Store extensibility | `RequestContextService` holds one `AsyncLocalStorage`; adding a private slot does not affect B02/B03 behaviour | `request-context.service.ts` |

Two findings changed the plan:

1. The checkpoint specification suggested lowercase kinds and the term `staff`. Repository truth is uppercase `ADMIN`/`CUSTOMER`/`SYSTEM`; the canonical terminology was followed, not the example.
2. `packages/domain-types` does not exist, and `packages/contracts` is not Node-loadable for the API. The actor value therefore stays API-local, as B03's boundary already established.

---

## C. Locked foundation

- **Actor model.** A discriminated union: `ANONYMOUS` (no fields), `ADMIN { adminId }`, `CUSTOMER { customerId, grantId? }`, `SYSTEM { systemJobKey }`. No roles, permissions, provider names, tokens, claims, PII, IP or user-agent. `grantId` is optional because the grant is evidence of authorisation, not part of the identity.
- **Anonymous fallback.** Unbound means anonymous, not missing. Anonymous is a shared frozen constant with no id and no privilege, is never `SYSTEM`, and is not stored as a binding — so APP1 can still bind a real actor after authentication.
- **One-time binding.** `bindActor()` accepts only authenticated kinds, rebuilds the value through its factory, and throws `ActorAlreadyBoundError` on a second call. No overwrite, no merge, no idempotent-same-value exception (no evidence required one).
- **Context placement.** The existing APP0-B02 `AsyncLocalStorage` remains the request scope. No second store, no third-party CLS, no `enterWith()`, no request-scoped provider cascade.
- **Audit metadata.** `{ requestId, actor, occurredAt }` — frozen, side-effect free, transport-free. It is a snapshot, not an audit row: action, target, reason and before/after summary stay with the use case that knows them.
- **Clock.** A dedicated `AuditClock` returning a `Date`. `ResponseClock` was deliberately not reused: it is owned by the HTTP response layer and formats a transport string, and reusing it would make audit metadata depend on the response module and on a display format. `new Date()` appears in neither the factory nor the metadata path.
- **APP1 seam.** `middleware opens context (requestId) → authentication layer validates the credential → it calls bindActor() once → services read getActor()/requireAuthenticatedActor() → AuditMetadataFactory snapshots requestId + actor`. No port, resolver or guard was invented: none has a consumer yet.

---

## D. Implementation

| File | Role |
|---|---|
| `apps/api/src/platform/actor-context/request-actor.ts` | Actor union, kind constants, factories, identifier validation, `sanitizeAuthenticatedActor`, `isAuthenticatedActor` |
| `apps/api/src/platform/actor-context/actor-binding.errors.ts` | `ActorAlreadyBoundError`, `AuthenticatedActorRequiredError` |
| `apps/api/src/platform/request-context/request-context.service.ts` | Private `boundActor` slot; `bindActor`, `getActor`, `getBoundActor`, `requireActor`, `requireAuthenticatedActor`; `get()` now returns a frozen projection |
| `apps/api/src/platform/audit-context/audit-metadata.ts` | `AuditMetadata` snapshot type |
| `apps/api/src/platform/audit-context/audit-clock.ts` | `AuditClock` |
| `apps/api/src/platform/audit-context/audit-metadata.factory.ts` | `AuditMetadataFactory.forCurrentRequest()` |
| `apps/api/src/platform/audit-context/audit-context.module.ts` | `@Global()` module providing/exporting both |
| `apps/api/src/bootstrap/app.module.ts` | Registers `AuditContextModule` |

Request-context extension: the store type changed from `RequestContext` to a private `RequestContextStore` carrying `requestId` plus the actor slot. `run()` still takes a `RequestContext` — what a caller may *open* a context with is unchanged — and `get()` returns `Object.freeze({ requestId })`, so the mutable slot is unreachable through any public value. `requestId` remains readonly and untouched by binding.

Validation: `sanitizeAuthenticatedActor` rebuilds through the factories, which reject a non-string, empty or whitespace identifier and an unknown kind (including `ANONYMOUS`). No new validation framework, no `Record<string, unknown>` bag, no `any`, no unsafe assertion in production code.

Shared-package boundary: nothing was added to `packages/contracts` or any other package. A type-only drift guard imports `AuditActor` in a spec and asserts every authenticated request actor is assignable to it, so the two vocabularies cannot diverge without a compile failure — and no runtime dependency from platform to a business module exists.

---

## E. Behaviour evidence

All from `apps/api/src/platform/**` specs (14 suites, 223 tests, all passing).

| Behaviour | Evidence |
|---|---|
| Anonymous default | `getActor()`/`requireActor()` return `{ kind: 'ANONYMOUS' }` on an unbound request; HTTP probe with no auth returns the same |
| Each authenticated kind binds and is read downstream | Unit `it.each` over admin/customer/system; HTTP test reads the actor in a service the controller never passes it to, after an `await` |
| Second bind rejected | `ActorAlreadyBoundError`; the first actor survives; the error names kinds only, never the bound identifier |
| Invalid actor does not consume the binding | A rejected bind is followed by a successful one |
| Immutability | Constructed actors and snapshots are frozen; writing to them throws `TypeError`; mutating the caller's source object after `bindActor` does not change what the context reports; credential/PII fields attached by the caller are dropped |
| Concurrency isolation | Interleaved unit contexts and three concurrent HTTP requests (admin/customer/anonymous) each observe only their own actor and request id |
| Nesting and error cleanup | A nested context starts unbound and restores the outer actor; a thrown handler leaves no actor behind |
| `requestId` preserved | Unchanged after binding; envelope `meta.requestId` still equals the client-supplied header |
| Metadata snapshot | Exactly `{ actor, occurredAt, requestId }`; instant comes from the injected clock (asserted by spy) and is copied, so mutating the clock's `Date` cannot alter it |
| Outside a request | `forCurrentRequest()`, `requireActor()`, `requireAuthenticatedActor()` and `bindActor()` all throw `RequestContextUnavailableError`; no id is generated and no actor is assumed |

---

## F. Security and privacy evidence

- The actor carries no password, token, cookie, session, JWT claim, provider payload, email, phone, address, IP or user-agent. `sanitizeAuthenticatedActor` actively strips anything extra a caller attaches — asserted with a token/email/roles payload.
- No cookie, header, JWT or session is read anywhere in `actor-context/` or `audit-context/`. No actor value is derived from an untrusted header.
- Audit metadata holds no request/response object, header, body, query, stack or metadata map; a test asserts the serialised snapshot matches none of `header|cookie|authorization|token|body|query|url|ip|userAgent`.
- Binding errors name kinds only; the HTTP rebind test asserts the 500 envelope contains no identifier, no class name and no stack, mapped by the existing B03 filter.
- No default privilege: anonymous is not `SYSTEM`, and `requireAuthenticatedActor()` asserts presence of an identity, never permission.
- The test binder controller lives inside its spec file and is registered only in that file's module. A source scan asserts **no non-spec file outside the service declaration calls `bindActor(`**, so no production route can let a client choose who it is.

---

## G. Regression and validation

| Gate | Command | Result |
|---|---|---|
| Full quality chain | `pnpm quality` | **PASS** (format:check, lint, typecheck, test, check:file-size, check:styles, check:openapi, db:check:manifest) — run with the dev PostgreSQL container up, so the database-backed integration suites executed |
| API build | `pnpm --filter @embroidery/api build` | PASS |
| API typecheck | `pnpm --filter @embroidery/api typecheck` | PASS |
| API lint | `pnpm --filter @embroidery/api lint` | PASS |
| Platform tests (B02 + B03 + B04) | `npx jest src/platform` | 14 suites, 223 tests, PASS |
| API tests excluding database integration | `npx jest --testPathIgnorePatterns integration` | 19 suites, 237 tests, PASS |
| OpenAPI drift | `pnpm check:openapi` | PASS — artifact byte-identical, no security scheme, header or actor field added |
| File size | `node tools/check-file-size.mjs` | PASS; every new file is below the review threshold (largest new source file: 146 lines; largest new test file: 241 lines) |
| Whitespace | `git diff --check` | Clean |
| Changed-file scope | `git status --short` | API platform code, `app.module.ts`, backend conventions, phase plan, this report — nothing else |
| Markdown links | Links in the edited documents resolve to existing files | PASS |

---

## H. Scope confirmation

- No authentication provider, guard, strategy, cookie/JWT/session parsing or credential lookup.
- No authorization, roles or permissions.
- No audit persistence, audit event, log statement or tracing.
- No schema, migration or database change.
- No OpenAPI contract change of any kind.
- No feature endpoint; the only new controller is a test fixture inside a spec file.
- No frontend, worker, Nginx or infrastructure change.
- APP0-B05 not started.

---

## I. Follow-ups

1. **Decision register.** The actor/audit foundation is consequential and deserves an `IMP-D021` row in `14-IMPLEMENTATION-DECISION-REGISTER.md`. That file was outside this checkpoint's allowed scope, so the semantics were locked in `BACKEND_CONVENTIONS.md` §18 instead; the register row should be added by whoever next edits it. (B03 likewise added no row.)
2. **`Date` mutability.** `AuditMetadata.occurredAt` is a `Date` to match `AppendAuditEventInput.occurredAt` exactly. `Object.freeze` protects the field binding but cannot protect a `Date`'s internal time, so the snapshot is defensively copied on creation; a caller that calls `setTime()` on it is still misusing a documented-immutable value.
3. **System actor outside a request.** `AuditMetadataFactory` deliberately has no out-of-request variant. When the worker needs audit metadata, that use case — not APP0 — should define how a job establishes correlation.

---

## J. Verdict

**PASS_WITH_FOLLOW_UPS** — every acceptance criterion is met with executable evidence; the follow-ups above are documentation and future-phase items, not defects.
