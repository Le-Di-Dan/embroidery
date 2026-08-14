# APP4-W01 — Notification delivery worker — completion report

## A. Verdict

```text
PASS
```

The provider-neutral notification delivery worker is delivered on top of the
existing APP2 outbox runtime. It claims the existing outbox row, resolves the
current intent from the non-secret aggregate linkage, opens the shared B01
envelope only after the claim succeeds, delivers through the recording adapter,
records safe notification attempts, consumes the already-published
`notification.delivery` retry policy, reuses the same envelope and secret for an
automatic retry, and leaves terminal rows as immutable `DEAD_LETTER` evidence.

Two additive seams were opened in the generic runtime. Both are named in §C and
neither changes claiming, leasing or completion for any existing handler; the
stop conditions in the checkpoint brief were therefore not reached.

## B. Entry state

- `APP4-P00 = PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE`
- `APP4-G01 = PASS`, `APP4-D01 = PASS`
- `APP4-P01 = PASS_AFTER_C1`
- **`APP4-B01 = PASS_AFTER_C1`, and `APP4-B01-C1` is closed.**
- **APP4 policy publication is owned and closed by `APP4-B01-C1`, through the
  API `staff-bootstrap` path. W01 published nothing and re-tested nothing.**
- `NO_APP4_MIGRATION` holds: the repository has 34 migrations before and after.
- No external notification provider is selected.

## C. Worker-runtime reuse audit

| Question | Answer, as found in source |
|---|---|
| Registry | `apps/worker/src/runtime/registry/job-handler.registry.ts` — one handler per event type; a duplicate throws at startup. |
| Claim path | `PolicyConfigurationRepository` → `JobPollRuntimeService` → `WorkerJobQueueRepository.claimRegisteredBatch` (`FOR UPDATE SKIP LOCKED` on IDX-088, `outbox_events` is the queue row). Unchanged. |
| Handler contract | `JobHandler<TPayload>`: `eventType`, `jobKind`, `payloadSchemaVersion`, `validatePayload`, `deriveEffectKey`, `execute(payload, context, abortSignal)`. |
| Payload-validation seam | `validatePayload` returns `PayloadValidationResult`, never throws; failure must be `JOB_PAYLOAD_INVALID` or `JOB_SCHEMA_UNSUPPORTED`, both always terminal. |
| Retryable/terminal contract | The handler **throws**; `classifyHandlerError` maps it onto the closed `WorkerErrorClass` set and `dispositionOf(errorClass, attemptNo, maxAttempts)` decides `RETRYABLE` vs `TERMINAL`. |
| Job kind / event mapping | `eventType = notification.delivery.requested` → `jobKind = NOTIFICATION_DELIVERY` (already in `BACKGROUND_JOB_KINDS`; no new kind). |
| Policy reader | `PolicyConfigurationRepository.currentValue(key)`, the same read `WorkerPolicyService` uses for `worker.runtime`. |
| Completion ownership | `JobExecutionService` → `completeSucceededAttempt` / `completeRetryableAttempt` / `completeTerminalAttempt`. The runtime owns `DISPATCHED`, `DEAD_LETTER`, `next_attempt_at`, the claim guard and `background_job_attempts`. W01 writes none of them. |
| Worker precedent inspected | `AssetNormalizationHandler` / `AssetNormalizationModule` (`APP3-W01A`): thin handler, registration in `onModuleInit`, use case owns the effect, `SqlAssetNormalizationRepository` writes through `executeRaw` + `DrizzleRepository` with a guarded from-state per statement. W01 follows all four. |
| Reuse without importing `apps/api` | Yes — see §D. |

### The two additive runtime seams

Both were unavoidable and both are strictly additive.

1. **`JobExecutionContext` now carries `aggregateKind` and `aggregateId`.** The
   claimed row already had them (`ClaimedWorkerJob`); the execution context did
   not pass them on. For every prior handler the subject of the work was inside
   the payload, so this was never needed. For a B01 delivery event the payload
   **is** ciphertext and the subject is the linkage column, so a handler that
   could not read it would have to decrypt to learn what it is working on. Two
   read-only fields, copied straight off the claimed row; the runtime derives
   nothing from them.

2. **`JobHandler.retryPlan?: JobRetryPlan`.** The global schedule is
   `min(base × 2^(n−1), max)`, which cannot produce `[60, 300]` for any base —
   `60` then `120`, never `300`. Rather than redesign the APP2 retry engine or
   hard-code a schedule, a handler may publish `maxAttempts` and
   `retryDelayMs(attemptNo)`; the runtime asks the plan for two numbers and then
   applies them through **exactly the same** guarded completion. Absent a plan
   (every existing handler), the global schedule applies unchanged.

