# `APP4-G01` — Completion Report

**Checkpoint:** `APP4-G01` — Secure access, verification and notification authority
**Date:** 2026-08-14 · **Branch:** `production`

---

## A. Verdict

**`PASS`**

No stop condition was met, no `TRUE_PO_DECISION` was routed, and no runtime
feature was implemented. All twenty-two acceptance criteria hold (§K).

---

## B. Entry state

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `a4ac4fd125e7e02bf03f8037b535f2906517383a` |
| Entry working tree | clean (`git status --porcelain` empty) |
| `APP4-P00` | `PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE`, not reopened |
| `APP4-P00-C2` | does not exist and was not created |

P00 was read for its manifest obligations (§F `APP4-G01` scope items 1–16, §C.5,
§C.7, §C.8) and not re-audited.

---

## C. Authority artifact

### C.1 ADR

**Created:**
[`docs/adr/backend/ADR-APP4-001-SECURE-ACCESS-VERIFICATION-AND-NOTIFICATION-AUTHORITY.md`](../../adr/backend/ADR-APP4-001-SECURE-ACCESS-VERIFICATION-AND-NOTIFICATION-AUTHORITY.md)

Status `Accepted`, decision ID `IMP-D049`, following the existing
`docs/adr/backend/ADR-APP<phase>-<n>-<TOPIC>.md` convention (`ADR-APP1-001`,
`ADR-APP2-001`, `ADR-APP2-002`). Sections §1–§13 make the rules canonical; **§14.1
is a 103-row fact table** that is the machine-checked authority. This report
cites the ADR; it is not itself the authority.

### C.2 Decision register

One new row, `IMP-D049`, `LOCKED`, in
`docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` §1, recording
twelve rulings `PO-01`…`PO-12`. No existing row was modified. `IMP-O006`
(notification provider) stays open, as P00 recorded.

### C.3 Policy keys and values

Four configuration keys, all at value schema version 1, published through the
existing `policy_configurations` / `policy_configuration_versions` mechanism.
Dataset: `packages/database/seed/app4-policy-configuration.seed.json`
(tier `SYSTEM_REFERENCE`, `containsSecrets: false`).

| Config key | Field | Value | Unit |
|---|---|---|---|
| `verification.challenge` | `ttlSeconds` | `600` | seconds |
| | `codeLength` | `6` | characters |
| | `codeAlphabet` | `DECIMAL_DIGITS` | enumeration |
| | `maxAttempts` | `5` | attempts |
| | `resendCooldownSeconds` | `60` | seconds |
| | `rateWindowSeconds` | `900` | seconds |
| | `maxIssuesPerTargetPerWindow` | `5` | issuances |
| `secure_grant` | `standardTtlSeconds` | `604800` | seconds (7 days) |
| | `stepUpWindowSeconds` | `900` | seconds (15 minutes) |
| `notification.delivery` | `maxAttempts` | `3` | attempts |
| | `retryDelaysSeconds` | `[60, 300]` | seconds |
| `secure_link.resolve` | `maxRequestsPerIpPerMinute` | `30` | requests |

No secret value appears in the dataset, and none is invented anywhere.

**Naming adaptation (prompt §1).** The prompt's `verification.challenge.ttl_seconds`
form is preserved in semantics and adapted in spelling to the repository
convention — a dot-separated configuration key plus a camelCase field inside the
JSONB value, grouped one key per cohesive policy object exactly as
`worker.runtime` is (`apps/worker/src/runtime/policy/worker-runtime-policy.ts`,
`APP2-I02` §12). A row per scalar would turn one coherent policy change into
twelve independent appends with no version in which the set agreed.

### C.4 Route slugs

| Surface | Route |
|---|---|
| Storefront — contact verification | `/xac-minh-lien-he` |
| Storefront — secure-link landing | `/truy-cap` |
| Admin — customer access support | `/support/customer-access` |

Checked against the delivered route trees (Storefront: `/`, `/kham-pha`,
`/san-pham/[slug]`, `/healthz`; Admin: `/login`, `/healthz`, `(protected)/assets`,
`products`, `design-templates`) and against IMP-D038 / IMP-D039. No collision.

---

## D. Locked security semantics

**Opaque verification code.** Exactly 6 decimal digits from a CSPRNG, with
**modulo-biased selection prohibited** — `randomBytes(n) % 10` is measurably
non-uniform and a six-digit code has little enough entropy already. Persisted
only as a peppered HMAC-SHA-256 digest in
`contact_verification_challenges.code_hash`; compared in constant time.

