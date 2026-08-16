# APP5-G01 — Submission, Moderation & Intake-Abuse Authority · Completion report

## 1. Verdict

```text
APP5-G01 = COMPLETE
```

Documentation/authority only. No runtime code, test, schema, migration, API
contract, generated artifact, package file or Figma node was changed.

Authority package:
[`../audits/APP5_G01_SUBMISSION_MODERATION_AUTHORITY.md`](../audits/APP5_G01_SUBMISSION_MODERATION_AUTHORITY.md).

Baseline: branch `production`, HEAD at entry `ffb43c9`, working tree clean.

## 2. Authority inspected

**Lifecycle / guards** — `DB3_LIFECYCLE_SPECIFICATIONS.md` §LC-11 (eleven
transitions, `R` convention, implicit GRD-019/025) and §LC-02;
`DB3_TRANSITION_GUARD_CATALOG.md` (GRD-001, 002, 012, 019, 020, 025, 026, 027,
030); `ADR-DB3-002` stage matrix S1–S9; `DB3_CANCELLATION_COMPENSATION_SPEC.md`
§2–§3; `apps/api/src/modules/order/domain/lifecycle/request-transitions.ts`.

**Request persistence / port** — `CustomRequestRepository` with
`SubmitRequestInput`, `TransitionRequestInput`, `RequestActor`,
`QuantityBreakdownLine`, `CustomerOwnedProduct`;
`drizzle-custom-request.repository.ts` (`submit`, `transition`, `attachAsset`,
`appendModerationNote`); schema `custom-requests.ts`,
`customer-owned-products.ts`, `custom-request-assets.ts`,
`custom-request-transitions.ts`, `request-moderation-notes.ts`,
`custom-request-quantity-breakdowns.ts`; `DB4_COLUMN_DICTIONARY.md`
COL-TBL037-01…10 and COL-TBL042-02.

**Idempotency** — `ADR-DB1-017` rules 1–8; `DB3_IDEMPOTENCY_SPECIFICATION.md`
(`request.submit` row + rules 1–5); `idempotency_records` (LC-23);
`packages/persistence/src/platform/idempotency-{store,allocation}.ts`;
`DB8_RACE_COVERAGE_MATRIX.md` header and rows.

**Security / abuse** — `09-SECURITY-AND-ABUSE-PREVENTION.md` §4 (`IMP-D044`
intake lanes and limits, `IMP-D047` sanitizer, `IMP-D048` streamed anonymous
session upload) and §5; `ASSET_STATES`, `ASSET_KINDS`,
`ASSET_CLASSIFICATIONS`, `ASSET_INSPECTION_OUTCOMES`.

**Notification / audit** — `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md` SE-001…SE-019 and
its locked in-tx rule; `notification-request.ts` (`NotificationRequest`,
`NotificationReference`); `secure-grant.notifier.ts`; `outbox-events.ts`;
`ADR-DB4-002` Tier A history; `submit-verification-attempt.use-case.ts`;
`contact-verification-challenges.ts`; `verified-contact-evidence.ts`;
`public-verification.controller.ts` and its response schemas.

## 3. Locked decisions summary

### 3.1 APP5 transition subset

| TR | From → To | Actor | Guards | Reason | Note | UI | API |
|---|---|---|---|---|---|---|---|
| TR-LC11-01 | *(submit)* → `NEW` | CUSTOMER | GRD-001, GRD-027 *(catalog only)*, GRD-012/030 | no | no | n/a | `B01` |
| TR-LC11-02 | `NEW` → `UNDER_REVIEW` | ADMIN | — | optional | optional | yes | `B05` |
| TR-LC11-03 | `UNDER_REVIEW` → `NEEDS_CLARIFICATION` | ADMIN | — | **required** | **`CLARIFY`** | yes | `B05` |
| TR-LC11-04 | `NEEDS_CLARIFICATION` → `UNDER_REVIEW` | ADMIN | — | optional | optional | yes | `B05` |
| TR-LC11-10 | `UNDER_REVIEW`\|`NEEDS_CLARIFICATION` → `REJECTED` | ADMIN | S1/S2 disposition | **required** | **`REJECT`/`SPAM`** | yes | `B05` |
| TR-LC11-11 | non-terminal → `CANCELLED` | ADMIN | **GRD-020, stage S1 only** | **required** | optional | yes | `B05` |

