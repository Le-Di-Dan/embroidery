# ADR-APP4-001 — Secure Access, Verification and Notification Authority

- Status: Accepted
- Date: 2026-08-14
- Phase / checkpoint: APP4 / `APP4-G01`
- Decision ID: IMP-D049
- Supersedes: none
- Depends on (not reopened): `ADR-DB2-001` (customer identity, Option A),
  `ADR-DB2-003` (notification persistence), `ADR-DB3-004` (secure grant and
  re-verification), `ADR-DB4-004` (JSONB boundaries), `ADR-APP2-002` / IMP-D029
  (asynchronous job runtime — the outbox **is** the queue), `IMP-D043` (the
  opaque-secret and pepper convention this ADR reuses in shape only)

## Context

`APP4-P00` closed as `PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE` with a 17-checkpoint
manifest, 10 HTTP endpoints, and a migration verdict of `NO_APP4_MIGRATION`. It
left one thing deliberately undone: the **values and vocabulary** that
`APP4-D01`, `APP4-P01`, `APP4-B01`, `APP4-W01` and every later APP4 checkpoint
would otherwise each invent for themselves.

That gap is not hypothetical. `ADR-DB3-004` defers every expiry-class duration,
the step-up window, attempt limits and cooldowns to policy configuration
(CON-144) with the acceptance condition "configured before the secure-flow
feature ships". `policy_configurations` / `policy_configuration_versions` exist
and hold **no APP4 key**. Contact normalization (CON-163/164) is named but not
specified. The `APP4-P00-C1` encrypted delivery envelope and the mandatory
closure's dead-letter replay contract were ruled but not reduced to exact field
names, key configuration or a deterministic replay key.

This ADR makes all of it canonical and machine-checkable. It decides **nothing
new about product behaviour** — it fixes the values, names and vocabulary the
already-locked architecture needs, choosing conservative and configuration-
reversible defaults wherever an authority deferred the number rather than the
rule.

### What this ADR does not do

It implements nothing. No customer service, no verification API, no notification
service, no `packages/notification-delivery`, no AES-GCM runtime, no worker
handler, no Admin replay, no UI, no OpenAPI operation, no generated client, no
schema, no migration, and no external notification provider. `IMP-O006`
(notification channel/provider) stays open as `APP4-PO-001`, non-blocking until
APP12.

## Decision Drivers

- **A value invented inside an implementation checkpoint is unreviewable.**
  `CLAUDE.md` §5 forbids hard-coded business values precisely because the review
  boundary for "how long is a secure link valid" is not a pull request that also
  ships a controller.
- **Reversibility beats precision.** Every duration and limit below is stored in
  versioned policy configuration, so a wrong guess is an append, not a
  migration. That is what makes it legitimate to lock them now.
- **Separate secrets must be structurally separate.** A hashing pepper and an
  AEAD key that share one configuration value share one blast radius; the
  separation has to be a name, not a comment.
- **The three delivery contracts drift if they share a word.** "Retry",
  "replay" and "resend" describe three different transactions with three
  different effects on the customer's secret. The vocabulary is the guardrail.
- **Non-enumeration is a shape, not a message.** Six distinct causes must be
  externally indistinguishable, which is a property of the response contract and
  is only preserved if it is stated once and checked.

## 1. Policy configuration

### 1.1 Mechanism

APP4 policy values are published through the mechanism the platform already
owns: `policy_configurations` (TBL-076) + `policy_configuration_versions`
(TBL-077) via `PolicyConfigurationRepository.ensureKey` / `publishVersion`, read
back through `currentValue`. This is exactly the path `worker.runtime` uses
(`APP2-I02` §12). **No schema change and no migration.**

Values are grouped one configuration key per cohesive policy object with a
versioned JSONB value, following the `worker.runtime` precedent rather than one
row per scalar. A row per scalar would make an atomic policy change into twelve
independent appends, and there would be no version in which the set was
coherent.

The canonical seed data is
[`packages/database/seed/app4-policy-configuration.seed.json`](../../../packages/database/seed/app4-policy-configuration.seed.json)
— tier `SYSTEM_REFERENCE` per `ADR-DB1-015` (required for the application to
function, upsert-safe by natural key, deterministic, secret-free). It is data,
not a runner: `ADR-DB1-015` defers the seed program to DB9, which has not
shipped, so `APP4-G01` contributes the dataset and no new mechanism. The
publishing caller is `APP4-B01`'s bootstrap path; publishing requires an
`admin_accounts` row (`policy_configuration_versions.created_by_admin_id` is
`NOT NULL`), which the existing `staff-bootstrap` path already provides.