Impact of both: one line added to an existing test fixture
(`asset-inspection.handler.spec.ts` now supplies the two context fields). No
behavioural change to any delivered handler.

## D. Notification persistence ownership

The delivered `NotificationIntentRepository` lives under
`apps/api/src/modules/notification/domain/repositories/`, so the worker cannot
reuse it without an app-to-app import, and moving the whole module into a package
would drag intake, masking, the intent-key derivation and an Admin-shaped
publication path into a worker that needs none of them.

W01 therefore declares a **narrow worker-local adapter over the existing
database/persistence contracts** — the option the brief authorizes:

- port: `apps/worker/src/jobs/notification-delivery/domain/repositories/notification-delivery.repository.ts`
  (three operations: `findIntent`, `beginProcessing`, `settleAttempt`);
- adapter: `apps/worker/src/jobs/notification-delivery/infrastructure/persistence/sql-notification-delivery.repository.ts`
  — `executeRaw` + `sql` from `@embroidery/database`, `DrizzleRepository` +
  `DatabaseExecutor` from `@embroidery/persistence`. No Drizzle, no driver, no
  ORM import, exactly as the two Asset repositories.

There is deliberately **no** `claimBatch` on this port: a claim method here would
be an invitation to build a second queue.

**No `apps/api` import.** The gate resolves every relative specifier in
`apps/worker/src` before testing it, so `../../../../api/src/...` is caught too;
the mutation suite proves that case.

## E. Delivery flow

```text
generic runtime claims the outbox row (lease, attempt number)
  → handler rejects a wrong aggregate_kind as terminal
  → policy.require(): no published policy ⇒ retryable, nothing sent
  → resolve the current intent from context.aggregateId
  → already SATISFIED / FAILED / CANCELLED ⇒ idempotent no-op success
      (no decrypt, no send, no attempt row, no mutation)
  → openDeliveryEnvelope(key, payload)            ← the first decryption
  → validate channel against the intent, parse issuedAt/expiresAt, check expiry
  → PENDING → PROCESSING
  → NotificationChannelPort.send(...)             ← the one transport call
  → one transaction: notification_delivery_attempts row
                     + intent SATISFIED / FAILED (or unchanged on a retry)
  → return, or throw a bounded class
  → generic runtime completes: DISPATCHED, or PENDING + policy delay,
    or DEAD_LETTER — plus its own background_job_attempts row
```

Pre-send terminal failures (unreadable envelope, expired material, channel
mismatch) also write one `FAILED_TERMINAL` attempt row alongside the `FAILED`
intent, in the same transaction. TBL-071 is the append-only evidence that
explains its parent intent's state, and an intent that reached `FAILED` with zero
attempts would be unexplainable from the notification domain alone. A missing or
malformed **policy** writes nothing at all: nothing was attempted, so there is no
attempt to record.

## F. Secret-lifetime evidence

Plaintext may exist in exactly three places, and does:

1. the sealed envelope (`outbox_events.payload`, ciphertext);
2. one local scope inside `NotificationDeliveryUseCase.attempt` → `send`, for the
   duration of a single attempt;
3. the recording development adapter's in-process array — the one authorized
   outbound sink (`ADR-APP4-001` §6.6).

Forbidden sinks, all asserted rather than asserted-about:

- `notification_intents` (including `params`) — the write path has no such column;
- `notification_delivery_attempts` — `error_class` takes a bounded class;
  `provider_message_ref` is not written at all;
- `background_job_attempts` and `outbox_events.last_error` — a `WorkerErrorClass`;
- audit rows — the worker writes none;
- logs — proven by capture, see §L;
- error messages — `NotificationDeliveryError`'s message **is** its class, and the
  adapter's thrown errors are swallowed into a retryable classification rather
  than wrapped.

The checker also refuses any log call in the capability whose argument mentions
`secret`, `token`, `code`, `normalizedRecipient`, `plaintext`, `payload` or
`ciphertext`.

No secret value — synthetic or otherwise — appears in this report.

## G. Policy consumption

```text
Policy publication is owned and closed by APP4-B01-C1.
W01 is a consumer only.
```

- Key: `notification.delivery`, read through
  `PolicyConfigurationRepository.currentValue`, loaded once at bootstrap by
  `NotificationDeliveryPolicyService` — the `WorkerPolicyService` precedent.
