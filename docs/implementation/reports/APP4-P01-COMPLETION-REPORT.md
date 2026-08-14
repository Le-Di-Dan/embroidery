# `APP4-P01` — Completion Report

**Checkpoint:** `APP4-P01` — Contact normalization, masking and opaque-secret primitives
**Date:** 2026-08-14 · **Branch:** `production`
**Correction:** `APP4-P01-C1` — exact international phone normalization and masking (2026-08-14)

---

## A. Verdict

**`PASS`** — after `APP4-P01-C1`.

Seven primitives, one canonical implementation each. Six are pure and depend on
nothing beyond `node:crypto`; the two phone primitives use `libphonenumber-js`,
authorized by `APP4-P01-C1`.

### A.1 What the correction fixed, and why the first verdict was wrong

The delivered phone masker guessed the country calling code from the E.164 zone —
one digit for zones 1 and 7, two digits for everything else. For a real
three-digit calling code (`+350`, `+371`, `+998`) that masked one digit **of the
country code itself**.

The P01 acceptance criterion is *"phone masking preserves the country code and
reveals only the final 4 national-number digits"*. A split that is usually right
does not satisfy it. §F of the first report **disclosed** the heuristic, argued
it under-disclosed rather than over-disclosed, and still claimed `PASS` — and
disclosure is not compliance. The criterion was violated on the checkpoint's own
evidence, which is exactly what made the correction mandatory rather than
optional.

`APP4-P01-C1` removed the heuristic outright rather than patching it. Nothing
else in P01 changed: email normalization, email masking, verification-code
generation, secure-link-token generation, the HMAC digest and the pepper
configuration are byte-identical to what the first delivery shipped.

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
| Phone parser (`libphonenumber-js`, `google-libphonenumber`, `awesome-phonenumber`) | **none at P01 entry** — no manifest, no lockfile entry | P01 hand-rolled a parser; `APP4-P01-C1` replaced it with `libphonenumber-js` (§C.1) |
| Email helper / validation | `packages/validation` is an **approved but empty** package boundary (`export {}`); no email normalization anywhere in `apps/api` | Implemented locally rather than founding a second application-wide validation framework |
| Opaque-secret issuer pattern | `DesignSessionSecretIssuer` — 32 CSPRNG bytes, unpadded base64url, injectable `RandomBytesSource` | **Pattern reused verbatim**: same entropy, same encoding, same 43-character accepted form, same test seam |
| Digest + constant-time verify | `DesignSessionSecretVerifier` — `createHmac('sha256', pepper)`, base64, `fixedWidthEquals` folding both sides to 32 bytes before `timingSafeEqual` | **Technique reused; code written locally** (§C.2) |
| Secret configuration | `design-session-auth.config.ts` — env name constant, `MIN_PEPPER_LENGTH = 32`, fail-closed, error names the variable only | **Shape reused**, extended with three separation checks |
| Contact kind | `ContactKind` from `@embroidery/database`, already imported by the customer domain repositories | Reused; no local re-declaration |
| Digest column type | `code_hash` / `token_hash` are `text`, like `design_sessions.session_secret_hash` | Base64 digest, matching the delivered convention |

### C.1 The phone dependency, and why P01's reasoning did not survive

**Added by `APP4-P01-C1`:** `libphonenumber-js@^1.13.10`, as a dependency of
`@embroidery/api` only. It is the **single** approved phone parser and is
authorized **only** for phone parsing, normalization and masking in the APP4
customer domain — not for email, not for a shared package, not for a new
validation framework, and with no network or carrier lookup.

P01's original reasoning was that the ADR's rule — E.164 output, Vietnam
default, explicit country code wins — is implementable exactly by hand, and that
only *national-plan* validity would need a library. That was true for
normalization and **false for masking**, which the reasoning did not account for:
"preserve the country code" requires knowing where the country code ends, and
that is precisely the ITU table a hand-rolled parser does not have. The
zone-based guess was the consequence.