**Secure-link token entropy.** At least **256 bits** of CSPRNG entropy, unpadded
base64url, persisted only as a peppered HMAC-SHA-256 digest in
`secure_access_grants.token_hash`. This mirrors the delivered
`DesignSessionSecretIssuer` / `Verifier` pair (IMP-D043): one digest
implementation shared by issuance and verification, so the two cannot drift.

**Hashing / pepper separation.** Two dedicated names —
`VERIFICATION_CODE_SECRET_PEPPER` and `SECURE_LINK_TOKEN_SECRET_PEPPER`, minimum
32 characters, fail-closed, no unpeppered fallback — following the
`DESIGN_SESSION_SECRET_PEPPER` convention in shape only, because that convention
is scoped to the Design Session credential. **Neither may be the AEAD key and the
AEAD key may not be a pepper:** rotating a pepper invalidates every stored
digest, rotating the envelope key makes every un-delivered envelope unopenable,
and one shared value would couple two unrelated outages.

**AEAD key authority.** `NOTIFICATION_DELIVERY_ENVELOPE_KEY`, base64, **exactly
32 bytes decoded**, no default and no fallback, **fail closed** in any runtime
path that issues or delivers an envelope, never logged in encoded or decoded
form. Declared empty in `.env.example`. **No production key value is invented or
committed.**

**Envelope version and algorithm.** Version `1`, `AES-256-GCM` from `node:crypto`,
a fresh cryptographically random **96-bit** IV per seal never reused, binary
fields base64url. Outer envelope carries only `version`, `algorithm`, `iv`,
`ciphertext`, `authTag`; plaintext carries only `secretKind`
(`VERIFICATION_CODE` | `SECURE_LINK_TOKEN`), `originNotificationIntentId`,
`channel`, `normalizedRecipient`, `secret`, `issuedAt`, `expiresAt`. Persisted to
`outbox_events.payload` in the same transaction as the business write; **never**
to `notification_intents.params`. Authentication failure is terminal for that
attempt and recorded only as a bounded `error_class`.

**Current-intent linkage versus lineage-only reference.** The **current**
notification intent is the outbox event's non-secret aggregate linkage
(`aggregate_kind = NOTIFICATION_INTENT`, `aggregate_id =` the current
`notification_intent.id`). The encrypted `originNotificationIntentId` is an
**immutable lineage reference only**. The two coincide on first delivery — which
is precisely why a consumer can use the wrong one and never notice — and diverge
on replay, where the ciphertext is copied byte-identically. A worker that used
the encrypted reference as the mutable target would force replay to re-seal,
which would force the API to decrypt.

**Retry / replay / resend.** Three contracts, three names, never
interchangeable: *automatic transport retry* (`APP4-W01`, same everything, mints
nothing), *Admin manual transport replay* (`APP4-B08`, both origin records stay
terminal, one new `PENDING` intent and one new `PENDING` outbox event,
byte-identical ciphertext, the API never decrypts), *business resend/reissue*
(`APP4-B03` / `APP4-B05`, new secret and new envelope). Replay `intent_key` is
the SHA-256 hex digest of
`app4-manual-replay:v1:<originNotificationIntentId>:<deadLetterOutboxEventId>`,
collapsing duplicates through **existing** `intent_key` uniqueness with no new
idempotency framework, and never substituting for the existing
lock-and-guarded-write convention. Refusal is `409` / `REISSUE_REQUIRED`, routing
the operator to the business path; **no plaintext is ever reconstructed from a
hash.**

**Fragment transport.** `https://<storefront-origin>/truy-cap#t=<opaque-token>`.
Never in a server-visible path or query and therefore never in an access log;
read locally by `APP4-S02` and stripped with `history.replaceState` **before**
any analytics, beacon or third-party activity; held in an ephemeral local
variable; POSTed in the body of `/public/secure-links/resolve`; stored in none of
Zustand, TanStack Query cache data, `localStorage`, `sessionStorage`, cookies,
persisted React/Next state, analytics or logs; never echoed. No query-parameter
or path-segment carrier and no fallback.

**Non-enumerating public failure.** Unknown token, expired, revoked, superseded,
wrong target and wrong purpose all answer `404` / `SECURE_LINK_UNAVAILABLE` in
the standard envelope — identical body, status and externally observable
classification. Internal audit keeps a bounded non-secret reason class. This
follows the delivered `PUBLIC_DESIGN_TEMPLATE_NOT_FOUND` shape (`APP3-B05`), where
the shape of the error file *is* the non-disclosure rule. The
`secure_link.resolve` limit counts requests and never outcomes, so it cannot
become a token-validity oracle.

