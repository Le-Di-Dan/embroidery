# `APP4-B01` — Completion Report

**Checkpoint:** `APP4-B01` — Notification intent intake and shared delivery envelope
**Date:** 2026-08-14 · **Branch:** `production`

---

## A. Verdict

**`PASS`**

One notification-intake capability, one shared envelope package, one guard entry,
one module composition. **0 HTTP endpoints, 0 migrations, 0 providers.** No stop
condition was met.

---

## B. Entry state

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `78bb90c59aee72392a1babe8f1946d0ec9ff2383` |
| Entry working tree | clean |
| `APP4-P00` | `PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE` |
| `APP4-G01` | `PASS` (`IMP-D049` / `ADR-APP4-001`) |
| `APP4-D01` | `PASS`; 48 registry rows still `REVIEW_REQUIRED` |
| `APP4-P01` | `PASS` after `APP4-P01-C1`, which is closed |
| `NO_APP4_MIGRATION` | holds — migration count unchanged at 34 |

---

## C. Pre-implementation reuse audit

Every contract below was read before any runtime code was written.

| Concern | What exists | What B01 reused |
|---|---|---|
| Notification repository | `NotificationIntentRepository` with `createIdempotent`, `claimBatch`, `recordAttempt`, `markDelivered`, `markFailed`, `findByIntentKey`, `countAttempts` | **`createIdempotent` only.** Nothing else is called. |
| Idempotency semantics | `CreateIntentOutcome = { outcome: 'created' \| 'replay'; intent }` — "a duplicate intent key is a replay, not a failure" | The `replay` branch **is** the duplicate-collapse mechanism (§F.4) |
| Intent input shape | `CreateIntentInput` — caller-supplied `id`, `intentKey`, `templateKey`, `templateVersion`, `channel`, `recipientMasked`, `params`, `correlationId`; optional `recipientContactPointId`, `sourceOutboxEventId` | All required fields; both optional fields deliberately unused |
| Outbox store | `OutboxEventStore.append({ eventType, aggregateKind, aggregateId, payload, payloadSchemaVersion })`, `@requiresTransaction`, returns `bigint`, sets `status: 'PENDING'` and `nextAttemptAt: now()` | Used verbatim. No new producer helper. |
| Aggregate guard | `OUTBOX_AGGREGATE_KINDS` + `assertKnownAggregateKind` at write time; `aggregate_kind` is open `text` with **no CHECK** (REL-104 polymorphic) | Extended by exactly one entry |
| Transaction pattern | `TransactionManager.runInTransaction(work)` — DEC-DB7-006, the only place a transaction opens; nested calls **join** the enclosing one | Used directly, exactly as `upload-transactions.service.ts` does |
| Atomic producer precedent | `upload-transactions.service.ts` Tx B: guarded transition + `outbox.append` in one `runInTransaction` | The shape B01 copies |
| Module composition | `@Module({ imports: [DatabaseModule], providers: [...], exports: [...] })`, registered in `apps/api/src/bootstrap/app.module.ts` | Followed |
| Correlation | `RequestContextService` is `@Global()`, exposing `requireRequestId()` | Injected as a fallback when the caller omits `correlationId` |
| Masking | `maskContact` from `APP4-P01`, corrected by `P01-C1` for exact country codes | Imported; **not** reimplemented |
| Package convention | `@embroidery/object-storage`: `main`/`types` → `dist`, `tsconfig.build.json`, `jest.config.mjs` rooted at `test/unit`, `eslint.config.mjs` re-exporting `baseConfig` | Followed exactly |

**Could intent + delivery event commit atomically with delivered code?** Yes.
Both repositories are `DrizzleRepository` subclasses resolving their executor
from `transactionContext`, and both methods are `@requiresTransaction`, so one
`runInTransaction` covers them. **Stop condition 1 does not apply.**

---

## D. Shared package

| Property | Value |
|---|---|
| Name | `@embroidery/notification-delivery` |
| Path | `packages/notification-delivery` |
| Runtime dependencies | **none** |
| Dev dependencies | the standard package set (`eslint-config`, `typescript-config`, jest, ts-jest, rimraf, types) |