**The narrowest import form is used.** The default `libphonenumber-js` entry
point carries the *min* metadata bundle, which supplies everything the correction
needs — parsing with a default country, canonical E.164 output, exact
`countryCallingCode`, exact `nationalNumber` and `isPossible()`. The larger `max`
and `mobile` bundles exist to support `isValid()` and number-type detection,
neither of which this product boundary uses.

**Validation level is possible-number, deliberately.** `isPossible()` rejects the
structurally impossible — wrong length for the country, no country code at all —
while accepting a well-formed number whose exact prefix allocation this product
has no business adjudicating. The verification challenge is what proves
deliverability. No carrier or network lookup is performed.

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
| `normalize-phone.ts` | `normalizePhone`, `parsePhone`, `DEFAULT_PHONE_REGION` |
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

**`parsePhone` is the single phone authority** (added by `APP4-P01-C1`).
`mask-contact.ts` imports it rather than parsing its own number, so there is one
answer to "where does the country code end" and the two primitives cannot drift.

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

**Phone** — canonical E.164 from `libphonenumber-js`, `DEFAULT_PHONE_REGION = 'VN'`.
The returned value is the library's own `parsed.number`, never a string this
module assembles: reconstructing it by hand is how the first version drifted.

| Input | Result |
|---|---|
| `0912345678` | `+84912345678` (Vietnam's trunk `0` stripped by the VN plan) |
| `0912 345 678`, `091-234-5678`, `(091) 234 5678`, `091–234–5678` | `+84912345678` |
| `+84912345678` | unchanged |
| `+14155550123`, `+442071838750`, `+35020012345`, `+37120123456`, `+998901234567` | country code preserved exactly |
| `0014155550123`, `0084912345678`, `00350 20012345` | `00` is Vietnam's IDD prefix, so an explicit country code supplied this way wins over the default region |
| `abc`, `++84…`, `84+912…`, `+0912…`, `+8`, over-long | `INVALID_FORMAT` |
| blank / whitespace | `EMPTY`; over 32 raw characters | `TOO_LONG` |

`VN_COUNTRY_CODE` was removed by the correction: it existed only to assemble the
E.164 string by hand, and nothing assembles one any more.

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

**Phone** — the **exact** country calling code, a masked national prefix, and the
final four national digits: `+84912345678` → `+84 ***** 5678`.

The split comes from `libphonenumber-js` through the same `parsePhone` the
normalizer uses, so normalization and masking cannot disagree about where a
country code ends. `countryCallingCode` and `nationalNumber` are the library's
exact values at **every** calling-code length:

| Normalized E.164 | Calling code | Masked output |
|---|---|---|
| `+14155550123` | `1` (1-digit) | `+1 ****** 0123` |
| `+79123456789` | `7` (1-digit) | `+7 ****** 6789` |
| `+84912345678` | `84` (2-digit) | `+84 ***** 5678` |
| `+442071838750` | `44` (2-digit) | `+44 ****** 8750` |
| `+35020012345` | `350` (3-digit) | `+350 **** 2345` |
| `+37120123456` | `371` (3-digit) | `+371 **** 3456` |
| `+998901234567` | `998` (3-digit) | `+998 ***** 4567` |

The visible digits are the last four of the **national number**, never of the
E.164 string — for a country whose national number is shorter than four digits
those are not the same thing, and taking them from the E.164 string could expose
part of the country code as if it were a national digit.

Both maskers take the **normalized** value, not the display copy: masking the
as-entered form would leak the customer's casing and spacing, and two spellings
of one address would produce two masks for one identity. The phone masker
enforces that contract with a strict E.164 shape check **before** parsing —
without it, `+84 912 345 678` and `84912345678` would both parse happily and
"pass the normalized value" would be advice rather than a contract.

Unmaskable input returns `***` — a missing `@`, a non-canonical phone string, an
unassigned calling code such as `+999…`, or a national number of four digits or
fewer. Withhold everything rather than pass an unrecognised value through.

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
| `domain/contact/contact-normalization.spec.ts` | **86** (54 → 86 at `APP4-P01-C1`) | email trim/lowercase, plus-tag and dot preservation, no provider rewrite, display copy, 9 rejection cases, both length limits; phone VN national/formatted/canonical, six explicit international codes, three `00` IDD forms, display copy, 10 rejection cases; email masking incl. astral and single-code-point local parts; **exact-country-code phone masking across all three calling-code lengths** (§I.1) |
| `domain/secret/app4-secret.spec.ts` | 27 | six decimal digits, leading zero, rejection of bytes 250–255, remainder mapping, threshold identity, fail-closed budget, no `Math.random`; token charset/length/entropy/non-determinism/byte round-trip/short-source refusal/accepted form; digest determinism and pepper- and secret-sensitivity, verify true/false paths, malformed-digest safety, unequal-length comparison, two end-to-end issue→digest→verify flows |
| `config/app4-secret-pepper.config.spec.ts` | 13 | both peppers loaded and distinct, missing/blank/short fail-closed for each, exact-minimum accepted, shared-value rejection, both foreign-key collisions, unset foreign ignored, and no secret value in any error message |

**Total: 126 tests, 3 suites, all passing** (94 at first delivery; the correction
added 32 phone cases and changed no secret or pepper test).

Unbiasedness is proven **structurally** — an exact byte script through the
injected seam, asserting which bytes are rejected — not statistically. A
distribution test over millions of draws would be slow, flaky, and would only
measure what the rejection rule guarantees by construction. Every pepper and
secret in the tests is synthetic.

### I.1 The correction's regression cases

Seven normalized numbers cover every calling-code length, with **three**
different three-digit codes so the implementation cannot pass by special-casing
one:

```text
+14155550123   cc 1     (US)   1-digit
+79123456789   cc 7     (RU)   1-digit
+84912345678   cc 84    (VN)   2-digit
+442071838750  cc 44    (GB)   2-digit
+35020012345   cc 350   (GI)   3-digit
+37120123456   cc 371   (LV)   3-digit
+998901234567  cc 998   (UZ)   3-digit
```

Each is asserted **programmatically against the parsed number**, never against a
hard-coded expected string — the expectations are derived from
`parsePhone(e164).countryCallingCode` and `.nationalNumber`, so a regression in
the split cannot be papered over by editing a literal:

1. the output starts with the exact `+<countryCallingCode>`;
2. the output ends with the exact final four digits of `nationalNumber`;
3. **every digit in the output is accounted for** — the digits-only projection of
   the mask equals exactly `countryCallingCode + last four`, which is the
   assertion that would have failed on the old heuristic for `+350`, `+371` and
   `+998`;
4. the masked prefix is exactly as long as the national digits it replaces;
5. the mask never equals the normalized value, with or without separators.

Plus the locked example verbatim (`+84912345678` → `+84 ***** 5678`), and four
fail-closed cases: non-canonical input, a well-shaped but unassigned calling code
(`+999…`), a national number of four digits or fewer, and the empty string.

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

### J.3 `APP4-P01-C1` validation — a separate, narrower pass

The P01 chain above was **not** restarted. Only what the correction touched was
re-run, each command once:

| # | Command | Why | Result |
|---|---|---|---|
| C1 | `pnpm --filter @embroidery/api add libphonenumber-js` | Adds the dependency the correction authorizes, through the normal pnpm workspace path. | added `^1.13.10`; `apps/api/package.json` + `pnpm-lock.yaml` updated. Run **once** |
| C2 | `pnpm --filter @embroidery/api exec jest --testPathPatterns="contact-normalization" …` | The only spec the correction changed. | **PASS** — 86/86 |
| C3 | `pnpm --filter @embroidery/api exec tsc --noEmit` | The changed files gained a third-party import and a new cross-file import; this is the smallest compile proof covering them. | **PASS** — exit 0 |
| C4 | `pnpm --filter @embroidery/api exec eslint src/modules/customer/domain/contact` | Scoped to the one changed directory. | **PASS** — no output |
| C5 | `pnpm exec prettier --check <contact dir> apps/api/package.json` | The changed code and the changed manifest. | **PASS** |
| C6 | `node tools/check-report-secrets.mjs` | Re-run because this report was edited after C1; the gate covers `docs/**` and tracked-file safety. | **PASS** |
| C7 | `git diff --cached --check` | Whitespace safety on the staged correction. | clean |

**Deliberately not re-run:** `app4-secret.spec.ts` and
`app4-secret-pepper.config.spec.ts`. The correction changed no file either one
imports, so re-running them would be the reassurance repeat the directive
forbids — and their pass state from the first delivery still describes the code
that is committed. Also not re-run: everything in the "not run" list above.

`pnpm-lock.yaml` is **not** Prettier-managed and was not reformatted.

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

**Modified by the first delivery: none.**

**Modified by `APP4-P01-C1` (4):**

- `apps/api/package.json` — adds `libphonenumber-js: ^1.13.10`
- `pnpm-lock.yaml` — the resolution for that one package
- `apps/api/src/modules/customer/domain/contact/normalize-phone.ts` — rewritten
  onto the library; hand-rolled parsing, the formatting-character class, the
  `00`-prefix handling and `VN_COUNTRY_CODE` all removed
- `apps/api/src/modules/customer/domain/contact/mask-contact.ts` — `maskPhone`
  rewritten onto the exact parsed split; the E.164-zone heuristic removed

Plus this report and its test file
(`domain/contact/contact-normalization.spec.ts`).

Across both the delivery and its correction, still untouched: `CustomerModule`,
`AppModule`, `.env.example`, the ADR, the design index, and every APP4 secret,
digest and pepper file. No schema, no migration, no OpenAPI artifact, no
generated client, no worker, no UI, no new workspace package, no `tools/check-*`
file.

### K.1 File sizes

Largest source file 119 lines (`mask-contact.ts`), largest test 240
(`contact-normalization.spec.ts`) — both well inside the 400/600 limits, with no
file near the 300/500 review thresholds.

---

## L. Git evidence

| Item | Value |
|---|---|
| Branch | `production` |
| P01 entry HEAD | `371c9ee2fa358763f18ca1761c93315c542f92e8` |
| P01 implementation | `2e09bf9069768530837d3fdd6fea0ee9e65c1de2` — `feat(app4): add APP4 contact normalization, masking and opaque-secret primitives` |
| P01 evidence | `5fd0fad3c3f9e3dcaac2b5da4a5ce887c2ffe9db` — `docs(app4): record APP4-P01 commit evidence` |
| **C1 entry HEAD** | `5fd0fad3c3f9e3dcaac2b5da4a5ce887c2ffe9db` |
| **C1 correction** | `__C1_COMMIT__` — `fix(app4): replace the phone country-code heuristic with exact libphonenumber-js parsing` |
| **C1 evidence** | `docs(app4): record APP4-P01-C1 commit evidence` — substitutes the hash above and changes nothing else |
| Final HEAD | the C1 evidence commit, the last of the four |
| Working tree after all commits | clean |
| Pushed | **no** |

A commit cannot contain its own hash, so each implementation commit's hash is
written by the one-line evidence commit that follows it — the same two-step
`APP4-P00`, `APP4-G01` and `APP4-D01` used. Recover the final HEAD with
`git rev-parse HEAD`.

The two P01 commits are **left in place**, not amended or rebased: the heuristic
and its correction are both part of the record, and rewriting history would erase
the reason `APP4-P01-C1` exists.

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
| 4 | Existing suitable phone parser reused if present | **MET** — none existed at entry; `APP4-P01-C1` authorized and added `libphonenumber-js`, §C.1 |
| 5 | Email mask reveals only first code point + domain | **MET** — §F |
| 6 | Phone mask reveals only country code + final four | **MET after `APP4-P01-C1`** — the exact parsed `countryCallingCode` at every length, §F and §I.1. **Not met at first delivery**, §A.1 |
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
| 21 | Focused unit tests pass | **MET** — 126/126 |
| 22 | Validation is change-impact-only | **MET** — §J, §J.3 |
| 23 | No unnecessary successful rerun | **MET** — §J.1 and §J.3, incl. the two secret specs deliberately not re-run |
| 24 | Report records exact Git evidence | **MET** — §L |
| 25 | Next checkpoint is `APP4-B01` | **MET** — §M |

### N.1 `APP4-P01-C1` acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | The phone heuristic is removed | **MET** — no zone rule remains in either file |
| 2 | `libphonenumber-js` is the single phone parser | **MET** — one `parsePhone`, imported by the masker |
| 3 | VN national input → canonical E.164 | **MET** — §E |
| 4 | Explicit international code wins over VN default | **MET** — six codes tested |
| 5 | `00` international prefix still supported | **MET** — three forms tested |
| 6 | Exact **1-digit** calling code preserved | **MET** — `+1`, `+7` |
| 7 | Exact **2-digit** calling code preserved | **MET** — `+84`, `+44` |
| 8 | Exact **3-digit** calling code preserved | **MET** — `+350`, `+371`, `+998` |
| 9 | Only the final four national digits visible | **MET** — digits-only projection asserted |
| 10 | No earlier national digit leaks | **MET** — same assertion |
| 11 | Malformed phone masking fails closed | **MET** — four cases |
| 12 | No email/secret/crypto behaviour changed | **MET** — those files untouched, §K |
| 13 | No schema/OpenAPI/worker/UI change | **MET** — §K |
| 14 | Focused phone tests pass | **MET** — 86/86 |
| 15 | API typecheck passes | **MET** — exit 0 |
| 16 | Validation is change-impact-only | **MET** — §J.3 |
| 17 | Report no longer claims the heuristic satisfies the contract | **MET** — §A.1, §C.1, §F rewritten |
| 18 | Final working tree clean | **MET** — §L |
| 19 | Nothing pushed | **MET** — §L |
| 20 | Next checkpoint remains `APP4-B01` | **MET** — §M |

---

## O. Stop conditions — all four checked, none met

| # | Stop condition | Finding |
|---|---|---|
| 1 | E.164 normalization requires a new dependency | **Not met at P01** — under the reading that only *normalization* was at stake, which is where the analysis stopped short. Superseded by `APP4-P01-C1`, which authorized `libphonenumber-js` for the masking split. The P01 answer was not wrong about normalization; it was answering the narrower question. |
| 2 | A locked crypto authority contradicts HMAC-SHA-256 or constant-time verification | **Not met.** The only established convention is `IMP-D043`'s peppered HMAC-SHA-256 with a fixed-width constant-time compare — the same construction, which is why the pattern was reused rather than reconciled. |
| 3 | An existing customer-domain identity authority conflicts | **Not met.** `ADR-DB2-001` and `customer_contact_points` require lowercase email and E.164-style phone in `normalized_value` (CON-163/164) — exactly what these functions produce. The partial unique CST-005 is the reason the merge-avoiding prohibitions matter, not a conflict with them. |
| 4 | Configuration architecture cannot represent two dedicated peppers | **Not met.** `design-session-auth.config.ts` is a working precedent for an env-backed, fail-closed secret config with no platform change; P01 follows its shape and adds only separation checks. |

### O.1 `APP4-P01-C1` stop condition

The correction had exactly one: *the approved dependency cannot be installed
because of a real repository/package-manager incompatibility.*

**Not met.** `pnpm --filter @embroidery/api add libphonenumber-js` succeeded on
the first attempt, resolving `1.13.10` with no peer warning, no engine conflict
and no workspace-protocol problem. Nothing was pinned, overridden or forced.