### 1.2 Naming

The prompt-level identifiers `verification.challenge.ttl_seconds`,
`secure_grant.standard.ttl_seconds`, `notification.delivery.max_attempts` and
`secure_link.resolve.max_requests_per_ip_per_minute` are preserved **in
semantics**; their spelling is adapted to the repository convention — a
dot-separated configuration key plus a camelCase field inside the JSONB value —
so `verification.challenge.ttl_seconds` is stored as key
`verification.challenge`, field `ttlSeconds`. Nothing else changes.

### 1.3 Verification challenge — key `verification.challenge`, value schema version 1

| Field | Value | Unit | Meaning |
|---|---|---|---|
| `ttlSeconds` | `600` | seconds | A challenge expires 10 minutes after issuance. |
| `codeLength` | `6` | digits | Exactly six characters. |
| `codeAlphabet` | `DECIMAL_DIGITS` | — | `0`–`9` only. |
| `maxAttempts` | `5` | attempts | At most five submitted answers per challenge. |
| `resendCooldownSeconds` | `60` | seconds | Minimum interval between business reissues for one target. |
| `rateWindowSeconds` | `900` | seconds | The issuance rate window is 15 minutes. |
| `maxIssuesPerTargetPerWindow` | `5` | issuances | At most five challenges per normalized target + purpose per window. |

Semantics:

1. The code is generated from a CSPRNG (`node:crypto.randomInt` or rejection
   sampling over `randomBytes`). **Modulo-biased selection is prohibited**: a
   `randomBytes(n) % 10` digit is measurably non-uniform, and a six-digit code
   has little enough entropy already.
2. Expiry is absolute from issuance and never extended by an attempt.
3. Attempt five is the last; the sixth submission is refused whatever it
   contains.
4. Rate refusal **must not disclose** whether the target already belongs to a
   customer. The refusal is identical for a known and an unknown contact.
5. A business resend issues a **new challenge, a new code and a new envelope**.
   It is not a notification transport retry (§8).

### 1.4 Secure grants — key `secure_grant`, value schema version 1

| Field | Value | Unit | Meaning |
|---|---|---|---|
| `standardTtlSeconds` | `604800` | seconds | Standard request-access grant validity: 7 days. |
| `stepUpWindowSeconds` | `900` | seconds | A recent successful `STEP_UP` verification counts for 15 minutes. |

Semantics: grant reissue **rotates the token** (a new opaque token, a new
digest); revoked, superseded and expired grants are never transport-replayed
(§10).

### 1.5 Notification delivery — key `notification.delivery`, value schema version 1

| Field | Value | Unit | Meaning |
|---|---|---|---|
| `maxAttempts` | `3` | attempts | Three automatic attempts, then terminal. |
| `retryDelaysSeconds` | `[60, 300]` | seconds | Delay after attempt 1, then after attempt 2. |

Semantics: attempt 1 is immediate; the retry after attempt 1 waits 60 seconds;
the retry after attempt 2 waits 300 seconds; attempt 3 is the final automatic
attempt; exhaustion is terminal failure and the outbox row becomes `DEAD_LETTER`
(`ADR-APP2-002` §D6). **There is no fourth automatic attempt.**

These are **policy inputs to the existing APP2 runtime**, not a replacement for
it. The array has `maxAttempts - 1` entries by construction, which is the
invariant a later consumer must validate.

### 1.6 Public secure-link resolve rate — key `secure_link.resolve`, value schema version 1

| Field | Value | Unit | Meaning |
|---|---|---|---|
| `maxRequestsPerIpPerMinute` | `30` | requests | Transport-abuse protection on the public resolve route. |

This is abuse protection only. It does not change the non-enumerating response
contract (§3) and **must not produce token-existence-specific behaviour** — the
limit counts requests, never outcomes.

## 2. Contact normalization and masking

### 2.1 Email normalization

1. Trim leading and trailing ASCII **and** Unicode whitespace.
2. Lowercase the complete address.
3. Apply **no** provider-specific transformation.
4. Do **not** remove dots.
5. Do **not** strip plus-tags.
6. Reject an invalid address through the project's existing validation
   mechanism (`packages/validation`).

Rules 3–5 are stated as prohibitions because the "helpful" version of each is a
silent identity merge: `a.b@gmail.com` and `ab@gmail.com` are one Google inbox
but two distinct customers under `ADR-DB2-001`, and deciding otherwise is a
product decision APP4 does not own.

### 2.2 Phone normalization