**Exports** — `DELIVERY_ENVELOPE_VERSION`, `DELIVERY_ENVELOPE_ALGORITHM`,
`DELIVERY_SECRET_KINDS`, `isDeliveryEnvelope`, `isDeliverySecretKind`,
`DeliveryEnvelope`, `DeliveryPayload`, `DeliverySecretKind`;
`NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV`, `ENVELOPE_KEY_BYTES`,
`parseEnvelopeKey`, `loadEnvelopeKey`, `EnvelopeKey`; `sealDeliveryEnvelope`,
`openDeliveryEnvelope`, `ENVELOPE_IV_BYTES`, `RandomBytesSource`.

**Envelope authority, as `ADR-APP4-001` §6 locks it:** version `1`,
`AES-256-GCM` from `node:crypto`, a **fresh 96-bit nonce per seal** with no
parameter to supply one, base64url binary fields, outer shape
`{ version, algorithm, iv, ciphertext, authTag }` and nothing else, plaintext
`{ secretKind, originNotificationIntentId, channel, normalizedRecipient, secret, issuedAt, expiresAt }`
and nothing else, secret kinds exactly `VERIFICATION_CODE` and
`SECURE_LINK_TOKEN`.

**Key validation** — base64, exactly 32 decoded bytes, no default, no fallback,
fail-closed, errors naming the variable and never the value. The decoder
re-encodes and compares rather than trusting `Buffer.from(x, 'base64')`: Node's
decoder **skips** characters outside the alphabet instead of rejecting them, so
`"not a real key!!"` decodes to *something*. Without the round-trip, a typo
silently keys AES with debris.

Key parsing is deliberately a separate module from seal/open, matching the
repository's split between config parsing and the operation that consumes it.
`EnvelopeKey` is branded so the only way to obtain one is through validation.

**Boundary** — the package imports no `apps/*`, no `@embroidery/database`, no
`@embroidery/persistence`, no `@nestjs/*` and no provider SDK. It is
side-effect-free on import and reads no environment variable at module load.
This is exactly why it is a package: it is the one thing two applications
genuinely share, and the alternative is an app-to-app import.

**No key value appears in this report, in source, or in any committed file.**

---

## E. `NotificationRequest` contract

**Input** — `sourceEventId`, `channel`, `contactKind`, `normalizedRecipient`,
`templateKey`, `templateVersion`, `reference`, `secretKind`, `secret`,
`issuedAt`, `expiresAt`, optional `correlationId`.

**Output** — `{ outcome: 'created', intentId, intentKey, outboxEventId }` or
`{ outcome: 'replay', intentId, intentKey }`.

**Division of labour.** The caller owns the business secret: `APP4-B03` mints the
code, `APP4-B05` the token, each hashes it into its own table and passes the
plaintext here once. B01 owns intent idempotency, redacted persistence, masking,
sealing and the outbox append — and **generates no secret**, which is why neither
P01 issuer appears anywhere in this module.

**Deterministic intent key.** SHA-256 hex over the canonical string

```text
app4-notification:v1:<sourceEventId>:<normalizedRecipient>:<templateKey>:<templateVersion>
```

with **every component percent-encoded before joining**. Two properties carry it:

- **The recipient never appears raw.** `intent_key` is a persisted column;
  putting an address in it would make the dedup key itself a contact database,
  which is what `recipient_masked` exists to avoid.
- **The encoding is injective.** Without percent-encoding, a `:` inside one
  component could make two different tuples canonicalize identically — and that
  collision does not fail loudly, it silently *suppresses a real second
  notification*. Tested directly.

No secret enters the key, and there is no random component: randomness would
defeat the deduplication the key exists for.

---

## F. Persistence evidence

Proven against a real PostgreSQL instance, not against doubles.

**1. The intent is secret-free.** `params` is built by one function from a closed
discriminated union — `{ kind: 'VERIFICATION_CHALLENGE', challengeId }` or
`{ kind: 'SECURE_ACCESS_GRANT', grantId }` — so it is secret-free **by
construction**: there is no field a code, token, ciphertext or rendered body
could occupy. The persisted shape is:

```text
{ schemaVersion: 1, reference: { kind, challengeId | grantId } }
```