- The locked values (`maxAttempts = 3`, `retryDelaysSeconds = [60, 300]`) appear
  in **no** production file. `notification-delivery-policy.ts` validates a shape;
  it restates no number. A unit test and a checker rule both walk the whole
  capability and fail on `60_000`, `300_000`, `[60, 300]` or any literal
  `maxAttempts`.
- Missing or malformed ⇒ fail closed: no send, no intent mutation, no attempt
  row, `JOB_DEPENDENCY_UNAVAILABLE`, so the secret waits for an operator instead
  of dead-lettering on a configuration gap.
- The G01 dataset is untouched; the worker contains no `publishVersion`,
  `ensureKey`, `admin_accounts` or `createdByAdminId`.

## H. Retry / terminal evidence

Proven against a disposable PostgreSQL, with the poll loop held closed and
attempts driven one at a time through the real claim and the real
`JobExecutionService`:

| Claim | Evidence |
|---|---|
| Same outbox row | `summary.outboxEventId` is identical across attempts; `attempt_count` reaches 3 on one row. |
| Same envelope, same secret | The recording adapter's attempt-2 record carries the byte-identical plaintext of attempt 1. Nothing re-seals. |
| Policy schedule | `next_attempt_at − now()` measured **in the database** after each retryable completion: `[60, 300]` seconds. |
| Attempt bound | Exactly 3 channel sends, 3 delivery attempts, no fourth. The harness's global `worker.runtime` policy allows only **2** attempts, so the third could only come from the published plan. |
| Fake time | The asserted delay is read first, then the row's own due instant is moved forward. No real wait; the suite runs in ~6 s. |
| Terminal intent | `notification_intents.status = FAILED`, last attempt `FAILED_TERMINAL`. |
| Terminal outbox | `status = DEAD_LETTER`, `next_attempt_at` NULL, and a further claim returns nothing. |
| No `DEAD_LETTER` reset | The capability contains no `DEAD_LETTER` token at all; a mutation that reset one is refused by the gate. |
| No new intent / event / secret | Row counts of `notification_intents` and `outbox_events` are unchanged across a full retry cycle and across an expiry failure. |

## I. Lineage proof

```text
aggregate_id                = the current notification intent  (execution target)
originNotificationIntentId  = lineage only                     (never read)
```

`originNotificationIntentId` appears in **no** production file of the capability;
the gate fails on it. The mandatory test constructs the future `APP4-B08` shape —
an envelope whose ciphertext names an origin intent, carried by an event whose
linkage names a different, current one — and asserts the current intent is
delivered and satisfied while the origin intent keeps its state and gains no
attempt row. That test fails against a lineage-reading implementation and passes
against every other test in the suite, which is precisely why it exists.

## J. Adapter evidence

One adapter: `RecordingNotificationChannelAdapter`, bound to
`NOTIFICATION_CHANNEL_PORT`.

- Imports `@nestjs/common` and its own port type. Nothing else — the gate refuses
  any other non-relative specifier.
- No provider SDK in `apps/worker/package.json` and none imported anywhere in
  `apps/worker/src`.
- No network: proven by spying on `Socket.prototype.connect` and `globalThis.fetch`
  across an EMAIL and an SMS delivery. (`http.request` is non-configurable in this
  Node and cannot be spied on; every outbound path funnels through the socket
  anyway.)
- No database, file or log sink: the gate refuses `executeRaw`, `node:fs`,
  `Logger` and `console.` inside it.
- For `SECURE_LINK_TOKEN` the adapter receives the **raw token**. No URL is built:
  no locked rendering boundary exists yet, and W01 invents no template system.

## K. Checker evidence

```text
node tools/check-app4-w01.mjs           → pass
node --test tools/check-app4-w01.test.mjs → 35 tests, 35 pass
```

`tools/check-app4-w01.mjs` (330 lines) with `tools/check-app4-w01-boundaries.mjs`
(188 lines); both under the 450-line tooling soft cap, split by responsibility —
"what may this worker reach" versus "what does the delivery do" — not to chase a
number.