`TR-LC11-05…09` are APP6+ — neither offerable nor acceptable. GRD-019/025 apply
implicitly to every row.

### 3.2 Subject XOR

| | Catalog | COP |
|---|---|---|
| `product_id` + `product_variant_id` | **both required** | must be NULL |
| `customer_owned_products` row | must not exist | **exactly one** |
| `submitted_session_id` | required, server-set | must be NULL |
| Design session | required, `ACTIVE` (GRD-027) | impossible by schema |
| Quantity breakdown | ≥1 line, variant must match | optional, variant NULL |
| Attachments | `REFERENCE` optional | **≥1 `COP_IMAGE`** |

Both branches present, or neither ⇒ `SUBMISSION_SUBJECT_INVALID`. Enforced in
the transaction; no CHECK is added, because DB4 assigns the cross-table rule to
TX/App.

### 3.3 `request.submit` idempotency

| Element | Value |
|---|---|
| Namespace | `request.submit` |
| Scope key | the verified `SUBMISSION`-purpose challenge id |
| Client key / client `customerId` | **neither accepted** |
| Fingerprint | branch + subject identity + ordered quantity lines |
| Excluded from fingerprint | `customerNote`, attachment ids, design document hash *(recorded deviation)* |
| Arbiter | `uq_idempotency_records__namespace_scope_key` (GRD-012) |
| `IN_PROGRESS` | deterministic retryable outcome, never a second execution |
| `COMPLETED` | replay stored `{requestId, code, status}` |
| Different fingerprint | `IDEMPOTENCY_CONFLICT`, audited (GRD-030) |
| Failure | rolls back; never auto-repaired to `COMPLETED` |
| TTL class | `submission` (medium) |
| Boundary | claim + all rows + outbox append = one transaction; nothing external inside |

Nine consequences are protected from duplication: request row, code, COP row,
quantity lines, asset bindings, design case, session `ACTIVE→SUBMITTED`, grant
and its notification, SE-003 outbox event.

### 3.4 Request code

Server-generated inside the transaction; client may not supply one; unique via
`uq_custom_requests__code` (23505 retried); immutable; **never an authorization
input**; format `REQ-` + 10 chars from `23456789ABCDEFGHJKMNPQRSTVWXYZ` (CSPRNG).

### 3.5 Asset roles

| Role | Branch | Required | Cap | Media |
|---|---|---|---|---|
| `COP_IMAGE` | COP only | ≥1 | 10 | JPEG/PNG/WebP |
| `REFERENCE` | both | optional | 10 | JPEG/PNG/WebP |
| `ATTACHMENT` | **not exposed by APP5** | — | — | — |

Bound only inside the submission transaction, only when the asset is `ACCEPTED`,
only once, and only by the customer whose challenge authorized the upload. No
post-submission mutation. APP3 session assets remain session-scoped.

### 3.6 Upload abuse policy (governs `APP5-B02`)

Adopts the `IMP-D048` lane wholesale — streamed through the API, no presign, no
upload token, no storage credential, one multipart operation, private object —
and changes only the authorization: a `VERIFIED`, unexpired,
`SUBMISSION`-purpose challenge, unconsumed by a submission. Fully anonymous
upload forbidden. `image/jpeg|png|webp` only, SVG rejected, client MIME never
trusted; 10 MiB; 4096×4096 and 16,777,216 decoded pixels; signature, extension,
decode, timeout and isolation checks; mandatory inspection before binding; 20
accepted uploads per challenge and 10 bound per role; orphans expire on the
existing SE-014/SE-015 sweeps; rejections audited as abuse signals and disclose
one bounded reason class only.

### 3.7 Notification mapping

| Action | SE | Outbox intent | Intent created in APP5 | Rollback on failure |
|---|---|---|---|---|
| Submit — customer | SE-003/SE-002 | `grant.issued` | **yes, already implemented** (grant link) | no |
| Submit — admin alert | SE-003 | `request.submitted` | no | no |
| Needs clarification | SE-004 | `request.clarification-requested` | no | no |
| Rejected | SE-012 | `request.rejected` | no | no |
| Cancelled | SE-012 | `request.cancelled` | no | no |