The integration suite asserts the serialized intent row contains neither the
synthetic secret nor the recipient, and none of `ciphertext`, `authTag`, `iv`,
`secret`, `token`.

**2. The recipient is masked, through P01.** `maskContact` is imported, never
reimplemented; `an@vidu.com` stores as `a***@vidu.com`, asserted to differ from
the raw value. B01 contains no phone parser and no second masking rule.

**3. One delivery event.** `eventType = notification.delivery.requested`,
`status = PENDING`, `payload_schema_version = 1`, payload keys exactly
`algorithm`, `authTag`, `ciphertext`, `iv`, `version` — asserted to contain
neither the secret, nor the recipient, nor even the secret *kind*.

**4. Non-secret current-intent linkage.** `aggregate_kind = NOTIFICATION_INTENT`,
`aggregate_id = ` the current intent id. The suite then resolves the intent by
that id with a plain relational read — the proof that a worker never needs to
decrypt to know what it is working on, and that nothing queries ciphertext.

**5. Duplicate collapse.** The second identical request returns `replay` with the
same intent id and key, and the database holds **one** intent and **one** outbox
event. The mechanism is the repository's `intent_key` uniqueness; the use case
returns *before* sealing, so a duplicate never builds a second envelope. Nothing
compares secrets to decide identity. Conversely, a changed source event,
recipient or template each produce a second intent and a second event.

**6. Atomicity.** `createIdempotent` and `append` run inside one
`runInTransaction`, so there is no dual write and no compensation scheme.

**7. Lineage stays lineage.** `originNotificationIntentId` inside the ciphertext
equals the current intent on this original delivery — which is exactly why it is
the easy thing to misuse later. `APP4-B08` will copy the ciphertext
byte-identically, at which point it names the *original failed* intent while the
new event's `aggregate_id` names the replay intent. The comment on both the
contract field and the guard entry says so.

---

## G. Policy publication handoff

**The G01 dataset was NOT published by this checkpoint.** Recorded plainly rather
than claimed, with the evidence that led there.

`ADR-APP4-001` §1.1 named "`APP4-B01`'s bootstrap path" as the publishing caller.
On inspection that hand-off does not land here, for three measured reasons:

1. **B01 does not create the capability.** `PolicyConfigurationRepository` is
   provided by `DatabaseModule` and has been reachable since APP2. A grep for
   non-test callers of `ensureKey`/`publishVersion` returns **none** — the
   matches in `apps/api` are `AgreementRepository.publishVersion` and
   `DesignTemplateRepository.publishVersion`, different methods on different
   repositories. Composing `NotificationModule` changes nothing about that
   reachability, so B01 is **not** "the first runtime composition point capable"
   in §16's sense; every checkpoint since APP2 was equally capable.
2. **B01 reads no policy value.** `notification.delivery.maxAttempts` and
   `retryDelaysSeconds` are first consumed by **`APP4-W01`**;
   `verification.challenge` by `APP4-B03`/`B04`. Publishing here would ship a
   publisher with no consumer.
3. **Publishing needs an admin identity, and its only existing authority is a
   separate one-shot CLI.** `policy_configuration_versions.created_by_admin_id`
   is `NOT NULL` FK to `admin_accounts`, and the delivered admin-bearing path is
   `apps/api/src/cli/staff-bootstrap.ts` — a Compose one-shot service, not normal
   API startup. §16 forbids inventing an admin identity mechanism, and a second
   bootstrap CLI reading a JSON dataset out of another workspace package's
   non-exported directory is the widening §16 also forbids.

**No existing runtime mechanism publishes it either** — there is no seed runner,
no `db:seed` script and no bootstrap that touches `policy_configurations`.

**Routed to `APP4-W01`**, the first checkpoint that actually reads a published
value and therefore the first with a reason to publish one. The seam stays
explicitly open; it is not closed by assertion.

---

## H. Checker evidence

`tools/check-app4-b01.mjs` (412 lines) + `tools/check-app4-b01.test.mjs` (324).

| Command | Result |
|---|---|
| `node tools/check-app4-b01.mjs` | **PASS** — 0 failures |
| `node --test tools/check-app4-b01.test.mjs` | **PASS** — 29/29 |