- The persisted and compared form is **E.164**.
- The default region when the input carries no explicit country code is
  **Vietnam (`VN`, `+84`)**.
- An explicit international country code is preserved as given.

No phone-parsing dependency exists in the repository today (checked: no
`libphonenumber-js`, `google-libphonenumber` or `awesome-phonenumber` in any
manifest or the lockfile). `APP4-P01` selects the implementation and **must not
add a second parser** if one has arrived by then. Dependency selection is not
this ADR's; the normalization rule is.

### 2.3 Recipient masking

`notification_intents.recipient_masked` receives the masked form. **The fully
normalized destination is never stored there** — that column exists so an
operator can recognise a recipient without the record becoming a contact
database.

**Email** — for `local@domain`: expose the first Unicode **code point** of the
local part, replace the remainder of the local part with `***`, preserve the
domain unchanged. Code point, not UTF-16 code unit: a leading astral character
must not be cut in half.

**Phone** — preserve the country code, reveal only the final **4** digits, mask
every intermediate national-number digit.

Masking is deterministic: the same input always produces the same mask.

## 3. Public non-enumeration contract

All six of these causes produce **one** externally identical answer:

1. unknown token;
2. expired grant;
3. revoked grant;
4. superseded grant;
5. wrong target;
6. wrong purpose / scope.

The answer is:

| Property | Value |
|---|---|
| HTTP status | `404` |
| Application error code | `SECURE_LINK_UNAVAILABLE` |
| Envelope | the standard API envelope (`APP0-B03`) |

The body, the status and the externally observable application error
classification are **identical** for all six. The internal reason is never
exposed to the public caller. Internal audit and metrics may retain a bounded,
non-secret reason class.

This follows the delivered `PUBLIC_DESIGN_TEMPLATE_NOT_FOUND` pattern (`APP3-B05`):
a business code owned by the feature, carried in the envelope, with the *shape of
the error file* being the non-disclosure rule. There is deliberately no
`…_EXPIRED`, no `…_REVOKED` and no `…_WRONG_TARGET`.

Rate-limit responses are governed by the existing platform rate-limit convention
and are **not** a token-validity oracle: a limit reached before any lookup cannot
report on a token it never read.

## 4. Route authority

| Surface | Route |
|---|---|
| Storefront — contact verification | `/xac-minh-lien-he` |
| Storefront — secure-link landing | `/truy-cap` |
| Admin — customer access support | `/support/customer-access` |

Checked at this checkpoint: the Storefront owns `/`, `/kham-pha`,
`/san-pham/[slug]` and `/healthz`; the Admin owns `/login`, `/healthz` and the
`(protected)` group `assets`, `products`, `design-templates`. **None of the three
APP4 routes collides with an existing locked route** (IMP-D038, IMP-D039), and no
existing authority claims them with other semantics.

`APP4-D01` must use these exact routes. **No APP5/APP6/APP7 business-action route
is created here.**

## 5. Opaque secret authority

### 5.1 Verification code

- Exactly 6 decimal digits, CSPRNG, unbiased (§1.3).
- Persisted **only** as a peppered HMAC-SHA-256 digest in
  `contact_verification_challenges.code_hash`.
- Verification compares digests in **constant time**.
- Plaintext may exist only in: the issuer's memory during issuance; the sealed
  delivery envelope (§6); the worker's memory after it has claimed the job; and
  the one outbound message. Nowhere else, ever (§6.6).

### 5.2 Secure-link token

- At least **256 bits** of CSPRNG entropy, encoded **base64url without padding**.
- Persisted **only** as a peppered HMAC-SHA-256 digest in
  `secure_access_grants.token_hash`.
- Constant-time digest comparison.

This mirrors the delivered `DesignSessionSecretIssuer` / `Verifier` pair
(IMP-D043): one digest implementation shared by issuance and verification, so
the two cannot drift.

### 5.3 Pepper configuration — separate from the AEAD key

The repository's convention is a runtime HMAC **pepper** per credential family
(`DESIGN_SESSION_SECRET_PEPPER`: environment variable, declared empty in
`.env.example`, minimum 32 characters, fail-closed at config load, no unpeppered
fallback). That convention is scoped to the Design Session credential, so APP4
follows its **shape** with its own names:

| Purpose | Configuration name | Minimum length |
|---|---|---|
| Verification code digest | `VERIFICATION_CODE_SECRET_PEPPER` | 32 characters |
| Secure-link token digest | `SECURE_LINK_TOKEN_SECRET_PEPPER` | 32 characters |