Outbox append is in-transaction (the one permitted in-tx effect alongside audit);
delivery is after-commit and never rolls back request state. Customer-facing
reason text is always the customer-visible column, never the internal reason.

### 3.8 Audit / correlation

Every APP5 transition persists `custom_request_id`, `from_status`, `to_status`,
`actor_kind`, exactly one actor reference, `reason` where marked `R`,
`customer_visible_reason` where the customer is told, and a real
`correlation_id` (`NOT NULL`). Creation writes **no** transition row.
`audit_events` is not a duplicate of TBL-042 — it receives only the
independently mandated guard-failure abuse signals (GRD-001/026) and GRD-030
conflicts.

## 4. New APP5-G01 decisions

Fourteen rules were not directly inherited. Each is consistent with existing
authority for the reason given.

| ID | Decision | Why it is consistent |
|---|---|---|
| `G01-D01` | Scope key = verified `SUBMISSION` challenge id; no client key, no client `customerId` | The spec says *"server-issued submission key (session-bound)"*, but the COP branch has no session. The challenge is server-issued, universal (GRD-001 makes it a precondition of every submission), session-bound via the real `session_id` FK on the catalog branch, one-to-one with a submission (terminal after `VERIFIED`, TTL-deleted), and rate-bounded by GRD-026. APP4's verification responses deliberately omit `customerId`, so the server must resolve it — which also removes an impersonation vector. |
| `G01-D02` | Fingerprint excludes the design document hash | Including it inverts the contract: the hash is derived from a session that autosaves concurrently (CC-01) and that this transaction mutates to `SUBMITTED`, so an honest retry would raise `IDEMPOTENCY_CONFLICT` instead of replaying. `designSessionId` binds the same content stably. Recorded as an explicit deviation from `DB3_IDEMPOTENCY_SPECIFICATION.md`. |
| `G01-D03` | `CC-18` cited as `DB3 CC-18`; duplicate submit has no DB8 coverage | DB8 states it renumbered CC ids; its `CC-18` is an inventory race and no row covers duplicate submit — the same "no application-layer consumer existed" situation DB8 recorded for CC-13. Semantics remain fully specified by ADR-DB1-017, so this is drift plus a coverage gap, not a contradiction. |
| `G01-D04` | GRD-002 does not gate TR-LC11-01 | The grant is an output of the same transaction and `SecureGrantIssuer` needs a `customRequestId` that does not yet exist. The guard catalogue scopes GRD-002 to *"all customer secure actions"*; submission is authorized by GRD-001. |
| `G01-D05` | Creation writes no transition row | `from_status` is `NOT NULL` and CHECKed against the LC-11 set, so no legal `from` value exists; the delivered `submit()` already writes none, while `transition()` does. |
| `G01-D05b` | APP5 emits outbox events but no new notification intent | `NotificationRequest` requires a `secret` and a two-member `reference` union — the pipeline is secret-bearing by construction and cannot express a secretless or staff-addressed message. The customer's confirmation already exists as the grant link. Adding a third reference kind would be a notification-architecture change no APP5 checkpoint owns, and no provider exists until `IMP-O006` closes at APP12. The outbox rows are still written, so a consumer can be added without reopening the transaction. |
| `G01-D06` | Cancellation = stage S1 only, `ADMIN` only | S1 is the only stage reachable from `NEW`/`UNDER_REVIEW`/`NEEDS_CLARIFICATION`; at S1 the matrix runs only steps 5–6, needs no manual review and creates no refund record, so APP5 promises no compensation it cannot perform. ADR-DB3-002 also allows a customer at S1, but that path needs a grant-authorized *mutation* on a surface APP5 builds only as a read — deferred with the rest of the secure-flow write surface. |
| `G01-D07` | The subset is an application restriction above the persistence guard | `isLegalRequestTransition` correctly encodes all of LC-11 — it is a lifecycle guard, not a phase gate. Without the extra layer, Admin could drive a request to `QUOTED` with no quotation behind it. |
| `G01-D08` | Catalog branch requires a product variant | `design_versions.product_variant_id` is `NOT NULL` and quantity lines key by variant, so a request without one cannot be quoted or digitized in APP6. Intake is the cheapest place to close the gap. |
| `G01-D09` | `submitted_session_id` is server-set | It is provenance with no FK; a client value would let a caller attribute their request to another customer's session. |
| `G01-D10` | COP requires ≥1 `COP_IMAGE` | A COP has no catalog media, no session and no design document; without a photograph nothing describes the object being triaged. The schema cannot express it (assets live in a sibling table), so it is an application invariant — and `COP_IMAGE` exists in the role set for exactly this. |
| `G01-D11` | The nine protected consequences | Makes "exactly one request" testable rather than rhetorical; every item names the constraint or claim that protects it. |
| `G01-D12` | `REQ-` + 10 CSPRNG chars | Format is `[cfg]` in DB4, so APP5 must choose. `REQ-` matches the delivered fixtures (`REQ-`/`ORD-`); the alphabet drops `0/O/1/I/L/U` because codes are read aloud; ~49 bits means codes are not a sequence, so volume does not leak — while ADR-DB1-007's rule that authorization, not opacity, is the boundary is preserved. |
| `G01-D13` | 10 bound assets per role; 20 accepted uploads per challenge | `IMP-D044` bounds bytes and pixels but sets no cardinality. Ten covers photographing a garment from every side; the per-challenge cap bounds the intake surface, layered on GRD-026's issuance limits. |
| `G01-D14` | `ATTACHMENT` not exposed by APP5 | APP5's journey has exactly two customer-supplied asset meanings. A third undifferentiated bucket would carry no triage meaning any screen could explain. The role stays in the schema for APP6+. |