---

## E. Policy configuration evidence

Every key and value is listed in §C.3 above and is asserted twice by the gate:
against `packages/database/seed/app4-policy-configuration.seed.json` and against
ADR §14.1. Asserting one source alone would make a drift between them
undetectable, which is the drift that matters.

Value schema version for all four keys: `1`. Units are declared per field in the
dataset — a field without a unit fails the gate, because a unitless `600` is what
the first consumer reads as minutes.

Derived invariant asserted: `retryDelaysSeconds` must hold exactly
`maxAttempts - 1` entries.

**No secret value is recorded here or in the dataset.**

**Known seam (not a defect of this checkpoint).** No seed *runner* exists: the
repository has no `db:seed` script and no seed program, because `ADR-DB1-015`
deferred the layout and the runner to DB9, which has not shipped. `APP4-G01`
therefore contributes the dataset, not a new mechanism; the publishing call
belongs to `APP4-B01`. Publishing requires an `admin_accounts` row
(`policy_configuration_versions.created_by_admin_id` is `NOT NULL`), which the
existing `staff-bootstrap` path already provides. Recorded in ADR §1.1 and in the
ADR's negative consequences.

---

## F. Checker evidence

**Files:** `tools/check-app4-g01.mjs` (370 lines),
`tools/check-app4-g01-authority.mjs` (245 lines),
`tools/check-app4-g01.test.mjs` (466 lines).

Split by responsibility, not by line count: the authority module is **what the
ruling says** (canonical file map, the four policy objects, the 103 expected
facts, the fact-table parser, the literal-secret scan); the checker is **what the
repository must therefore look like**. A value change is then a one-line diff in
a table rather than an edit inside assertion logic. Both halves sit under the
repository's 400-line source hard limit (`tools/check-file-size.mjs`) as well as
the 450-line tooling soft cap; the test sits under both the 600-line test hard
limit and the 700-line soft cap.

| Command | Result |
|---|---|
| `node --test tools/check-app4-g01.test.mjs` | **PASS** — 43 tests, 8 suites, 0 failures |
| `node tools/check-app4-g01.mjs` | **PASS** — 0 failures, exit 0 |

### F.1 Assertions covered

All twenty-seven required assertions, mapped:

| # | Assertion | Where |
|---|---|---|
| 1 | all required policy keys exist | `checkSeed`, `checkFacts` |
| 2 | values equal the locked defaults | `checkSeed` + `checkFacts` (both sources) |
| 3 | route slugs present | `checkFacts`, `checkGovernance` |
| 4 | public unavailable is exactly `404` / `SECURE_LINK_UNAVAILABLE` | `checkFacts` |
| 5 | replay refusal is exactly `409` / `REISSUE_REQUIRED` | `checkFacts` |
| 6 | default phone region `VN` | `checkFacts` |
| 7 | verification code is 6 decimal digits | `checkFacts`, `checkSeed` |
| 8 | standard grant TTL = 7 days | `checkSeed`, `checkFacts` |
| 9 | step-up window = 15 minutes | `checkSeed`, `checkFacts` |
| 10 | max attempts 3, delays 60/300 | `checkSeed` (+ the `maxAttempts - 1` invariant) |
| 11 | algorithm `AES-256-GCM` | `checkFacts`, `checkDecision` |
| 12 | envelope version `1` | `checkFacts` |
| 13 | env key name | `checkFacts`, `checkEnvExample`, `checkDecision` |
| 14 | `.env.example` declares it with no value | `checkEnvExample` |
| 15 | envelope key distinct from hashing peppers | `checkFacts`, `checkEnvExample` (alias detection) |
| 16 | `@embroidery/notification-delivery` is the future owner | `checkFacts`, `checkNothingInstalled` |
| 17 | no external provider selected | `checkNothingInstalled` (3 manifests × 13 packages) |
| 18 | queue authority remains APP2's outbox | `checkFacts`, `checkQueueAndLinkage` |
| 19 | `claimBatch` has no production caller | `checkQueueAndLinkage` (walks every `apps/api/src` `.ts`) |
| 20 | linkage is `NOTIFICATION_INTENT` + `aggregate_id` | `checkFacts`, `checkQueueAndLinkage` |
| 21 | encrypted intent reference is lineage-only | `checkFacts` |
| 22 | retry / replay / resend separately defined | `checkFacts` (13 distinct facts) |
| 23 | replay uses a new intent and new outbox row | `checkFacts` |
| 24 | old `FAILED` intent and `DEAD_LETTER` row stay terminal | `checkFacts` |
| 25 | replay key is deterministic SHA-256 over the locked input | `checkFacts` |
| 26 | fragment transport locked to `/truy-cap#t=` | `checkFacts`, `checkGovernance` |
| 27 | no production key/token/code literal in APP4 authority docs | `checkNoLiterals` |

