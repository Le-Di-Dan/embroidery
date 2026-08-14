# `APP4-P01` — Completion Report

**Checkpoint:** `APP4-P01` — Contact normalization, masking and opaque-secret primitives
**Date:** 2026-08-14 · **Branch:** `production`

---

## A. Verdict

**`PASS`**

Seven primitives, one canonical implementation each, all pure and dependency-free
beyond `node:crypto`. No stop condition was met — in particular **no third-party
dependency was added**, so §20.1 did not trigger.

---

## B. Entry state

| Fact | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `371c9ee2fa358763f18ca1761c93315c542f92e8` |
| Entry working tree | clean |
| `APP4-P00` | `PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE` |
| `APP4-G01` | `PASS` (`IMP-D049` / `ADR-APP4-001`) |
| `APP4-D01` | `PASS`; its 48 registry rows remain `REVIEW_REQUIRED` |
| Figma dependency | none — P01 renders nothing |

---

## C. Existing implementation reuse audit

| Looked for | Found | Decision |
|---|---|---|
| Phone parser (`libphonenumber-js`, `google-libphonenumber`, `awesome-phonenumber`) | **none** — no manifest, no lockfile entry | Implemented the narrowest correct solution; **no dependency added** (§C.1) |
| Email helper / validation | `packages/validation` is an **approved but empty** package boundary (`export {}`); no email normalization anywhere in `apps/api` | Implemented locally rather than founding a second application-wide validation framework |
| Opaque-secret issuer pattern | `DesignSessionSecretIssuer` — 32 CSPRNG bytes, unpadded base64url, injectable `RandomBytesSource` | **Pattern reused verbatim**: same entropy, same encoding, same 43-character accepted form, same test seam |
| Digest + constant-time verify | `DesignSessionSecretVerifier` — `createHmac('sha256', pepper)`, base64, `fixedWidthEquals` folding both sides to 32 bytes before `timingSafeEqual` | **Technique reused; code written locally** (§C.2) |
| Secret configuration | `design-session-auth.config.ts` — env name constant, `MIN_PEPPER_LENGTH = 32`, fail-closed, error names the variable only | **Shape reused**, extended with three separation checks |
| Contact kind | `ContactKind` from `@embroidery/database`, already imported by the customer domain repositories | Reused; no local re-declaration |
| Digest column type | `code_hash` / `token_hash` are `text`, like `design_sessions.session_secret_hash` | Base64 digest, matching the delivered convention |

### C.1 Why no dependency, and what that costs

Full E.164 correctness across every national numbering plan is what a phone
library exists for. What APP4 actually locked is narrower: **E.164 output,
Vietnam as the default region, an explicit country code always wins.** That is
implementable exactly, and it is what `normalize-phone.ts` implements.

What is enforced: `+`, a non-zero leading digit, 2–15 digits (ITU-T E.164
§6.2.1), the VN trunk-zero rule, and `00` as an international prefix.

What is **not** enforced: national-numbering-plan validity. A well-formed but
unassigned number passes. The limitation is recorded in the file header rather
than hidden, because the failure direction is benign — such a number simply
never receives its code, whereas over-strict validation would reject real
customers at the door. Adopting a library remains available to a later
checkpoint as a dependency decision, and it would slot in behind the same
function signature.

### C.2 Why the digest is local rather than imported

`fixedWidthEquals` already exists in
`apps/api/src/modules/design/infrastructure/crypto/design-session-secret.verifier.ts`.
It was **not** imported. Reaching from the customer module into another module's
crypto is a boundary this repository does not open, and CLAUDE.md §5 places code
at the narrowest valid scope. If the two genuinely needed to share, the answer
would be a package — which is out of P01's scope and would be the wrong trade for
twelve lines. The duplication is deliberate and noted in the file.

---

## D. Files / exports

### Domain — contact (`apps/api/src/modules/customer/domain/contact/`)