## 5. Downstream handoff

**`APP5-D01`** — two intake branches with different required fields; ≥1
`COP_IMAGE` and the 10-per-role cap; three bounded upload-rejection reason
classes; quantity breakdown on both branches; a confirmation whose success state
is the secure link; an Admin queue that *is* the alert surface; an Admin detail
offering only the five moderation transitions, with mandatory reasons on
`NEEDS_CLARIFICATION`/`REJECTED`/`CANCELLED` and mandatory notes on the first
two.

**`APP5-B01`** — TR-LC11-01; the subject invariant; the full idempotency
contract including the recorded fingerprint deviation; code generation; asset
binding; the customer and admin notification rows; `G01-D05`. One endpoint.
Must also confirm `DESIGN_SESSION_SECRET_PEPPER` reaches the test harness
before claiming a green suite — **without rotating or writing any credential**.

**`APP5-B02`** — the upload policy in full plus the media/inspection rules;
`IMP-D048`'s lane authorized by the verified challenge. ≤2 endpoints.

**`APP5-B03`** — GRD-002 per `G01-D04`; code is never an authorization input;
grant-scoped, single request.

**`APP5-B04`** — reads only; performs no transition.

**`APP5-B05`** — the subset as an application restriction above the persistence
guard; the reason/note requirements; the three moderation notification rows;
audit/correlation; S1-only, Admin-only cancellation.

## 6. Validation ledger

| Command / check | Question answered | Result | Reruns |
|---|---|---|---:|
| `git status --short`, `git log -1`, `git branch --show-current` | Baseline | clean · `ffb43c9` · `production` | 0 |
| Targeted `grep`/`rg` over `docs/database`, `docs/adr`, `docs/09-…`, `apps/api/src/modules/{order,customer,notification,design}`, `packages/database/src/schema`, `packages/persistence` | Locate guards, side effects, idempotency spec, stage matrix, asset constants, notification port, challenge model | All eight areas resolved from authority | 0 |
| File reads: LC-11/LC-02 specs, guard catalogue, side-effect catalogue, idempotency spec + ADR-DB1-017, ADR-DB3-002 + compensation spec, DB8 race matrix, TBL-037…042 schema, `drizzle-custom-request.repository.ts`, `notification-request.ts`, `secure-grant.notifier.ts`, `submit-verification-attempt.use-case.ts`, security §4 | Establish inherited rules and the exact seams | §2–§4 above | 0 |
| `node tools/check-report-secrets.mjs` | Do the new documents disclose a secret? | passed (473 documents, 2990 tracked files) | 0 |
| `npx prettier --check` on the three changed documents | Repository formatting gate | clean | 0 |
| `git diff --cached --check` | Staged whitespace | clean | 0 |

