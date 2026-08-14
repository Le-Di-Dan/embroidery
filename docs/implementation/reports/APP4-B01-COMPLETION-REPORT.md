# `APP4-B01` — Completion Report

**Checkpoint:** `APP4-B01` — Notification intent intake and shared delivery envelope
**Date:** 2026-08-14 · **Branch:** `production`

---

## A. Verdict

**`PASS_AFTER_C1`**

One notification-intake capability, one shared envelope package, one guard entry,
one module composition — and, after `APP4-B01-C1`, the APP4 policy dataset
actually published. **0 HTTP endpoints, 0 migrations, 0 providers.** No stop
condition was met.

### A.1 What `APP4-B01-C1` corrected

The first delivery reported the `APP4-G01` policy-publication hand-off **open**
and routed it to `APP4-W01`. Acceptance criterion 28 offers two outcomes —
publication resolved, or evidence that existing runtime already owns it — and
B01's own evidence ruled out the second, so routing it onward satisfied neither.

`APP4-B01-C1` closes it on the API bootstrap path, using the Admin identity
`staff-bootstrap` already resolves. **Nothing about the envelope, the intent, the
outbox linkage or the crypto changed**: `packages/notification-delivery`,
`request-notification.use-case.ts`, the notification domain and
`outbox-event-store.ts` are byte-identical to the first delivery. See §G.

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

## G. Policy publication handoff — **closed by `APP4-B01-C1`**

**The G01 dataset is published by this checkpoint, on the API bootstrap path.**

### G.1 What the first delivery got wrong

B01 originally reported the seam **open** and routed ownership to `APP4-W01`. Its
three supporting observations were each accurate — B01 creates no new
publication capability, reads no policy value, and publication needs an Admin
identity — but the conclusion drawn from them was not. Acceptance criterion 28
allows exactly two outcomes: publication resolved here, or evidence that an
existing runtime already owns it. B01's own §G established the second is false,
which leaves only the first. "Routed to a later checkpoint" is a third option the
criterion does not offer, and unilaterally reassigning a `G01` hand-off is not a
resolution of it.

The Admin-identity observation also pointed the *opposite* way once followed
through: `APP4-W01` is a worker, holds no Admin identity at all, and would have
had to invent one — a far larger change than publishing from the path that
already resolves an Admin.

### G.2 Ownership

| Concern | Owner |
|---|---|
| Value source | `packages/database/seed/app4-policy-configuration.seed.json` — unchanged, still the only one |
| Dataset reader | `packages/database/src/seed/app4-policy-dataset.ts` — reads and validates shape, restates no value |
| Publisher | `apps/api/src/platform/policy/publish-app4-policy.use-case.ts` |
| Trigger | `apps/api/src/cli/staff-bootstrap.ts`, immediately after the Admin is created or reused |
| Admin attribution | the id that CLI just resolved, passed in |

The reader follows the delivered `migrationsFolderFrom` precedent exactly —
the caller resolves its own `package.json` path, the package does the path
arithmetic — which is why it works from both CommonJS and ESM. Adding
`"./package.json": "./package.json"` to the database package's `exports` was
required to make `require.resolve('@embroidery/database/package.json')` work;
`run-migrations.ts` had documented that exact call since DB7-CP1, so the export
was already assumed and simply missing.

### G.3 The four keys

Published through `PolicyConfigurationRepository.ensureKey` → `currentValue` →
`publishVersion`, no raw SQL, at `value_schema_version = 1`:

```text
verification.challenge
secure_grant
notification.delivery
secure_link.resolve
```

**No value was modified, and no value is restated anywhere in source** — the
checker asserts that seven APP4 policy field names appear in the dataset and in
no production TypeScript file.

### G.4 Idempotency, and why `ensureKey` alone is not enough

`ensureKey` makes the *key* idempotent; `publishVersion` **always appends**. A
bootstrap that runs on every container start would therefore accumulate one
identical version per boot. So each key is compared before it is published:
publish only when no version exists, or when the stored value or schema version
differs from the dataset.

The comparison canonicalizes with sorted keys, because the stored value has
round-tripped through JSONB and key order is not guaranteed to survive — an
order-sensitive compare would republish an identical value on every boot, which
is precisely the accumulation being prevented.