Assertions cover all 23 required items: package existence and name; exactly one
AES-GCM implementation and it is inside the package; version, algorithm, secret
kinds, 96-bit nonce, 32-byte key; the package's dependency and import boundary;
no provider or crypto SDK in either app manifest; `NotificationModule` in the
`AppModule` **imports array**; `NOTIFICATION_INTENT` in the guard with no CHECK
and no migration; no `claimBatch` production caller; the literal
`aggregateKind`/`aggregateId` linkage; no ciphertext query; a reference union
carrying no secret-shaped member; sealing through the package; no
`openDeliveryEnvelope` in the API; no app-to-app import; no base64-shaped literal
in production source.

### H.1 The checker's first version was wrong, and its own tests said so

The first run reported **17 failures, every one a false positive** — it was
matching prose in the doc comments it was reading: "`apps/api` seals through it",
"deliberately not `openDeliveryEnvelope`", "there is no `NotificationChannelPort`".
A gate that fails on its own explanation is a gate someone switches off, so the
fix was structural: strip comments first, and assert on **import specifiers and
call sites** rather than on text.

Then the mutation tests caught **three real weaknesses** in the corrected version,
each a mutation that survived:

1. Deleting `NotificationModule` from the imports array still passed, because the
   unused `import` statement kept the name in the file. Now the check reads the
   `imports: [...]` block.
2. Replacing `maskContact(` with a local helper still passed for the same reason.
   Now both the import specifier and the call site are required.
3. An app-to-app import written as `../../api/src/...` slipped through, because
   the relative specifier never spells `apps/api`. Relative specifiers are now
   resolved before the test.

All three were fixed in the checker. No test was weakened to make a gate pass.

---

## I. Focused tests

| Suite | Tests | Covers |
|---|---|---|
| `packages/notification-delivery/test/unit/delivery-envelope.spec.ts` | 33 | key accepted/missing/blank/malformed-base64/wrong-length, error naming the variable not the value, `loadEnvelopeKey` from an injected map; round trip for both secret kinds; version and algorithm stamped; 96-bit nonce; fresh nonce across five seals; outer shape leaking none of secret, recipient, kind, channel or timestamps; unknown secret kind refused; short random source refused; tampered ciphertext, auth tag and nonce all rejected; wrong key rejected; unsupported version and algorithm rejected before key material is touched; six malformed-envelope shapes |
| `apps/api/src/modules/notification/domain/notification-intent-key.spec.ts` | 10 | determinism, SHA-256 hex shape, a different key for each of the four tuple components, no recipient or source id in the output, no randomness, delimiter-collision resistance, version prefix |
| `apps/api/src/modules/notification/tests/integration/notification-intake.integration.spec.ts` | 9 | one intent + one `PENDING` event; the linkage resolving the intent relationally; secret-free intent with masked recipient and correlation id; outbox payload carrying no plaintext; duplicate collapsing to one of each; three "different tuple → different notification" cases; a secure-link token through the same intake |
| `tools/check-app4-b01.test.mjs` | 29 | mutation cases, plus the two honesty cases in §H.1 |

**Total: 81 focused tests, all passing.** Every secret and key in them is
synthetic; none appears in this report.

The integration suite uses `createPersistenceTestContext` with
`[RequestContextModule, NotificationModule]` — the smallest harness that proves
repository + outbox + transaction + idempotency together. The full application is
never booted.

---

## J. Validation ledger