**No broad or runtime regression was run.** Explicitly not executed: `pnpm
quality`, any Jest suite (unit, focused or integration), Playwright/E2E,
all-workspace typecheck, any build, DB regression, OpenAPI generation or
freshness, generated-client generation or check, SonarQube, the Figma checker,
and every APP2/APP3/APP4 suite. G01 changed only documentation, so under
`VALIDATION_GOVERNANCE.md` §3 no runtime validation is justified — running one
would produce evidence about code this checkpoint did not touch. No command was
rerun.

## 7. Files changed

```text
A docs/implementation/audits/APP5_G01_SUBMISSION_MODERATION_AUTHORITY.md
M docs/implementation/phases/APP5-CUSTOM-REQUESTS.md
A docs/implementation/reports/APP5-G01-COMPLETION-REPORT.md
```

Documentation only. No `apps/**`, no `packages/**`, no tests, no schema or
migration, no OpenAPI artifact, no generated client, no `package.json`, no
lockfile, no Figma. `NO_APP5_MIGRATION` still holds — G01 deliberately adds no
database CHECK for the subject invariant, because DB4 assigns that cross-table
rule to transaction/application enforcement.

## 8. Roadmap update

| Checkpoint | Status | Note |
|---|---|---|
| `APP5-R00` | `COMPLETE` | Phase-entry audit and roadmap reconciliation |
| `APP5-G01` | `COMPLETE` | Submission, moderation and intake-abuse authority locked |
| `APP5-D01` | `INCOMPLETE` | **Next** — one APP5 design package |
| `APP5-B01` | `INCOMPLETE` | Request submission backend |
| `APP5-B02` | `INCOMPLETE` | Customer attachment intake |
| `APP5-B03` | `INCOMPLETE` | Grant-scoped request status read |
| `APP5-B04` | `INCOMPLETE` | Admin request queue & detail |
| `APP5-B05` | `INCOMPLETE` | Admin notes & guarded transitions |
| `APP5-S01` | `INCOMPLETE` | Request creation & submission |
| `APP5-S02` | `INCOMPLETE` | Confirmation & grant-scoped status |
| `APP5-A01` | `INCOMPLETE` | Admin request queue |
| `APP5-A02` | `INCOMPLETE` | Admin request detail & moderation |
| `APP5-E01` | `INCOMPLETE` | Cross-layer acceptance |
| `APP5-X01` | `INCOMPLETE` | Phase closure |

## 9. Commits

One documentation-only commit, nothing unrelated bundled, nothing pushed:

```text
docs(app5): lock submission, moderation and intake-abuse authority
```

## 10. Residual risks

| # | Risk | Disposition |
|---|---|---|
| 1 | **Duplicate submit has no DB8 race coverage** (`G01-D03`) — no prior implementation exists to lean on | `APP5-B01` must prove `DB3 CC-18` itself with a true concurrent-submit integration test against real PostgreSQL, per `ADR-DB1-017` r8. Not a blocker; it is the first implementation, and the arbiter is a pre-existing unique constraint. |
| 2 | **The fingerprint deviates from `DB3_IDEMPOTENCY_SPECIFICATION.md`** (`G01-D02`) | Reasoned and recorded here; `APP5-B01` must restate it in its completion report so the deviation stays visible rather than becoming folklore. |
| 3 | **The admin-alert half of SE-003 is written but not delivered in APP5** (`G01-D05b`) | Intentional and bounded: the outbox row is durable, the Admin queue is the real APP5 alert surface, and no provider exists until `IMP-O006` closes at APP12. `APP5-X01` must hand the undelivered consumer to APP12 explicitly so it is not mistaken for delivered behaviour. |
| 4 | **Customer-initiated cancellation is deferred** (`G01-D06`) although ADR-DB3-002 S1 permits it | Recorded as an APP6 item with the rest of the grant-authorized write surface. The Admin path satisfies the APP5 critical journey, so nothing in §7 of the phase plan is unmet. |
| 5 | `FU-APP3-DESIGN-SESSION-PEPPER-TEST-01` still never formally dispositioned | Carried from `APP5-R00`; owned by `APP5-B01`, which must confirm rather than assume — and must not rotate or write any credential to do so. |

```text
NEXT CHECKPOINT: APP5-D01 — One APP5 design package
```