**Neither pepper may be the delivery-envelope encryption key, and the envelope
key may not be used as a pepper.** They are different primitives with different
rotation consequences: rotating a pepper invalidates every live digest; rotating
the envelope key makes every un-delivered envelope unopenable. Sharing one value
would couple two unrelated outages.

**No production secret value is committed** (`CLAUDE.md` §8a). Every name above
is declared with an empty value in `.env.example` and supplied through `.env` or
an approved secret channel.

## 6. Encrypted delivery envelope

### 6.1 Shared package boundary

| Property | Value |
|---|---|
| Workspace package | `@embroidery/notification-delivery` |
| Path | `packages/notification-delivery` |

**`APP4-B01` creates this package. `APP4-G01` does not.**

It is the single authority for the envelope schema and type, the envelope
version constant, the secret-kind discriminator, the AES-256-GCM seal/open pair,
key parsing and validation, and its own focused unit tests. `apps/api` **seals**
through it; `apps/worker` **opens** through it. **No app-to-app import. No
third-party crypto dependency.**

The package boundary is justified under `REPOSITORY_STRUCTURE.md` (a package
exists only for real cross-application reuse, with a clear owner, purpose and
consumer list): the owner is APP4 Notification, the purpose is the envelope
codec, and the consumers are exactly `apps/api` and `apps/worker`.

### 6.2 Encryption configuration

| Property | Value |
|---|---|
| Configuration name | `NOTIFICATION_DELIVERY_ENVELOPE_KEY` |
| Encoding | `base64` |
| Decoded size | exactly `32` bytes |
| Default / fallback | **none** |
| Absent or invalid at startup | **fail closed** |

Fail-closed applies to any runtime path that issues or delivers encrypted
envelopes. A process that cannot seal must not issue a secret it can never
deliver, and a process that cannot open must not claim a job it can never
complete.

The key and its decoded bytes are **never logged**, never echoed, never passed as
a command-line argument and never committed. `.env.example` declares the name
with an empty value.

### 6.3 Algorithm

**AES-256-GCM** from Node's standard `node:crypto`. No third-party crypto
package — none is needed, and a convenience dependency in the one place that
holds customer secrets is the wrong trade.

A **fresh cryptographically random 96-bit IV/nonce** is generated for every newly
sealed envelope and never reused. Authentication failure on open is **terminal
for that delivery attempt** and is recorded only as a bounded, safe
`error_class` — never the ciphertext, never a partial plaintext, never the key.

### 6.4 Wire shape

Envelope version **1**, carried in `outbox_events.payload_schema_version` and
also inside the envelope, written to `outbox_events.payload`.

The persisted outer envelope contains **only** safe metadata and encrypted bytes:

```text
version
algorithm
iv
ciphertext
authTag
```

Binary fields use **base64url**. The outer envelope carries **no plaintext
recipient, no code, no token and no rendered message**.

The encrypted plaintext contains the minimum delivery data and nothing else:

```text
secretKind
originNotificationIntentId
channel
normalizedRecipient
secret
issuedAt
expiresAt
```

`secretKind` is one of `VERIFICATION_CODE` or `SECURE_LINK_TOKEN`.

This is permitted without a schema change or a redaction conflict because
`ADR-DB4-004` rule 4 scopes redaction-by-construction to columns **6**
(`payment_provider_events.redacted_payload`) and **8**
(`notification_intents.params`) — **not** to column 4, `outbox_events.payload`.
Rule 1's version key is `payload_schema_version`, which the table already
carries; rule 5 (never query JSONB internals) is satisfied natively by
ciphertext; rule 8 assigns payload-format migration to versioned consumers.

The envelope is written to `outbox_events.payload` in the **same transaction** as
the business write, following the delivered no-dual-write pattern in
`apps/api/src/modules/asset/application/upload-transactions.service.ts`. Either
the challenge/grant row and its delivery envelope both commit, or neither does.

### 6.5 `originNotificationIntentId` is lineage-only

This is the rule that makes manual replay possible without re-sealing, and it is
the easiest one to get wrong:

- `originNotificationIntentId` inside the ciphertext is an **immutable lineage
  reference**. It is not the execution identity the worker updates.
- The **current** delivery intent is identified by the outbox event's non-secret
  aggregate linkage (§7).
- On the original delivery the two are the same value, which is exactly why a
  consumer can use the wrong one and never notice.
- On Admin manual replay the ciphertext is copied **byte-identically**, so
  `originNotificationIntentId` still names the original failed intent while the
  new outbox event's aggregate linkage names the **new replay intent**.