**Drift is corrected by appending**, never by mutating history:
`policy_configuration_versions` is immutable by design (DB4), and a snapshot
referencing an old version must keep its meaning forever.

### G.5 Evidence

From the live-database suite (§I):

- **First run** — four keys published, each at version 1, each value equal to the
  dataset field for field, each readable back through
  `PolicyConfigurationRepository.currentValue`.
- **Second run** — all four report `unchanged`; the version rows are identical to
  the first run's.
- **Three consecutive runs** — still exactly four version rows, which is the
  "bootstrap on every boot" case stated directly.
- **Drift** — a fixture version with a different value is corrected by appending
  version 2; version 1 survives unchanged and the current pointer moves.
- **Schema drift** — a stored version differing only in `value_schema_version` is
  also republished.
- **Attribution** — every published row carries the bootstrap Admin id.
- **Isolation** — an unrelated `worker.runtime` key is left untouched.

No runtime fallback constant was added anywhere: `APP4-W01` and every other
consumer must read policy from the store, and the checker asserts no production
file restates a policy value.

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

### H.2 `APP4-B01-C1` — the publication half

Added as `tools/check-app4-b01-policy.mjs` and called from the B01 gate. Split
because it is a **separate responsibility** — the B01 half proves the envelope
and the intake, this one proves the dataset reaches `policy_configurations` —
not to chase a line limit. It reuses the B01 half's `stripComments` rather than
re-implementing it, so both read code the same way.

It asserts: the dataset exists exactly once with all four keys at schema version
1; no second APP4 dataset file; one publisher that uses
`PolicyConfigurationRepository` with `ensureKey`, `currentValue` **and**
`publishVersion` and issues no raw SQL; the publisher reads the dataset and takes
an Admin id rather than resolving one; `staff-bootstrap` calls it with the
resolved id; no worker production file publishes policy; no `seed` script was
added to the root manifest; the migration count is unchanged; and — the one that
matters most — **no production TypeScript file restates any of seven APP4 policy
field names**, because a copied constant is the failure that silently creates a
second source of truth.

Fourteen mutation cases cover those, including one honesty case: worker **test
contexts** legitimately seed `worker.runtime` for their own suites, and the first
run of this half flagged all three of them. Scoped to production source, exactly
as §H.1 taught.

---

## I. Focused tests

| Suite | Tests | Covers |
|---|---|---|
| `packages/notification-delivery/test/unit/delivery-envelope.spec.ts` | 33 | key accepted/missing/blank/malformed-base64/wrong-length, error naming the variable not the value, `loadEnvelopeKey` from an injected map; round trip for both secret kinds; version and algorithm stamped; 96-bit nonce; fresh nonce across five seals; outer shape leaking none of secret, recipient, kind, channel or timestamps; unknown secret kind refused; short random source refused; tampered ciphertext, auth tag and nonce all rejected; wrong key rejected; unsupported version and algorithm rejected before key material is touched; six malformed-envelope shapes |
| `apps/api/src/modules/notification/domain/notification-intent-key.spec.ts` | 10 | determinism, SHA-256 hex shape, a different key for each of the four tuple components, no recipient or source id in the output, no randomness, delimiter-collision resistance, version prefix |
| `apps/api/src/modules/notification/tests/integration/notification-intake.integration.spec.ts` | 9 | one intent + one `PENDING` event; the linkage resolving the intent relationally; secret-free intent with masked recipient and correlation id; outbox payload carrying no plaintext; duplicate collapsing to one of each; three "different tuple → different notification" cases; a secure-link token through the same intake |
| `apps/api/src/platform/policy/tests/publish-app4-policy.integration.spec.ts` | 8 | **`APP4-B01-C1`** — four keys published at version 1 from the dataset; readable through the repository; identical rerun appends nothing; three consecutive boots still leave four rows; value drift appends a correcting version with history intact; schema-version drift republishes; every row attributed to the bootstrap Admin; an unrelated key untouched |
| `tools/check-app4-b01.test.mjs` | 44 (29 → 44 at C1) | mutation cases, plus the two honesty cases in §H.1 and fourteen publication cases in §H.2 |

**Total: 104 focused tests, all passing** (81 at first delivery; the correction
added 8 publication cases and 15 gate mutations, and changed no envelope or
intake test). Every secret and key in them is synthetic; none appears in this
report.

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