The 27 required assertions are covered: one registration of
`notification.delivery.requested`; the worker depends on and opens through
`@embroidery/notification-delivery`; no AES-GCM outside that package; no
`apps/api` import; no provider SDK; no `claimBatch` production caller; claims
still flow through `WorkerJobQueueRepository`; identity from the aggregate
linkage with a wrong kind rejected; no `originNotificationIntentId` read and no
ciphertext query; `NotificationChannelPort` exists; the recording adapter exists
with no network, provider, database, file or log sink; no P01 issuer and no B01
intake call; no outbox append; no `DEAD_LETTER` token; no `SET status = 'PENDING'`
on an intent and a guarded from-state on every settle; the policy key is read
through `currentValue`; no fallback constant; no publication; no Admin identity;
a closed failure taxonomy with every thrown class declared; no plaintext-derived
log call; no plaintext column in the write path or the persistence contract; the
envelope version is imported, never redeclared; 34 migrations; no
`@Controller`/`@ApiProperty`/`createZodDto`/Swagger; no UI reference.

Assertions read **code with comments stripped**. One mutation case exists solely
to keep that honest: it appends a comment containing every forbidden phrase the
gate looks for and requires the gate to stay silent — the failure mode recorded
at `APP4-B01`, where a first-draft checker flagged seventeen of its own doc
comments.

## L. Focused tests

| File | Tests | Scenario |
|---|---|---|
| `.../infrastructure/channel/recording-notification-channel.adapter.spec.ts` | 6 | EMAIL delivery; SMS secure-link token recorded as the raw token; zero external call; scripted outcome ordering; a refused delivery is still recorded (so a retry can be compared to it); reset. |
| `.../domain/notification-delivery-policy.spec.ts` | 14 | The published value parses; the key name; nine malformed shapes fail closed; a schedule that disagrees with the budget is refused in both directions; reasons name fields, never the stored value; positional delay lookup; past-the-schedule throws; **no fallback constant anywhere in the capability's production source.** |
| `.../domain/delivery-failure.spec.ts` | 4 | Every class maps onto the worker taxonomy; every deterministic class is terminal on attempt 1 of 3; the two retryable classes wait and then turn terminal at the cap; the error's message is its class and it exposes no cause. |
| `.../tests/notification-delivery-success.integration.spec.ts` | 6 | Success end to end (§23.2); SMS secure-link delivery; already-`SATISFIED` reclaim is a no-op (§23.3); retryable-then-success on the same row with the identical plaintext and no new intent/event (§23.4); **no secret in any log line, on success and on failure (§24)**; current-intent-versus-lineage (§23.9, mandatory). |
| `.../tests/notification-delivery-failure.integration.spec.ts` | 6 | Exhausted budget: 3 sends, delays `[60, 300]`, terminal attempt, intent `FAILED`, outbox `DEAD_LETTER`, no fourth send, not claimable afterwards (§23.5); non-retryable refusal does not retry (§23.6); wrong-key envelope — channel never called, bounded class, no ciphertext/auth-tag/key fragment persisted (§23.7); expired material — no send, no regeneration, no business resend, row counts unchanged (§23.8); unpublished policy fails closed then delivers once published; malformed policy fails closed (§25). |

38 tests, all passing. Every integration assertion about the absence of plaintext
runs `secretAppears`, which scans every textual and JSON field of
`notification_intents`, `notification_delivery_attempts`,
`background_job_attempts`, `outbox_events` (excluding the ciphertext payload, the
one place it is supposed to be) and `audit_events`.

## M. Validation ledger

```text
No full regression/test chain was run.
```

| # | Command | Result |
|---|---|---|
| 1 | `pnpm install --filter @embroidery/worker...` (once, for the new workspace dependency) | pass |
| 2 | `pnpm --filter @embroidery/worker exec jest src/jobs/notification-delivery` | 5 suites, 38 tests, pass |
| 3 | `pnpm --filter @embroidery/worker exec jest src/runtime/execution src/runtime/registry src/jobs/asset-inspection/asset-inspection.handler.spec.ts` — the specs the two additive runtime seams actually touch | 3 suites, 26 tests, pass |
| 4 | `pnpm --filter @embroidery/worker typecheck` | pass |
| 5 | `node tools/check-app4-w01.mjs` | pass |
| 6 | `node --test tools/check-app4-w01.test.mjs` | 35/35 pass |
| 7 | `pnpm --filter @embroidery/worker exec eslint <changed files>` | clean |
| 8 | `npx prettier --write <changed files>` then re-verified 5 and 6 | clean |
| 9 | `node tools/check-report-secrets.mjs` | see below |
| 10 | `git diff --cached --check` | see below |

Not run, deliberately: full worker Jest, any API suite, B01 intake or envelope
suites (the shared package is unchanged), B01-C1 publication, P01, customer,
frontend, Playwright, OpenAPI/client generation, DB manifest, migration
regression, the Figma and G01 checkers, SonarQube, and any repository-wide build,
typecheck or lint. Command 3 is change-impact, not regression: it is the three
suites that construct a `JobExecutionContext` or exercise `completeFailure`.