**The worker must use the outbox aggregate linkage as the current
notification-intent identity, and must never use `originNotificationIntentId` as
the mutable or current lifecycle target.** If it did, replay would have to
re-seal the envelope, which would require decrypting it in the API — the exact
thing the closure directive forbids.

### 6.6 Secret lifetime and forbidden sinks

Plaintext may exist in: issuer memory during issuance; the sealed envelope;
worker memory after a successful claim; and the one outbound message.

The decrypted secret is **never** written to any of:

- `notification_intents` (including `params`);
- `notification_delivery_attempts`;
- `background_job_attempts`;
- audit rows;
- application logs;
- error messages;
- completion reports.

The development recording adapter may expose the decrypted value **inside
dev/test process memory only**, as the controlled sink that focused integration
and E2E tests read. It writes no production table and no normal log.

## 7. Outbox linkage

| Property | Value |
|---|---|
| `aggregate_kind` | `NOTIFICATION_INTENT` |
| `aggregate_id` | the **current** `notification_intent.id` |

`APP4-B01` extends the existing application guard `OUTBOX_AGGREGATE_KINDS`
(`packages/persistence/src/platform/outbox-event-store.ts`) to allow
`NOTIFICATION_INTENT`. REL-104 is polymorphic and the column carries **no
CHECK**, so this is a write-time guard, exactly as `APP2-B03` added `PRODUCT`.
**No migration. No new column. No CHECK.**

**No query into encrypted JSON is permitted to locate the current intent.** The
linkage is a relational column precisely so the lookup never needs the key.

For a manual replay:

- the old dead-letter event stays linked to the old failed intent;
- the new replay outbox event is linked to the **new replay intent**;
- the replay event's ciphertext is **byte-identical** to the source event's.

## 8. Retry, replay and resend — three contracts, three names

These three words are not interchangeable in any APP4 document, comment,
identifier or report.

### 8.1 Automatic transport retry — owner `APP4-W01`

```text
same notification intent
same outbox event id
same encrypted envelope
same business secret
fresh worker attempt number
```

Nothing is minted. The hash already persisted is the one the customer must be
able to answer, so a retry that minted a new secret would invalidate the answer
the customer already holds.

### 8.2 Admin manual transport replay — owner `APP4-B08`

```text
origin FAILED intent remains terminal
origin DEAD_LETTER outbox row remains terminal
new PENDING notification intent
new PENDING outbox event id
byte-identical encrypted envelope
same business secret
fresh worker attempt budget
```

**The API never decrypts the envelope during replay.** It copies opaque bytes.

The old `DEAD_LETTER` row is never reset, reactivated or mutated — not by an
automatic path, not by an Admin path, not by an operator script. It is terminal
evidence, and `job_key` **is** the outbox event id
(`jobKey: guard.outboxEventId.toString()`), so reusing that identity would
collide with CST-049 `uq_background_job_attempts__kind_key_attempt` and destroy
`(job_kind, job_key, attempt_no)` monotonicity.