| File | Exports |
|---|---|
| `contact-value.ts` | `ContactNormalization`, `NormalizedContact`, `ContactRejectionReason`, `CONTACT_REJECTION_REASONS`, `accepted`, `rejected` |
| `normalize-email.ts` | `normalizeEmail`, `EMAIL_MAX_LENGTH` |
| `normalize-phone.ts` | `normalizePhone`, `DEFAULT_PHONE_REGION`, `VN_COUNTRY_CODE` |
| `mask-contact.ts` | `maskContact`, `MASK_RUN`, `PHONE_VISIBLE_DIGITS`, `PHONE_MASK_GLYPH` |

### Domain — secret (`apps/api/src/modules/customer/domain/secret/`)

| File | Exports |
|---|---|
| `app4-secret-digest.ts` | `digestSecret`, `verifySecretDigest`, `fixedWidthEquals` |
| `verification-code.issuer.ts` | `issueVerificationCode`, `VERIFICATION_CODE_LENGTH`, `REJECTION_THRESHOLD`, `RandomBytesSource` |
| `secure-link-token.issuer.ts` | `issueSecureLinkToken`, `isWellFormedSecureLinkToken`, `SECURE_LINK_TOKEN_BYTES`, `SECURE_LINK_TOKEN_LENGTH` |

### Config (`apps/api/src/modules/customer/config/`)

| File | Exports |
|---|---|
| `app4-secret-pepper.config.ts` | `loadApp4SecretPepperConfig`, `App4SecretPepperConfig`, `APP4_SECRET_PEPPER_CONFIG`, `VERIFICATION_CODE_PEPPER_ENV`, `SECURE_LINK_TOKEN_PEPPER_ENV`, `MIN_PEPPER_LENGTH` |

**Placement note.** §12 recommended `customer/domain/secret/`; the config loader
sits in `customer/config/` instead, mirroring `design/config/design-session-auth.config.ts`.
Every primitive is a **plain exported function** taking the pepper as an
argument — no `@Injectable`, no DI, no module wiring. That keeps the digest
trivially testable, keeps `CustomerModule` untouched, and leaves the wiring
decision to `APP4-B01`, which is the checkpoint that will actually have a
consumer.

---

## E. Normalization evidence

**Email** — `trim()` then `toLowerCase()` on the complete address, and nothing
else. `String.prototype.trim` is sufficient for the Unicode requirement: the
ECMAScript `WhiteSpace` production already covers `Zs`, `NBSP` and `ZWNBSP`.

Explicitly **not** done, each tested as a prohibition: plus-tag stripping, dot
removal, Gmail/Googlemail canonicalization, domain guessing, internal-whitespace
rewriting. Each would merge two `customer_contact_points` identities under the
CST-005 partial unique — one inbox at one provider, but two distinct customers
under `ADR-DB2-001`.

Structural validation only: one `@`, a non-empty local part free of whitespace
and RFC 5322 special characters, a dotted domain with an alphabetic TLD, ≤ 254
octets total, ≤ 64 local, ≤ 255 domain. It proves shape, never deliverability —
which is what the verification challenge itself establishes.

**Phone** — E.164 output, `DEFAULT_PHONE_REGION = 'VN'`, `VN_COUNTRY_CODE = '84'`.

| Input | Result |
|---|---|
| `0912345678` | `+84912345678` (trunk zero dropped) |
| `0912 345 678`, `091-234-5678`, `(091) 234 5678` | `+84912345678` |
| `+84912345678` | unchanged |
| `+14155550123`, `+442071838750` | country code preserved |
| `0014155550123` | `+14155550123` — `00` is an explicit country code and wins over the default region |
| `abc`, `++84…`, `84+912…`, `+0912…`, `+8`, 16+ digits | `INVALID_FORMAT` |

Both functions return a result union rather than throwing: a malformed contact is
an ordinary outcome of a public form, and the caller rendering a field error
should not have to catch. Both return `normalized` (identity) and `display` (the
trimmed as-entered copy) because `customer_contact_points` stores both.

---

## F. Masking evidence

**Email** — first Unicode **code point** of the local part, `***`, then the
normalized domain. `Array.from` iterates code points, so an astral first
character (emoji, rare CJK extension) is revealed whole rather than as an
unpaired surrogate — the defect index-slicing would produce, visible as a broken
glyph in every Admin table. A one-code-point local part is safe by construction:
`a@vidu.com` → `a***@vidu.com`, still different from its input.