The checker reads source-of-truth files — the ADR, the seed dataset,
`.env.example`, the register, the real `outbox-event-store.ts`, every
`apps/api/src` TypeScript file, the migration directory, three package manifests
— and **does not read this completion report**. It re-implements no business
logic: it compares recorded facts, counts files and detects absence.

### F.2 The gate refuses things

The 43 test cases are mutation tests: each breaks exactly one ruling in a
throwaway copy of the repository and asserts the gate refuses it. Among them: a
seed that drifts from the ADR; a fourth automatic attempt; a policy field that
lost its unit; a public failure that starts naming its cause; a `DEAD_LETTER` row
reset to `PENDING`; an API that would decrypt during replay; the encrypted
reference promoted to the current intent; a pepper declared with a value; an
envelope key that aliases a pepper; the shared package created early; a provider
package entering a manifest; the outbox guard extended before `APP4-B01`; and a
production caller of `claimBatch` smuggled in behind the gate.

Two cases exist to keep the gate honest rather than strict: a `.spec.ts` caller
of `claimBatch` must **not** fail (only production callers are forbidden), and
the literal-secret scan must **not** flag a file path, a decision id, a git hash
or `maxIssuesPerTargetPerWindow` — a scanner that cries wolf gets disabled within
a week and then protects nothing.

---

## G. Validation ledger

| # | Command | Why it was necessary | Result | Rerun? |
|---|---|---|---|---|
| 1 | `node --test tools/check-app4-g01.test.mjs` | G01 introduces the checker; its own tests are the only proof the gate refuses anything. Run after the checker and test reached final form. | **PASS** (43/43) | Yes — twice, both times after a covered file changed. See G.1. |
| 2 | `node tools/check-app4-g01.mjs` | The checkpoint's own authority gate over every artifact it produced. | **PASS** (0 failures) | Yes — once, after Prettier reformatted the checker. See G.1. |
| 3 | `pnpm exec prettier --check <9 changed files>` | G01 changed Markdown, JSON and `.mjs` files that Prettier owns. Explicit paths only; no repository-wide chain. | **PASS** | Yes — once, after `--write` fixed two files. See G.1. |
| 4 | `pnpm exec prettier --write tools/check-app4-g01.mjs tools/check-app4-g01.test.mjs` | Command 3 reported these two as unformatted; this is the fix, not a repeat. | applied | No |
| 5 | `node tools/check-report-secrets.mjs` | The ADR and this report discuss key and pepper **names**; the gate proves none carries a value, and that no secret-bearing file became tracked. Run once, after the final report edit, with every new file staged so `git ls-files` can see it. | **PASS** — 449 documents, 2694 tracked files | No |
| 6 | `git diff --cached --check` | Whitespace and conflict-marker safety on the staged change. | clean | No |

**No full regression/test chain was run.**

Not run, and why: Jest (no runtime source changed), the API/worker integration
suites (no application code), frontend tests and Playwright (no UI), repository
typecheck and app builds (G01 adds no TypeScript — the seed data is JSON and the
tooling is `.mjs`), OpenAPI generation/check and API-client generation/check (no
HTTP surface), DB manifest/regression (no schema and no migration), the Figma
check (no design artifact), SonarQube, and any aggregate chain.

**ESLint (§18.D) does not apply and was not run.** ESLint in this repository is
per-workspace (`turbo run lint`); `pnpm-workspace.yaml` declares `apps/*`,
`packages/*` and `spikes/*` only, so `tools/` is covered by no workspace ESLint
configuration and no root ESLint binary is installed. The three changed lintable
files all live in `tools/`. Running a monorepo-wide lint to reach them is exactly
the aggregate §18 forbids, so the files were formatted with Prettier (command 3)
and left otherwise unlinted — the same position every existing `tools/check-*.mjs`
is in.

### G.1 Reruns, and what changed before each

Per §19, every rerun below followed a change to a file that command covers; no
successful command was repeated for reassurance.