Two commands were re-run after a failure, each time against a covered defect and
only that command: the adapter unit suite (a non-configurable `http.request`
could not be spied on — the assertion moved to the socket), and the failure
integration suite (a missing adapter reset between two tests in the second
`describe`). Nothing successful was re-run for reassurance; commands 5 and 6 were
re-verified once after Prettier rewrote the files they parse, which is a real
input change rather than a repeat.

## N. Files changed

New — the capability (`apps/worker/src/jobs/notification-delivery/`):

```text
notification-delivery.handler.ts
notification-delivery.module.ts
application/notification-delivery.usecase.ts
config/delivery-envelope-key.provider.ts
domain/channel/notification-channel.port.ts
domain/delivery-failure.ts
domain/delivery-failure.spec.ts
domain/notification-delivery.payload.ts
domain/notification-delivery-policy.ts
domain/notification-delivery-policy.spec.ts
domain/repositories/notification-delivery.repository.ts
infrastructure/channel/recording-notification-channel.adapter.ts
infrastructure/channel/recording-notification-channel.adapter.spec.ts
infrastructure/persistence/sql-notification-delivery.repository.ts
infrastructure/policy/notification-delivery-policy.service.ts
tests/notification-delivery-context.ts
tests/notification-delivery-queries.ts
tests/notification-delivery-success.integration.spec.ts
tests/notification-delivery-failure.integration.spec.ts
```

New — tooling and documentation:

```text
tools/check-app4-w01.mjs
tools/check-app4-w01-boundaries.mjs
tools/check-app4-w01.test.mjs
docs/implementation/reports/APP4-W01-COMPLETION-REPORT.md
```

Modified:

```text
apps/worker/package.json                                  (+ @embroidery/notification-delivery)
apps/worker/src/bootstrap/worker.module.ts                (+ NotificationDeliveryModule)
apps/worker/src/runtime/registry/job-handler.ts           (+ aggregate linkage, + JobRetryPlan)
apps/worker/src/runtime/execution/job-execution.service.ts(pass the linkage, honour a retry plan)
apps/worker/src/jobs/asset-inspection/asset-inspection.handler.spec.ts (context fixture)
docs/implementation/SCOPED_COMMAND_INDEX.md               (3 new scoped commands)
pnpm-lock.yaml                                            (the workspace dependency)
```

No migration, no schema file, no OpenAPI artifact, no generated client, no
frontend file, no Figma artifact, no root script.

## O. Git evidence

| Item | Value |
|---|---|
| Branch | `production` |
| W01 entry HEAD | `bc468f0` — `docs(app4): record APP4-B01-C1 commit evidence` |
| W01 implementation | `85abc27` — `feat(app4): deliver notification transport on the outbox worker` |
| W01 evidence | `docs(app4): record APP4-W01 commit evidence` — this commit; it carries the implementation hash above and cannot carry its own |
| Final HEAD | the evidence commit, the second of the two |
| Working tree after both commits | clean |
| Pushed | **no** |

## P. Limitations and follow-ups

1. **`NOTIFICATION_DELIVERY_ENVELOPE_KEY` is not wired into any Compose service.**
   `.env.example` declares it empty and neither the `api` nor the `worker` service
   in `infrastructure/compose/docker-compose.dev.yml` passes it through. This
   predates W01 — B01 left the API side unwired for the same reason, and both
   providers are lazy precisely so a process that never seals or opens can still
   boot. A dev worker therefore fails closed at the opening call until an
   operator supplies the key. Wiring it belongs with the checkpoint that turns
   delivery on in dev, not with the one that implements it; it is recorded here
   rather than done silently.
2. **The APP4 roadmap row still reads `IN_PROGRESS — APP4-G01 COMPLETE`.** D01,
   P01 and B01 did not append their statuses either. W01 follows that precedent
   rather than unilaterally editing a phase-level row; the lag is a phase-closure
   item.
3. The retry budget is counted by the runtime's outbox attempt number, per the
   checkpoint brief. An expired-lease reclaim increments that counter without
   producing a notification delivery attempt, so a fleet that repeatedly lost
   leases could exhaust the budget with fewer than three real sends. That is the
   safe direction (fewer sends, never more) and matches the runtime's own
   convention; `ADR-APP4-001` §8.2's attempt-count reading is used only where it
   is authoritative, in the argument for a new replay intent.

## Q. Next checkpoint

```text
APP4-B02
```

Not started.