**Phone** — country code, a masked middle, the final four digits:
`+84912345678` → `+84 ***** 5678`.

Splitting the country code from the national number normally needs a full ITU
table, which this repository does not have. The rule used is the E.164 zone
structure: zones **1** and **7** are single-digit codes, everything else is
treated as two digits. That is exact for `+84` — the only code this product
issues by default — and for every other one- and two-digit code. For a
three-digit code it reveals one digit **fewer** than the true country code, and
that direction is the safe one: the missing digit falls into the masked middle,
so the mask can under-disclose but never over-disclose. A table-driven split
replaces it the day a phone library arrives, with no contract change.

Both maskers take the **normalized** value, not the display copy: masking the
as-entered form would leak the customer's casing and spacing, and two spellings
of one address would produce two masks for one identity. Unmaskable input
(missing `@`, no `+`, too few digits) returns `***` — withhold everything rather
than pass an unrecognised value through.

Masking is deterministic and one-way, and tests assert that masked output never
equals its input for any case.

**Glyph note.** The masked middle uses `*` per the directive's stated preference,
since no masking convention predated this checkpoint. The `APP4-D01` frames draw
`•`; that is a mock-up choice, not implementation authority. `PHONE_MASK_GLYPH`
is a named export so aligning them later is one line.

---

## G. Secret-generation evidence

**Verification code** — exactly six decimal digits, CSPRNG, **unbiased by
rejection sampling**. A byte is uniform over 0–255 and 256 is not a multiple of
10, so a bare `% 10` makes digits 0–5 appear 26 times per 256 draws and digits
6–9 only 25 — roughly 4% more likely each, in a space of only 10^6.
`REJECTION_THRESHOLD = 250` (25 × 10) discards bytes 250–255 entirely; nothing is
approximated and no arithmetic correction is applied.

The result is a **string**, because `042915` as a number renders `42915` and would
fail verification against its own digest. A bounded round budget makes an
all-rejecting source terminate with a thrown error instead of hanging, and
failing closed is correct there — a short or padded code is a credential the
verifier cannot match.

**Secure-link token** — 32 CSPRNG bytes (256 bits), unpadded base64url, exactly
43 characters, matching `DesignSessionSecretIssuer` so the two opaque-credential
families behave identically. base64url matters twice: the token's only transport
is a URL fragment, so an encoding emitting `+`, `/` or `=` would need
percent-escaping and round-trip differently depending on who unescaped it. The
source's output length is checked rather than trusted — a seam returning a short
buffer would mint a weak-but-well-formed credential, the failure nobody notices.

No UUID, no timestamp-derived value, no determinism.

**No generated secret sample appears in this report, in any log, or in any
persisted record. P01 persists nothing.**

---

## H. Digest / config evidence

**Algorithm** — `HMAC-SHA-256`, pepper as the **key** (not a prefix:
`sha256(pepper + secret)` is length-extendable and is the wrong-looking-right
version), base64 output matching the `text` hash columns already in use.

**Comparison** — constant-time and length-safe. Both sides are folded through
SHA-256 to a fixed 32 bytes before `timingSafeEqual`, because `timingSafeEqual`
throws on a length mismatch and that throw would itself leak the stored digest's
length before any byte is compared. Every failure path returns `false` — wrong
secret, malformed digest, empty input — so a caller cannot distinguish "bad
shape" from "wrong value" by catching, and no thrown message can carry the raw
code or token.

**No password KDF.** A token is 256 bits of CSPRNG, so scrypt buys nothing and
costs a per-request delay. A six-digit code has far less entropy, but its
resistance comes from the five-attempt limit and ten-minute expiry
(`ADR-APP4-001` §1.3) — a KDF cannot rescue a 10^6 space an attacker gets five
guesses at.

**Pepper variables**, exactly as `APP4-G01` locked them:

```text
VERIFICATION_CODE_SECRET_PEPPER
SECURE_LINK_TOKEN_SECRET_PEPPER
```