- **Command 1** ran twice. The first run failed one case (`catches a dropped
  ruling`): the anchor `**(PO-08)` also appears in the `IMP-D048` row, so a
  first-match `String.replace` mutated the wrong decision row and the gate
  correctly saw nothing wrong. The test was corrected to anchor on the full
  ruling title, and one further case was rewritten because its assertion
  (`failures.length === 0 || …`) was a tautology that could never fail. Rerun:
  PASS.
- **Command 2** ran twice. The first version of the literal-secret scan matched
  `/` and `+`, so it flagged twelve file paths as base64 key material. The scan
  was narrowed to separator-free segments of ≥24 characters mixing case and
  digits, and the checker was split into two files to stay under the 400-line
  source limit. Rerun after Prettier reformatting: PASS.
- **Command 3** ran twice, the second time after command 4 fixed the two files it
  had reported. `.env.example` was excluded after the first invocation reported
  `No parser could be inferred` — Prettier does not own that file type.
- **Command 5** was invoked once as a *valid* run, and its figures above are that
  run's output verbatim. The only later edit to this report corrected those two
  figures inside this ledger; the gate counts tracked documents and tracked
  files, neither of which an edit to an already-staged file can change, so
  reissuing it would print the identical line. An earlier invocation, made
  before staging, could not see the new ADR, seed dataset or checker files at all
  (`git ls-files` lists tracked and staged paths only), so it proved nothing
  about this checkpoint and is not counted as a run of the required validation.

---

## H. Files changed

**Created (6)**

- `docs/adr/backend/ADR-APP4-001-SECURE-ACCESS-VERIFICATION-AND-NOTIFICATION-AUTHORITY.md`
- `docs/implementation/reports/APP4-G01-COMPLETION-REPORT.md`
- `packages/database/seed/app4-policy-configuration.seed.json`
- `tools/check-app4-g01.mjs`
- `tools/check-app4-g01-authority.mjs`
- `tools/check-app4-g01.test.mjs`

**Modified (5)**

- `.env.example` — three empty declarations (`VERIFICATION_CODE_SECRET_PEPPER`,
  `SECURE_LINK_TOKEN_SECRET_PEPPER`, `NOTIFICATION_DELIVERY_ENVELOPE_KEY`)
- `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` — `IMP-D049`
- `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` — APP4 status and the
  G01 record
- `docs/implementation/SCOPED_COMMAND_INDEX.md` — `CMD-CHECK-APP4-G01`,
  `CMD-TEST-APP4-G01`
- `docs/implementation/audits/APP4_PHASE_ENTRY_AUDIT.md` — §F `APP4-G01` marked
  delivered; §K next checkpoint is now `APP4-D01`

**Scope note.** The prompt's §2 scope names `.env.example` "with an empty
delivery-envelope key declaration". Two further empty declarations were added,
because §7.2 requires G01 to lock dedicated hash-pepper configuration **names**
and a locked name with no declaration is not a checkable one — the separation
ruling (§21) is only enforceable if all three names exist and are distinct. Both
are empty, both are unread until `APP4-P01`, and both are reversible by deletion.

Nothing else was touched. No runtime source, no schema, no migration, no
OpenAPI artifact, no generated client, no package manifest, no lockfile, no root
`package.json` script.

---

## I. Git evidence

| Item | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `a4ac4fd125e7e02bf03f8037b535f2906517383a` |
| Commit | `__G01_COMMIT__` |
| Subject | `docs(app4): lock APP4-G01 secure-access, verification and notification authority` |
| Final HEAD | `__FINAL_HEAD__` |
| Working tree after commit | clean |
| Pushed | **no** |

A commit cannot contain its own hash, so the placeholders above are replaced by
the one-line evidence commit that follows — the same two-step `APP4-P00` used,
and the regress terminates there.

---

## J. Next checkpoint

**`APP4-D01`** — the APP4 phase design package.

It is unblocked because the only thing it was waiting on from `APP4-G01` is the
route authority, and all three slugs are now locked (§C.4). It must use them
exactly, must produce **one complete phase design package** rather than
per-checkpoint fragments (IMP-D003), and must update `FIGMA_DESIGN_INDEX.md` in
the same checkpoint with exact node IDs and deep links.

`APP4-D01` was **not** started here.

---