### J.2 `APP4-B01-C1` validation — a separate, narrower pass

The B01 chain above was **not** restarted. Only what the correction touched was
run:

| # | Command | Why | Result |
|---|---|---|---|
| C1 | `pnpm --filter @embroidery/database exec tsc --noEmit` | The dataset reader is new TypeScript in that package. | **PASS** |
| C2 | `pnpm --filter @embroidery/database build` | The API resolves the package through `dist`; the new export must be there. | built |
| C3 | `pnpm --filter @embroidery/api exec tsc --noEmit` | The publisher, the module and the CLI change. Ran twice — see J.3. | **PASS** |
| C4 | `pnpm --filter @embroidery/api exec jest --runInBand --testPathPatterns="publish-app4-policy"` | The only new suite. Ran twice — see J.3. | **PASS** 8/8 |
| C5 | `node tools/check-app4-b01.mjs` | The gate now includes the publication half. Ran twice — see J.3. | **PASS** |
| C6 | `node --test tools/check-app4-b01.test.mjs` | Its mutation tests, extended by 15. | **PASS** 44/44 |
| C7 | `pnpm --filter @embroidery/database exec eslint src/seed src/index.ts` | Scoped lint for the changed database files. | **PASS** |
| C8 | `pnpm --filter @embroidery/api exec eslint src/platform/policy src/cli/staff-bootstrap.ts src/bootstrap/app.module.ts` | Scoped lint for the changed API files. | **PASS** |
| C9 | `pnpm exec prettier --check <9 changed paths>` / `--write <3 files>` | Changed TS, JSON and `.mjs`. | **PASS** after the write |
| C10 | `node tools/check-report-secrets.mjs` | Run once after the final report edit. | **PASS** |
| C11 | `git diff --cached --check` | Whitespace safety. | clean |

**Deliberately not re-run:** the `@embroidery/notification-delivery` unit suite
and the notification-intake integration suite. The correction changed **no file
either one imports** — the envelope package, the intake use case, the
notification domain and `outbox-event-store.ts` are untouched — so re-running
them would be the reassurance repeat the directive forbids, and their pass state
from the first delivery still describes the committed code.

### J.3 Correction reruns

- **C3** ran twice: the first failed because `result.adminId` is
  `string | undefined` for the mismatch and not-active outcomes. Fixed by gating
  on a resolved id rather than on the outcome name, which is the more honest
  guard anyway — those outcomes have no Admin to attribute a version to.
- **C4** ran twice: the first failed with
  `Cannot find module '@embroidery/database/package.json'`. Node's exports
  gating blocked the subpath, so `"./package.json": "./package.json"` was added
  to the package's `exports`. That call had been documented in
  `run-migrations.ts` since DB7-CP1 — the export was assumed and never added.
- **C5** ran twice: the first flagged three worker **test contexts** that seed
  `worker.runtime`. Scoped to production source (§H.2).

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

### K.2 `APP4-B01-C1` files

**Created (4)**

- `packages/database/src/seed/app4-policy-dataset.ts` — the dataset reader
- `apps/api/src/platform/policy/publish-app4-policy.use-case.ts`
- `apps/api/src/platform/policy/policy.module.ts`
- `apps/api/src/platform/policy/tests/publish-app4-policy.integration.spec.ts`
- `tools/check-app4-b01-policy.mjs`

**Modified (6)**

- `packages/database/package.json` — one `exports` entry, `./package.json`
- `packages/database/src/index.ts` — re-exports the reader
- `apps/api/src/bootstrap/app.module.ts` — `PolicyModule` composed
- `apps/api/src/cli/staff-bootstrap.ts` — publishes after the Admin resolves
- `tools/check-app4-b01.mjs` — calls the publication half
- `tools/check-app4-b01.test.mjs` — 15 more mutation cases