Fail-closed on missing, blank, or shorter than `MIN_PEPPER_LENGTH = 32`.
Separation is **enforced, not merely documented** — three rejections:

1. the two peppers must differ from each other;
2. neither may equal `NOTIFICATION_DELIVERY_ENVELOPE_KEY` (an AEAD key — a
   different primitive whose rotation makes un-delivered envelopes unopenable,
   where a pepper rotation invalidates stored digests);
3. neither may equal `DESIGN_SESSION_SECRET_PEPPER`, whose credential family is
   `IMP-D043`'s.

Every error names the **variable** and nothing else — never the value, never its
length, never a fragment. A dedicated test asserts that across four failure
paths.

`.env.example` was **not modified**: `APP4-G01` already declared both names empty
and correctly.

---

## I. Test evidence

| Spec | Tests | Covers |
|---|---|---|
| `domain/contact/contact-normalization.spec.ts` | 54 | email trim/lowercase, plus-tag and dot preservation, no provider rewrite, display copy, 9 rejection cases, both length limits; phone VN national/formatted/E.164/IDD/international, display copy, 10 rejection cases; email masking incl. astral and single-code-point local parts; phone masking incl. zone-1/7 codes and too-short withholding |
| `domain/secret/app4-secret.spec.ts` | 27 | six decimal digits, leading zero, rejection of bytes 250–255, remainder mapping, threshold identity, fail-closed budget, no `Math.random`; token charset/length/entropy/non-determinism/byte round-trip/short-source refusal/accepted form; digest determinism and pepper- and secret-sensitivity, verify true/false paths, malformed-digest safety, unequal-length comparison, two end-to-end issue→digest→verify flows |
| `config/app4-secret-pepper.config.spec.ts` | 13 | both peppers loaded and distinct, missing/blank/short fail-closed for each, exact-minimum accepted, shared-value rejection, both foreign-key collisions, unset foreign ignored, and no secret value in any error message |

**Total: 94 tests, 3 suites, all passing.**

Unbiasedness is proven **structurally** — an exact byte script through the
injected seam, asserting which bytes are rejected — not statistically. A
distribution test over millions of draws would be slow, flaky, and would only
measure what the rejection rule guarantees by construction. Every pepper and
secret in the tests is synthetic.

---

## J. Validation ledger