## K. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | All policy values canonicalized | **MET** — §C.3, ADR §1, gate assertions 1–2 |
| 2 | Route slugs locked | **MET** — §C.4 |
| 3 | Email/phone normalization and masking locked | **MET** — ADR §2 |
| 4 | 6-digit verification-code authority locked | **MET** — ADR §1.3, §5.1 |
| 5 | Secure-token entropy locked | **MET** — ADR §5.2 (≥256 bits, base64url) |
| 6 | Hashing peppers separate from the envelope key | **MET** — ADR §5.3, §6.2; enforced in `.env.example` |
| 7 | `NOTIFICATION_DELIVERY_ENVELOPE_KEY` exact and fail-closed | **MET** — ADR §6.2 |
| 8 | AES-256-GCM / envelope version 1 locked | **MET** — ADR §6.3, §6.4 |
| 9 | Shared package ownership locked | **MET** — ADR §6.1 |
| 10 | Encrypted intent reference explicitly lineage-only | **MET** — ADR §6.5 |
| 11 | Outbox aggregate linkage is the current intent identity | **MET** — ADR §6.5, §7 |
| 12 | Retry / replay / resend cannot be confused | **MET** — ADR §8, 13 distinct facts |
| 13 | Manual replay deterministic key locked | **MET** — ADR §9 |
| 14 | Public secure-link failures non-enumerating | **MET** — ADR §3 |
| 15 | Fragment-only secure-link transport locked | **MET** — ADR §11 |
| 16 | Provider neutrality intact | **MET** — ADR §12; gate assertion 17 |
| 17 | No schema / migration / provider / runtime feature implemented | **MET** — gate assertions 16–19 and the no-implementation checks |
| 18 | Focused checker and checker tests pass | **MET** — §F |
| 19 | Validation is change-impact-only | **MET** — §G |
| 20 | No successful validation command needlessly repeated | **MET** — §G.1 |
| 21 | Completion report records exact Git evidence | **MET** — §I |
| 22 | Next checkpoint is `APP4-D01` | **MET** — §J |

---

## L. Stop conditions — all five checked, none met

| # | Stop condition | Finding |
|---|---|---|
| 1 | Policy configuration cannot represent a required value without schema change | **Not met.** `policy_configuration_versions.value` is `jsonb` with a companion `value_schema_version`; all twelve values are scalars, an enumeration string and one integer array. `PolicyConfigurationRepository.ensureKey` / `publishVersion` / `currentValue` already exist and already carry `worker.runtime`. No schema change. |
| 2 | `.env.example` / config governance forbids the dedicated envelope key | **Not met.** The file already declares four secret-bearing variables with empty values (`STAFF_BOOTSTRAP_PASSWORD`, `DESIGN_SESSION_SECRET_PEPPER`, `SONAR_TOKEN`, `STAFF_BOOTSTRAP_EMAIL`), and `CLAUDE.md` §8a governs writing `.env`, never `.env.example`. Declaring a name with no value is the established pattern. |
| 3 | Outbox aggregate authority cannot accept `NOTIFICATION_INTENT` without schema change | **Not met.** `outbox_events` carries only a primary key and `ck_outbox_events__status_allowed`; `aggregate_kind` / `aggregate_id` are plain `text` with **no CHECK** because REL-104 is polymorphic. The closed set is the application guard `OUTBOX_AGGREGATE_KINDS`, whose extension has an exact precedent — `APP2-B03` added `PRODUCT` with the in-source note that this "is the G-DB7-47 write-time guard, not a schema constraint — no migration". `BACKGROUND_JOB_KINDS` already contains `NOTIFICATION_DELIVERY`. |
| 4 | A locked cryptographic ADR forbids AES-256-GCM or mandates another AEAD | **Not met.** No AEAD primitive exists anywhere in the repository (no `createCipheriv`, no `aes-256-gcm`, no wrapper) and no cryptographic ADR exists. The only established convention is a runtime HMAC **pepper** for hashing, which is a different primitive; its *shape* is reused and its value is not. |
| 5 | An existing locked route authority owns one of the APP4 routes with incompatible semantics | **Not met.** IMP-D038 locks `/kham-pha` and `/`; IMP-D039 locks `/san-pham/[slug]`. The delivered Storefront and Admin route trees contain none of `/xac-minh-lien-he`, `/truy-cap` or `/support/customer-access`. |

No `TRUE_PO_DECISION` was routed: every value in this checkpoint resolved at
authority level 2 (existing ADR/document authority), level 3 (existing APP0–APP3
architecture and repository pattern) or level 4 (conservative, reversible,
scope-minimizing default backed by versioned configuration).