| # | Command | Why | Result | Rerun? |
|---|---|---|---|---|
| 1 | `pnpm install --filter @embroidery/notification-delivery` | The new package needs its dev dependencies linked. | added | No |
| 2 | `pnpm --filter @embroidery/api add "@embroidery/notification-delivery@workspace:*"` | The API seals through the package. | added | No |
| 3 | `pnpm --filter @embroidery/notification-delivery exec jest` | The envelope's own suite. | **PASS** 33/33 | Yes ×2 — see J.1 |
| 4 | `pnpm --filter @embroidery/notification-delivery exec tsc --noEmit` | Smallest compile proof for the new package. | **PASS** | Yes ×1 — see J.1 |
| 5 | `pnpm --filter @embroidery/notification-delivery build` · `pnpm --filter @embroidery/persistence build` | The API resolves both through `dist`; without the rebuild it typechecks against stale declarations. | built | No |
| 6 | `pnpm --filter @embroidery/api exec tsc --noEmit` | Smallest compile proof covering the API. | **PASS** | Yes ×2 — see J.1 |
| 7 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="notification-intent-key"` | Docker-free key derivation. | **PASS** 10/10 | Folded into command 8's final run |
| 8 | `pnpm --filter @embroidery/api exec jest --runInBand --testPathPatterns="notification-intake.integration\|notification-intent-key"` | The narrow notification integration harness. | **PASS** 19/19 | Yes ×1 — see J.1 |
| 9 | `node tools/check-app4-b01.mjs` | The checkpoint's own gate. | **PASS** | Yes ×2 — see J.1 |
| 10 | `node --test tools/check-app4-b01.test.mjs` | The gate's mutation tests. | **PASS** 29/29 | Yes ×2 — see J.1 |
| 11 | `pnpm exec prettier --check <14 changed paths>` | Changed TS, JSON, `.mjs` and Markdown. | **PASS** | Yes ×1, after command 12 |
| 12 | `pnpm exec prettier --write <5 files>` | The fix for what command 11 reported. | applied | No |
| 13 | `pnpm --filter @embroidery/notification-delivery exec eslint .` | Scoped lint for the new package. | **PASS** | Yes ×1 — see J.1 |
| 14 | `pnpm --filter @embroidery/api exec eslint src/modules/notification src/bootstrap/app.module.ts` | Scoped lint for the changed API paths. | **PASS** | No |
| 15 | `pnpm --filter @embroidery/persistence exec eslint src/platform/outbox-event-store.ts` | Scoped lint for the changed guard. | **PASS** | No |
| 16 | `node tools/check-report-secrets.mjs` | B01 discusses key and envelope names; the gate proves no value was published and no secret-bearing file became tracked. | **PASS** | No |
| 17 | `git diff --cached --check` | Whitespace and conflict-marker safety. | clean | No |

```text
No full regression/test chain was run.
```

Not run, and why: the full API Jest suite (the focused patterns prove the changed
behaviour and nothing else imports it); the persistence suite (the guard change
is one array entry, covered by the gate and the integration suite that exercises
`append`); worker tests, `APP4-W01` tests, customer verification, Storefront and
Admin tests, Playwright (none of those surfaces changed); OpenAPI and client
generation (no HTTP surface); DB manifest and migration regression (no schema);
the Figma checker; the `APP4-G01` checker (none of its inputs changed);
`APP4-P01`'s phone/secret suites — B01 changed no file they import, and
`libphonenumber-js` coverage in particular was untouched; SonarQube;
`pnpm quality`; repository-wide typecheck, lint or build.

### J.1 Reruns, and what changed before each

Every rerun below followed a change to a file that command covers.

- **Command 3** ran twice: after the typecheck fix to the spec's buffer mutations,
  and after the `jest.config.mjs` escape fix (a file the command reads).
- **Command 4** ran twice; the first run failed on three `noUncheckedIndexedAccess`
  errors in the spec's tamper cases (`bytes[0] ^= 0xff`), replaced with
  `writeUInt8`/`readUInt8`.
- **Command 6** ran three times. The first failed on two stale-`dist` errors
  resolved by command 5, the second on `OutboxRow` being an `interface` where
  `db.execute<T>` needs the implicit index signature only a `type` alias gets.
- **Command 8** ran twice, the second time after that `OutboxRow` fix.
- **Commands 9 and 10** ran three and two times respectively while the checker was
  corrected (§H.1). Only the checker changed between runs.
- **Command 13** ran twice: the first flagged `no-useless-escape` in
  `jest.config.mjs`, where a heredoc had collapsed `\\.` to `\.`. The pattern
  still matched — `.` matches any character — so the tests passed either way;
  it was fixed because a regex that works by accident is a trap, and command 3
  was re-run afterwards.

---

## K. Files changed

**Created (13)**

Shared package (9):

- `packages/notification-delivery/package.json`
- `packages/notification-delivery/tsconfig.json`
- `packages/notification-delivery/tsconfig.build.json`
- `packages/notification-delivery/jest.config.mjs`
- `packages/notification-delivery/eslint.config.mjs`
- `packages/notification-delivery/src/index.ts`
- `packages/notification-delivery/src/delivery-envelope.contract.ts`
- `packages/notification-delivery/src/delivery-envelope.codec.ts`
- `packages/notification-delivery/src/envelope-key.ts`
- `packages/notification-delivery/test/unit/delivery-envelope.spec.ts`

API (5):

- `apps/api/src/modules/notification/application/request-notification.use-case.ts`
- `apps/api/src/modules/notification/config/delivery-envelope-key.provider.ts`
- `apps/api/src/modules/notification/domain/notification-request.ts`
- `apps/api/src/modules/notification/domain/notification-intent-key.ts`
- `apps/api/src/modules/notification/domain/notification-intent-key.spec.ts`
- `apps/api/src/modules/notification/tests/integration/notification-intake.integration.spec.ts`

Tooling and docs (3):

- `tools/check-app4-b01.mjs`
- `tools/check-app4-b01.test.mjs`
- `docs/implementation/reports/APP4-B01-COMPLETION-REPORT.md`

**Modified (5)**

- `apps/api/package.json` — one workspace dependency
- `pnpm-lock.yaml` — that dependency's resolution
- `apps/api/src/bootstrap/app.module.ts` — `NotificationModule` composed
- `apps/api/src/modules/notification/notification.module.ts` — two providers, one export
- `packages/persistence/src/platform/outbox-event-store.ts` — one guard entry
- `docs/implementation/SCOPED_COMMAND_INDEX.md` — four command rows

Untouched: every schema file, every migration, the OpenAPI artifact, the
generated client, the worker, both frontends, `.env.example`, the ADR, the design
index, and every `APP4-P01` primitive.

### K.1 File sizes

Measured, not estimated:

| File | Lines | Limit |
|---|---|---|
| `packages/notification-delivery/src/delivery-envelope.codec.ts` | 141 | 400 source |
| `apps/api/src/modules/notification/application/request-notification.use-case.ts` | 113 | 400 source |
| `packages/notification-delivery/test/unit/delivery-envelope.spec.ts` | 236 | 600 test |
| `apps/api/.../notification-intake.integration.spec.ts` | 215 | 600 test |
| `tools/check-app4-b01.mjs` | **412** | 450 tooling soft cap |
| `tools/check-app4-b01.test.mjs` | 324 | 700 tooling soft cap |

The checker at 412 lines sits inside the 450 tooling soft cap but above the
400-line source limit `tools/check-file-size.mjs` applies to `tools/`. That
tension predates this checkpoint — `check-app3-g01.mjs` is 445 — and §20
explicitly says not to split a tooling file solely to satisfy the older cap. It
is one cohesive responsibility and was left whole; recorded rather than
silently ignored.

---

## L. Git evidence

| Item | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `78bb90c59aee72392a1babe8f1946d0ec9ff2383` |
| Implementation commit | `__B01_COMMIT__` |
| Subject | `feat(app4): add notification intent intake and the shared delivery envelope` |
| Evidence commit | `docs(app4): record APP4-B01 commit evidence` — substitutes the hash above and changes nothing else |
| Final HEAD | the evidence commit, the second of the two |
| Working tree after both commits | clean |
| Pushed | **no** |

A commit cannot contain its own hash, so the implementation commit's hash is
written by the one-line evidence commit that follows it — the convention
`APP4-P00`, `G01`, `D01` and `P01` all used.

---

## M. Next checkpoint

**`APP4-W01`** — the notification delivery worker.

It is the correct next step and the only one that can consume what B01 produced:
`PENDING` `notification.delivery.requested` events now exist with no handler.
W01 opens the envelope through the shared package **after** claiming, reads its
intent from `aggregate_id`, adds `NotificationChannelPort` and the recording
adapter, and consumes `notification.delivery` policy — which also makes it the
checkpoint that should resolve the publication seam in §G.

`APP4-W01` was **not** started here.

---

## N. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | `NotificationModule` composed into `AppModule` | **MET** |
| 2 | One canonical `NotificationRequest` capability | **MET** — §E |
| 3 | Intent key from source event + recipient + template | **MET** — §E |
| 4 | Duplicate collapses to one intent | **MET** — §F.5 |
| 5 | Duplicate appends no second delivery event | **MET** — §F.5 |
| 6 | P01 masking reused, not reimplemented | **MET** — §F.2 |
| 7 | `params` structurally secret-free | **MET** — closed union, §F.1 |
| 8 | No rendered body persisted | **MET** — no template body anywhere |
| 9 | `@embroidery/notification-delivery` exists | **MET** — §D |
| 10 | Sole APP4 AES-GCM implementation | **MET** — gate assertion 3 |
| 11 | Envelope version exactly 1 | **MET** |
| 12 | Secret kinds exactly the locked pair | **MET** |
| 13 | Node `AES-256-GCM` | **MET** |
| 14 | Key base64, exactly 32 decoded bytes | **MET** — §D |
| 15 | Fresh 96-bit IV per seal | **MET** — no parameter to supply one |
| 16 | Tampered ciphertext/tag fails authentication | **MET** — §I |
| 17 | No DB/persistence/app/provider dependency in the package | **MET** — §D |
| 18 | API seals through the package | **MET** |
| 19 | API never opens an envelope | **MET** — gate assertion 21 |
| 20 | Guard gains only `NOTIFICATION_INTENT` | **MET** |
| 21 | No migration for the linkage | **MET** — 34 migrations, unchanged |
| 22 | Every delivery event carries kind + current intent id | **MET** — §F.4 |
| 23 | Intent resolvable without reading the payload | **MET** — §F.4 |
| 24 | `originNotificationIntentId` is lineage-only | **MET** — §F.7 |
| 25 | `claimBatch` still has no production caller | **MET** — gate assertion 16 |
| 26 | Correlation propagates through existing fields | **MET** — asserted in the integration suite |
| 27 | Atomic intent + outbox creation | **MET** — §F.6 |
| 28 | Policy handoff truthfully resolved | **MET** — §G: **not published here**, with evidence, routed to W01 |
| 29 | No channel port / adapter / worker added | **MET** — gate assertion 29 |
| 30 | No HTTP/OpenAPI/client/schema/UI change | **MET** — §K |
| 31 | Focused package tests pass | **MET** — 33/33 |
| 32 | Focused notification integration passes | **MET** — 19/19 |
| 33 | B01 checker passes | **MET** — plus 29/29 mutation tests |
| 34 | Validation strictly change-impact-based | **MET** — §J |
| 35 | No successful command needlessly repeated | **MET** — §J.1 |
| 36 | No plaintext delivery secret in the report | **MET** |
| 37 | Working tree clean | **MET** — §L |
| 38 | Nothing pushed | **MET** — §L |
| 39 | Next checkpoint is `APP4-W01` | **MET** — §M |

---

## O. Stop conditions — all five checked, none met

| # | Stop condition | Finding |
|---|---|---|
| 1 | Repositories cannot participate in one atomic transaction | **Not met.** Both are `DrizzleRepository` subclasses resolving the executor from `transactionContext`; both methods are `@requiresTransaction`; one `runInTransaction` covers them, and the integration suite proves the pair commits together. |
| 2 | The intent schema cannot represent secret-free typed references | **Not met.** `notification_intents.params` is `jsonb` and `CreateIntentInput.params` is `Record<string, unknown>`; the closed reference union fits with room to spare and needs no column. |
| 3 | The outbox producer cannot carry the envelope plus the linkage | **Not met.** `outbox_events` already pairs `payload` with `payload_schema_version`, and `aggregate_kind`/`aggregate_id` are existing columns with no CHECK. `ADR-DB4-004` rule 4 scopes redaction-by-construction to columns 6 and 8, not to column 4. |
| 4 | Package architecture prevents both apps importing one package | **Not met.** `@embroidery/object-storage` is already consumed by both `apps/api` and `apps/worker`; this package follows its shape exactly. |
| 5 | A locked runtime crypto mechanism conflicts with the envelope authority | **Not met.** The only established convention is `IMP-D043`'s peppered HMAC — a hashing primitive, not an AEAD. No `createCipheriv` existed anywhere before this checkpoint, which the gate now asserts stays true outside the package. |