| # | Command | Why | Result | Rerun? |
|---|---|---|---|---|
| 1 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="modules/customer/(domain\|config)" --testPathIgnorePatterns="/node_modules/\|integration"` | The focused proof of the seven primitives. Pattern-scoped to the two new directories; the customer module's integration specs are excluded by name, so no database is touched. | **PASS** — 94/94 | Yes, twice. See J.1 |
| 2 | `pnpm --filter @embroidery/api exec tsc --noEmit` | Smallest available compile proof covering `apps/api`; workspace-scoped, not repository-wide. | **PASS** — exit 0 | No. See J.1 |
| 3 | `pnpm exec prettier --check <3 new directories>` | New TypeScript that Prettier owns. Explicit paths only. | **PASS** | Yes, once, after command 4 fixed what it reported |
| 4 | `pnpm exec prettier --write <3 files>` | The fix for what command 3 reported. | applied | No |
| 5 | `pnpm --filter @embroidery/api exec eslint src/modules/customer/{config,domain/contact,domain/secret}` | Workspace-filtered lint over exactly the new paths — the API workspace owns an ESLint config, unlike `tools/`. | **PASS** — no output | Yes, once, after the reformat changed covered files |
| 6 | `node tools/check-report-secrets.mjs` | P01 discusses pepper variable **names** and crypto behaviour; the gate proves no value was published and no secret-bearing file became tracked. Run once after the final report edit, with everything staged so `git ls-files` can see it. | **PASS** — 451 documents, 2707 tracked files | No |
| 7 | `git diff --cached --check` | Whitespace and conflict-marker safety on the staged change. | clean | No |

```text
No full regression/test chain was run.
```

Not run, and why: the full API Jest suite (the focused pattern already proves the
changed primitives, and nothing else imports them yet); API/worker integration
and DB suites (P01 touches no persistence); frontend tests and Playwright (no
UI); OpenAPI and API-client generation/check (no HTTP surface); DB manifest and
migrations (no schema); app builds (the workspace typecheck is the smaller
compile proof and it passed); `check-app4-g01.mjs` (none of its inputs changed —
re-running it is the reassurance repeat §17 forbids); the Figma checker; SonarQube;
`pnpm quality`; any aggregate chain.

### J.1 Reruns, and what changed before each

- **Command 1** ran three times. The first run failed **three assertions, all of
  them wrong tests rather than wrong code** — see J.2. The second run passed. The
  third followed command 4, which reformatted `normalize-phone.ts`; a source file
  under test had changed, so re-running was required rather than optional.
- **Command 2 was not rerun** after the reformat. Prettier is AST-preserving —
  it changed line breaks in a function signature and nothing else — so it cannot
  introduce a type error, and `ts-jest` recompiled the same files in command 1's
  third run anyway. Re-running would have been the reassurance repeat §17 forbids.
- **Commands 3 and 5** each ran twice: once before the reformat, once after the
  files they cover changed.

### J.2 The three first-run failures were mine, in the tests

Recorded because the distinction matters: no primitive was changed to make a test
pass.

1. `'0091234567'` was asserted to normalize to `+8491234567`, on the assumption
   it was a national number with a doubled trunk zero. The implementation reads
   the leading `00` as the international prefix — which is correct, because a
   Vietnamese national number never begins `00`. The test was replaced with one
   that pins the real distinction (trunk zero vs IDD prefix); the code was
   untouched.
2. `'()-  '` was asserted to reject as `EMPTY`. It trims to `()-`, which is
   non-empty, and only becomes empty after formatting characters are stripped —
   so `INVALID_FORMAT` is the accurate reason. Expectation corrected.
3. `expect(Number('012345')).not.toBe(12345)` was simply a broken assertion —
   `Number('012345')` **is** `12345`. Replaced with
   `expect(String(Number('012345'))).not.toBe('012345')`, which states the point
   it was reaching for: a numeric round-trip loses the leading zero, which is why
   the issuer returns a string.

---

## K. Files changed

**Created (12)**

Runtime source (8):

- `apps/api/src/modules/customer/domain/contact/contact-value.ts`
- `apps/api/src/modules/customer/domain/contact/normalize-email.ts`
- `apps/api/src/modules/customer/domain/contact/normalize-phone.ts`
- `apps/api/src/modules/customer/domain/contact/mask-contact.ts`
- `apps/api/src/modules/customer/domain/secret/app4-secret-digest.ts`
- `apps/api/src/modules/customer/domain/secret/verification-code.issuer.ts`
- `apps/api/src/modules/customer/domain/secret/secure-link-token.issuer.ts`
- `apps/api/src/modules/customer/config/app4-secret-pepper.config.ts`

Tests (3):

- `apps/api/src/modules/customer/domain/contact/contact-normalization.spec.ts`
- `apps/api/src/modules/customer/domain/secret/app4-secret.spec.ts`
- `apps/api/src/modules/customer/config/app4-secret-pepper.config.spec.ts`

Report (1):

- `docs/implementation/reports/APP4-P01-COMPLETION-REPORT.md`

**Modified: none.**

No existing file was touched — not `CustomerModule`, not `AppModule`, not
`.env.example`, not the ADR, not `package.json`, not the lockfile. No schema, no
migration, no OpenAPI artifact, no generated client, no worker, no UI, no new
workspace package, no `tools/check-*` file.

### K.1 File sizes

Largest source file 117 lines, largest test 196 — both well inside the 400/600
limits, with no file near the 300/500 review thresholds.

---

## L. Git evidence

| Item | Value |
|---|---|
| Branch | `production` |
| Entry HEAD | `371c9ee2fa358763f18ca1761c93315c542f92e8` |
| Commit | `2e09bf9069768530837d3fdd6fea0ee9e65c1de2` |
| Subject | `feat(app4): add APP4 contact normalization, masking and opaque-secret primitives` |
| Evidence commit | `docs(app4): record APP4-P01 commit evidence` — substitutes the hash above and changes nothing else |
| Final HEAD | the evidence commit, the second and last of the two |
| Working tree after both commits | clean |
| Pushed | **no** |

A commit cannot contain its own hash, so the implementation commit's hash is
written by the one-line evidence commit that follows it — the same two-step
`APP4-P00`, `APP4-G01` and `APP4-D01` used. Recover the final HEAD with
`git rev-parse HEAD`.

---

## M. Next checkpoint

**`APP4-B01`** — notification intent intake.

It is the correct next step: it creates `packages/notification-delivery`, extends
the `OUTBOX_AGGREGATE_KINDS` guard with `NOTIFICATION_INTENT`, and is the first
checkpoint with a real consumer for these primitives — which is also when the
DI wiring decision P01 deliberately deferred becomes concrete.

`APP4-B01` was **not** started here.

---

## N. Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Email normalization is trim + lowercase only | **MET** — §E |
| 2 | Provider-specific email rewrites absent | **MET** — tested as prohibitions |
| 3 | Phone normalization is E.164, default region `VN` | **MET** — §E |
| 4 | Existing suitable phone parser reused if present | **MET (vacuously)** — none exists; §C.1 |
| 5 | Email mask reveals only first code point + domain | **MET** — §F |
| 6 | Phone mask reveals only country code + final four | **MET** — §F |
| 7 | Masked output never equals full normalized input | **MET** — asserted for every case |
| 8 | Verification code is exactly six decimal digits | **MET** — §G |
| 9 | Code generation is CSPRNG and unbiased | **MET** — rejection sampling at 250 |
| 10 | Secure-link token ≥ 256 bits CSPRNG | **MET** — 32 bytes |
| 11 | Token is unpadded base64url | **MET** — 43 chars, charset asserted |
| 12 | Digest is peppered HMAC-SHA-256 | **MET** — §H |
| 13 | Verification is constant-time | **MET** — fold + `timingSafeEqual` |
| 14 | Malformed digest fails safely | **MET** — returns `false`, never throws |
| 15 | The two peppers are separate | **MET** — enforced, not just documented |
| 16 | Neither pepper reuses the envelope key | **MET** — rejected at load |
| 17 | Missing/weak peppers fail closed without disclosure | **MET** — §H |
| 18 | No raw code/token logged or persisted | **MET** — P01 has no I/O at all |
| 19 | No database/OpenAPI/worker/UI change | **MET** — §K |
| 20 | No new workspace package | **MET** — §K |
| 21 | Focused unit tests pass | **MET** — 94/94 |
| 22 | Validation is change-impact-only | **MET** — §J |
| 23 | No unnecessary successful rerun | **MET** — §J.1, incl. the typecheck deliberately not repeated |
| 24 | Report records exact Git evidence | **MET** — §L |
| 25 | Next checkpoint is `APP4-B01` | **MET** — §M |

---

## O. Stop conditions — all four checked, none met

| # | Stop condition | Finding |
|---|---|---|
| 1 | E.164 normalization requires a new dependency | **Not met.** The rule APP4 locked — E.164 output, VN default, explicit country code wins — is implementable exactly without one. Plan-level validation would need a library; it is not what the ADR requires, and its absence is recorded rather than silently patched. |
| 2 | A locked crypto authority contradicts HMAC-SHA-256 or constant-time verification | **Not met.** The only established convention is `IMP-D043`'s peppered HMAC-SHA-256 with a fixed-width constant-time compare — the same construction, which is why the pattern was reused rather than reconciled. |
| 3 | An existing customer-domain identity authority conflicts | **Not met.** `ADR-DB2-001` and `customer_contact_points` require lowercase email and E.164-style phone in `normalized_value` (CON-163/164) — exactly what these functions produce. The partial unique CST-005 is the reason the merge-avoiding prohibitions matter, not a conflict with them. |
| 4 | Configuration architecture cannot represent two dedicated peppers | **Not met.** `design-session-auth.config.ts` is a working precedent for an env-backed, fail-closed secret config with no platform change; P01 follows its shape and adds only separation checks. |