**Deliberately untouched by the correction**, and verified so:
`packages/notification-delivery/**`,
`apps/api/src/modules/notification/application/request-notification.use-case.ts`,
`apps/api/src/modules/notification/domain/**`,
`packages/persistence/src/platform/outbox-event-store.ts`. The envelope schema,
AES-GCM, key parser, secret kinds, `NotificationRequest`, the intent key,
duplicate-intent behaviour, the outbox linkage, `OUTBOX_AGGREGATE_KINDS` and the
`NotificationModule` composition are all exactly as B01 delivered them.

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
| B01 entry HEAD | `78bb90c59aee72392a1babe8f1946d0ec9ff2383` |
| B01 implementation | `e9bdbc3dddc00e3ce920e6060b5db82706a07bf3` — `feat(app4): add notification intent intake and the shared delivery envelope` |
| B01 evidence | `31db2d900f6dafbea08e7042876dbbdba1a06f3e` — `docs(app4): record APP4-B01 commit evidence` |
| **C1 entry HEAD** | `31db2d900f6dafbea08e7042876dbbdba1a06f3e` |
| **C1 correction** | `__C1_COMMIT__` — `fix(app4): publish the APP4 policy dataset from the staff-bootstrap path` |
| **C1 evidence** | `docs(app4): record APP4-B01-C1 commit evidence` — substitutes the hash above and changes nothing else |
| Final HEAD | the C1 evidence commit, the last of the four |
| Working tree after all commits | clean |
| Pushed | **no** |

A commit cannot contain its own hash, so each implementation commit's hash is
written by the one-line evidence commit that follows it — the convention
`APP4-P00`, `G01`, `D01` and `P01` all used.

The two B01 commits are **left in place**, not amended: the open seam and its
closure are both part of the record.

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
| 28 | Policy handoff truthfully resolved | **MET after `APP4-B01-C1`** — published here from the staff-bootstrap path, §G. **Not met at first delivery**, which routed it to W01 instead, §G.1 |
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

### O.1 `APP4-B01-C1` stop condition

The correction had exactly one: *a locked repository contract proves the
staff-bootstrap flow cannot expose or reuse its resolved Admin id for policy
publication without changing authentication or customer semantics.*

**Not met.** `BootstrapStaffUseCase.ensure` already returns `{ outcome, adminId }`
and `staff-bootstrap.ts` already prints that id in its result line, so the value
was in hand before this correction and nothing about authentication changed to
obtain it. The publisher receives it as a parameter and resolves no Admin of its
own — no `findFirst`, no `limit(1)`, no environment variable, no synthetic
account. The only adjustment was gating on `adminId !== undefined`, because the
mismatch and not-active outcomes carry no id to attribute a version to.

---

## P. `APP4-B01-C1` acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | The G01 dataset stays the single value source | **MET** — §G.2; gate asserts no restatement in production source |
| 2 | The API bootstrap path owns publication | **MET** — §G.2 |
| 3 | The existing staff-bootstrap Admin id is reused | **MET** — §G.2, §O.1 |
| 4 | All four keys published through `PolicyConfigurationRepository` | **MET** — §G.3 |
| 5 | Publication uses `value_schema_version = 1` | **MET** — §G.3, asserted in the suite and the gate |
| 6 | Identical rerun appends zero versions | **MET** — §G.5, incl. a three-boot case |
| 7 | Drift appends, never mutates history | **MET** — §G.4, §G.5 |
| 8 | No arbitrary Admin lookup introduced | **MET** — §O.1; gate asserts it |
| 9 | No worker-side publication | **MET** — gate assertion 8 |
| 10 | No worker policy fallback constants | **MET** — gate asserts no restated value in any production file |
| 11 | No generic seed framework | **MET** — one reader for one dataset; gate rejects a `seed` root script |
| 12 | No schema or migration | **MET** — migration count still 34 |
| 13 | No G01 policy value changed | **MET** — the dataset file is untouched |
| 14 | B01 envelope/intent/outbox behaviour unchanged | **MET** — §K.2 |
| 15 | Focused publication tests pass | **MET** — 8/8 |
| 16 | B01 checker and its tests pass | **MET** — gate clean, 44/44 |
| 17 | Required typechecks pass | **MET** — database and API, §J.2 |
| 18 | Validation change-impact-only | **MET** — §J.2, incl. the two suites deliberately not re-run |
| 19 | Report removes the W01 re-route | **MET** — §G rewritten, §A.1, criterion 28 |
| 20 | Working tree clean | **MET** — §L |
| 21 | Nothing pushed | **MET** — §L |
| 22 | Next checkpoint remains `APP4-W01` | **MET** — §M |