A **new** notification intent in `PENDING` is required rather than reopening the
terminal one, per locked `DB3_NOTIFICATION_LIFECYCLE_SPEC` §1 (`FAILED` is
terminal; there is no `FAILED→PENDING` transition) and §3 rule 2 ("manual resend
= **new intent** (audited), không reopen intent cũ"). It is also the only form
that functions: the retry budget derives from the attempt count over
`notification_delivery_attempts` for that intent, so a reopened intent would
re-enter delivery already at or beyond `notification.delivery.maxAttempts` and
terminal-fail on its first attempt.

### 8.3 Business resend / reissue — owners `APP4-B03`, `APP4-B05`

```text
new business secret
new challenge or reissued grant
new notification intent
new outbox event
new encrypted envelope
```

Subject to `verification.challenge.resendCooldownSeconds` and
`maxIssuesPerTargetPerWindow` (§1.3).

## 9. Manual replay idempotency

The replay `intent_key` is the **SHA-256 hex digest** of the canonical UTF-8
string:

```text
app4-manual-replay:v1:<originNotificationIntentId>:<deadLetterOutboxEventId>
```

The digest is **non-secret** — both inputs are internal identifiers, and the
value is a deduplication key, not a capability.

Consequences:

- duplicate or concurrent Admin replay decisions for the same terminal delivery
  collapse onto **one** replay intent through the existing `intent_key`
  uniqueness and idempotency behaviour (GRD-012 `notification.intent`,
  TR-NTF-01);
- a **different** terminal delivery event derives a different replay key, so two
  genuinely distinct failures are never conflated;
- **no new global idempotency framework is introduced.**

The deterministic key is **not** a substitute for transactional concurrency
safety: the replay transaction still uses the repository's existing
lock-and-guarded-write convention. The key makes a duplicate harmless; the lock
makes a race correct.

## 10. Replay eligibility and `REISSUE_REQUIRED`

Manual transport replay is forbidden when the secret it would re-deliver is no
longer usable.

**Verification** — forbidden if the source challenge is expired, completed,
invalidated, superseded, or otherwise no longer answerable.

**Secure grant** — forbidden if the source grant is expired, revoked,
superseded, or inactive.

| Property | Value |
|---|---|
| HTTP status | `409` |
| Application error code | `REISSUE_REQUIRED` |
| Envelope | the standard API envelope |

This is an **Admin-facing** conflict, so unlike §3 it may be specific: the
operator is authenticated and needs to know which action to take next.

The operator then uses the business path — verification → `APP4-B03` resend;
secure grant → `APP4-B05` authorized reissue.

**A plaintext secret is never reconstructed from a hash.** There is no operation,
anywhere in APP4, that turns a stored digest back into a code or a token.

## 11. Secure-link browser transport

The customer-visible form is:

```text
https://<storefront-origin>/truy-cap#t=<opaque-token>
```

Rules:

1. The token **never** appears in a server-visible path or query, and therefore
   never in server, gateway or proxy access logs.
2. The **fragment is the only** outbound browser carrier. It is not sent to the
   origin by any user agent.
3. `APP4-S02` reads `#t=` locally on mount.
4. It **immediately** removes the fragment with `history.replaceState`.
5. Fragment removal **must occur before** any analytics call, beacon,
   third-party script or unrelated client network activity on that route. An
   ordering bug here is a referrer leak, not a cosmetic defect.
6. The token is held only in an **ephemeral local variable**.
7. The token is sent in the **body** of `POST /public/secure-links/resolve`.
8. The token is **never** stored in: Zustand; TanStack Query cache data;
   `localStorage`; `sessionStorage`; cookies; persisted React/Next state;
   analytics events; logs.
9. The API **never** echoes it.

**No token-bearing query parameter or path segment may be introduced, and there
is no query-param fallback.**

### 11.1 Relationship to `09-SECURITY-AND-ABUSE-PREVENTION.md` §9

That document contains the sentence "never placed in a URL, query, fragment, …".
It is scoped explicitly to the **anonymous Design Session credential**
(`APP3-G03` / IMP-D043) — a cookie-borne credential with its own transport
ruling — and governs no other secret. It reads as absolute out of context, which
is why the scope is recorded here. §2 of the same document requires only that
secure links be unguessable and revocable/expiring; both hold.

For the secure-link token the absolute phrasing is **replaced** by the precise
four-part rule in §11 items 1–4.

## 12. Notification channel

APP4 remains provider-neutral.

| Contact kind | Channel |
|---|---|
| `EMAIL` | `EMAIL` |
| `PHONE` | `SMS` |

`APP4-G01` selects **no** SMTP vendor, email SaaS, SMS vendor, sender identity or
production credential. `NotificationChannelPort` and the recording development
adapter remain the APP4 delivery boundary. Concrete provider selection stays
deferred to the already-recorded production due condition (`IMP-O006` /
`APP4-PO-001`).

## 13. Queue authority

The outbox runtime delivered by APP2 (`ADR-APP2-002` / IMP-D029) is the **only**
worker queue. `outbox_events` *is* the queue; `background_job_attempts` is the
attempt ledger; claim is `FOR UPDATE SKIP LOCKED` on IDX-088.

`NotificationIntentRepository.claimBatch` — built by DB7 before IMP-D029 existed
— has **no production caller** and gains none. The same supersession is already
recorded for the DB7 `OutboxEventStore` in
`packages/persistence/src/platform/worker-job-queue.repository.ts`. APP4 adds no
second queue, scheduler, poller or sweep.

## 14. Canonical fact table

Every fact below is machine-checked by `node tools/check-app4-g01.mjs`. This
table is the authority; prose above explains it and the completion report cites
it, but neither restates it.

### 14.1 Facts

| Key | Value |
|---|---|
| `verification.challenge.ttlSeconds` | `600` |
| `verification.challenge.codeLength` | `6` |
| `verification.challenge.codeAlphabet` | `DECIMAL_DIGITS` |
| `verification.challenge.maxAttempts` | `5` |
| `verification.challenge.resendCooldownSeconds` | `60` |
| `verification.challenge.rateWindowSeconds` | `900` |
| `verification.challenge.maxIssuesPerTargetPerWindow` | `5` |
| `verification.code.generation` | `CSPRNG_UNBIASED` |
| `verification.code.digest` | `PEPPERED_HMAC_SHA256` |
| `verification.code.comparison` | `CONSTANT_TIME` |
| `verification.rateRefusal.disclosesCustomerExistence` | `NO` |
| `secure_grant.standardTtlSeconds` | `604800` |
| `secure_grant.stepUpWindowSeconds` | `900` |
| `secure_grant.reissue.rotatesToken` | `YES` |
| `notification.delivery.maxAttempts` | `3` |
| `notification.delivery.retryDelaysSeconds` | `[60, 300]` |
| `notification.delivery.exhaustedOutboxStatus` | `DEAD_LETTER` |
| `secure_link.resolve.maxRequestsPerIpPerMinute` | `30` |
| `contact.email.normalization` | `TRIM_THEN_LOWERCASE_WHOLE_ADDRESS` |
| `contact.email.providerSpecificRules` | `NONE` |
| `contact.email.dotsRemoved` | `NO` |
| `contact.email.plusTagStripped` | `NO` |
| `contact.phone.normalization` | `E164` |
| `contact.phone.defaultRegion` | `VN` |
| `contact.phone.defaultCountryCode` | `+84` |
| `contact.email.mask` | `FIRST_CODE_POINT_THEN_STARS_AT_DOMAIN` |
| `contact.phone.mask` | `COUNTRY_CODE_PLUS_LAST_4_DIGITS` |
| `contact.mask.storesNormalizedDestination` | `NO` |
| `secure_link.unavailable.status` | `404` |
| `secure_link.unavailable.code` | `SECURE_LINK_UNAVAILABLE` |
| `secure_link.unavailable.indistinguishableCauses` | `6` |
| `route.storefront.verification` | `/xac-minh-lien-he` |
| `route.storefront.secureLinkLanding` | `/truy-cap` |
| `route.admin.customerAccessSupport` | `/support/customer-access` |
| `secure_link.token.entropyBits` | `256` |
| `secure_link.token.encoding` | `BASE64URL_UNPADDED` |
| `secure_link.token.digest` | `PEPPERED_HMAC_SHA256` |
| `pepper.verification.configName` | `VERIFICATION_CODE_SECRET_PEPPER` |
| `pepper.secureLink.configName` | `SECURE_LINK_TOKEN_SECRET_PEPPER` |
| `pepper.reusesEnvelopeKey` | `NO` |
| `envelope.package` | `@embroidery/notification-delivery` |
| `envelope.packagePath` | `packages/notification-delivery` |
| `envelope.createdBy` | `APP4-B01` |
| `envelope.version` | `1` |
| `envelope.algorithm` | `AES-256-GCM` |
| `envelope.cryptoSource` | `node:crypto` |
| `envelope.thirdPartyCryptoDependency` | `NONE` |
| `envelope.ivBits` | `96` |
| `envelope.ivReused` | `NO` |
| `envelope.binaryEncoding` | `BASE64URL` |
| `envelope.key.configName` | `NOTIFICATION_DELIVERY_ENVELOPE_KEY` |
| `envelope.key.encoding` | `BASE64` |
| `envelope.key.decodedBytes` | `32` |
| `envelope.key.fallback` | `NONE` |
| `envelope.key.whenAbsent` | `FAIL_CLOSED` |
| `envelope.key.separateFromHashPeppers` | `YES` |
| `envelope.persistedColumn` | `outbox_events.payload` |
| `envelope.forbiddenColumn` | `notification_intents.params` |
| `envelope.secretKinds` | `VERIFICATION_CODE, SECURE_LINK_TOKEN` |
| `envelope.authFailure` | `TERMINAL_FOR_THAT_ATTEMPT` |
| `envelope.originNotificationIntentId.role` | `LINEAGE_ONLY` |
| `outbox.aggregateKind` | `NOTIFICATION_INTENT` |
| `outbox.aggregateId` | `current notification_intent.id` |
| `outbox.currentIntentIdentity` | `AGGREGATE_LINKAGE` |
| `outbox.linkage.migration` | `NONE` |
| `outbox.linkage.ciphertextQueried` | `NO` |
| `delivery.automaticRetry.owner` | `APP4-W01` |
| `delivery.automaticRetry.outboxEvent` | `SAME` |
| `delivery.automaticRetry.envelope` | `SAME` |
| `delivery.automaticRetry.secret` | `SAME` |
| `delivery.manualReplay.owner` | `APP4-B08` |
| `delivery.manualReplay.originIntent` | `REMAINS_FAILED_TERMINAL` |
| `delivery.manualReplay.originOutboxEvent` | `REMAINS_DEAD_LETTER_TERMINAL` |
| `delivery.manualReplay.newIntentStatus` | `PENDING` |
| `delivery.manualReplay.newOutboxEventStatus` | `PENDING` |
| `delivery.manualReplay.ciphertext` | `BYTE_IDENTICAL` |
| `delivery.manualReplay.apiDecrypts` | `NEVER` |
| `delivery.manualReplay.intentKeyDigest` | `SHA-256_HEX` |
| `delivery.manualReplay.intentKeyInput` | `app4-manual-replay:v1:<originNotificationIntentId>:<deadLetterOutboxEventId>` |
| `delivery.manualReplay.newIdempotencyFramework` | `NONE` |
| `delivery.manualReplay.refusalStatus` | `409` |
| `delivery.manualReplay.refusalCode` | `REISSUE_REQUIRED` |
| `delivery.manualReplay.reconstructsPlaintext` | `NEVER` |
| `delivery.businessResend.owner` | `APP4-B03, APP4-B05` |
| `delivery.businessResend.secret` | `NEW` |
| `delivery.businessResend.envelope` | `NEW` |
| `secure_link.transport` | `URL_FRAGMENT` |
| `secure_link.fragmentParameter` | `#t=` |
| `secure_link.landingUrlForm` | `https://<storefront-origin>/truy-cap#t=<opaque-token>` |
| `secure_link.queryOrPathCarrier` | `FORBIDDEN` |
| `secure_link.fragmentStripApi` | `history.replaceState` |
| `secure_link.fragmentStripOrdering` | `BEFORE_ANY_ANALYTICS_OR_THIRD_PARTY` |
| `secure_link.resolveOperation` | `POST /public/secure-links/resolve` |
| `secure_link.tokenClientStorage` | `NONE` |
| `notification.channel.emailContact` | `EMAIL` |
| `notification.channel.phoneContact` | `SMS` |
| `notification.provider` | `NONE_SELECTED` |
| `notification.deliveryBoundary` | `NotificationChannelPort` |
| `notification.devAdapter` | `RECORDING` |
| `queue.authority` | `APP2_OUTBOX_RUNTIME` |
| `queue.notificationIntentClaimBatch` | `NO_PRODUCTION_CALLER` |
| `queue.additionalQueue` | `NONE` |
| `app4.migration` | `NO_APP4_MIGRATION` |

## Consequences

**Positive**

- Every value `APP4-D01` through `APP4-X01` needs is readable from configuration
  or from this table, and the gate fails if one goes missing or changes.
- The three delivery contracts have three names and three fact groups, so a
  later checkpoint cannot quietly implement a "retry" that mints a new secret.
- The lineage-versus-current-intent distinction is stated where a consumer will
  look for it, rather than being rediscovered when replay first breaks.
- Nothing here requires a schema change, a migration, a dependency or a provider.

**Negative / accepted**

- Twelve policy values are locked without production traffic to calibrate them.
  Accepted because every one is a versioned configuration append, not a
  migration, and the conservative direction was chosen in each case.
- The seed dataset ships without a seed runner (DB9's deferred deliverable), so
  `APP4-B01` carries the publishing call. Recorded as a known seam rather than
  solved by inventing a runner here.
- No phone-parsing dependency is selected, so `APP4-P01` still has that choice to
  make under the rule locked in §2.2.

## References

- `docs/implementation/audits/APP4_PHASE_ENTRY_AUDIT.md` §C.5, §C.7, §C.8, §F
- `ADR-DB3-004` — secure grant and re-verification (CON-144 deferrals)
- `ADR-DB4-004` — JSONB boundaries (rules 1, 4, 5, 8)
- `ADR-APP2-002` — asynchronous job runtime (§D3, §D6, §D7, §D15)
- `docs/database/DB3_NOTIFICATION_LIFECYCLE_SPEC.md` §1, §3 rule 2
- `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §2, §9, §9a
- `packages/persistence/src/platform/outbox-event-store.ts` — `OUTBOX_AGGREGATE_KINDS`
- `packages/persistence/src/platform/policy-configuration.repository.ts`
- `apps/api/src/modules/design/infrastructure/crypto/design-session-secret.issuer.ts`
- `apps/worker/src/runtime/policy/worker-runtime-policy.ts` — the policy-key precedent
