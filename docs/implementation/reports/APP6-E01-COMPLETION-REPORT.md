# APP6-E01 — Focused Cross-Layer Acceptance — Completion Report

**Phase:** APP6 — Design Review, Approval and Quotation
**Checkpoint:** `APP6-E01`
**Mode:** `FOCUSED_ACCEPTANCE / EVIDENCE_ONLY`
**Date:** 2026-08-22

---

## 1. Verdict

```text
APP6-E01 = COMPLETE
APP6 CROSS-LAYER ACCEPTANCE = PASS
BLOCKING DEFECTS = 0
NEXT CHECKPOINT = APP6-X01
```

Six focused serial acceptance cases were executed. Both commercial branches —
Catalog and customer-owned product — reach `APPROVED` through owning APP6
operations only. No production runtime, schema, migration, OpenAPI artifact,
generated client or Figma artifact was changed.

---

## 2. Entry verification

| Fact | Value |
|---|---|
| Branch | `production` |
| HEAD at entry | `5cb00adc7ab1820337a0d2e2bc4794fbe6917319` |
| Working tree at entry | clean (`git status --porcelain` empty) |
| `7573ccd` reachable | yes (`git merge-base --is-ancestor 7573ccd HEAD` → 0) |
| OpenAPI (committed artifact) | **72 paths / 79 operations / 167 schemas** |
| Migrations | **36** |
| `APP6-S02` | `COMPLETE`, accepted, not reopened |
| `APP6-E01` at entry | `INCOMPLETE` / next |

Only documentation commits exist after `7573ccd` (`5cb00ad` records the S02
commit hash), so the accepted `APP6-S01` and `APP6-S02` browser evidence remains
valid and was **not** rerun (§13).

The counts above were recomputed from the committed artifact at entry and again
inside `E01-06` as an assertion — the artifact is read, never regenerated.

---

## 3. Accepted evidence reuse

Every proof below was classified before any test was written. `NEW` means the
claim is about **composition** and no single-slice suite could have made it.

| Checkpoint | Evidence reused | Why not rerun | E01 addition |
|---|---|---|---|
| `APP6-DB01` | COP nullable placement, exactly-one-branch `CHECK`, migration `0036` | Schema unchanged by E01 | `NEW` — a COP row surviving a full journey into an Approval Snapshot |
| `APP6-B01` | Deposit derivation, exact money, `.strict()` body | Drafting unchanged | `NEW` — the derived split observed on the wire through a composed injector |
| `APP6-B02` | Version history and detail projections | Reads unchanged | `NEW` — history still explains a superseded version after a real send |
| `APP6-B03` | Freeze/supersede/pointer atomicity, validity policy | Send unchanged | `NEW` — `QUOTED` as a projection with the request seeded only at `UNDER_REVIEW` |
| `APP6-B04` | Grant-scoped read, uniform `404`, expiry truth | Read unchanged | `NEW` — the same grant reused by the design lane |
| `APP6-B05` | GRD-002/003/006, CC-05/CC-06, idempotent replay | Decisions unchanged | `NEW` — stale and expired refusals against a live composed journey |
| `APP6-B06` | `GRD-005` allow-list row | Transition unchanged | `NEW` — the only commanded APP6 move, with the four system targets still unreachable |
| `APP6-B07` | Submitted-session read, provenance not authorization | Read unchanged | `NEW` — the COP absence rendering as empty rather than as an error |
| `APP6-B08` | Branch derivation, quartet completeness, COP labels | Authoring unchanged | `NEW` — a v1 and a v2 authored in the same injector from real prior state |
| `APP6-B09` | Canonical hash, `GRD-004` partial unique index, CC-03 permutations | Send unchanged | `NEW` — one-active-review while a sibling draft exists on the same case |
| `APP6-B10` | Exact active version, effective agreement set, no storage leak | Read unchanged | `NEW` — the agreement set the approval then binds, end to end |
| `APP6-B11` | Approval Snapshot, GRD-007/008, idempotency, CC-02/CC-04 | Decisions unchanged | `NEW` — first-decision-wins in **both** directions across a composed run |
| `APP6-A01` / `APP6-A02` | Admin browser acceptance | UI inputs unchanged (§13) | none |
| `APP6-S01` / `APP6-S02` | Storefront browser acceptance | UI inputs unchanged (§13) | none |

No `B0n`, `A0n` or `S0n` suite was rerun. No accepted checkpoint suite ran
without changed inputs.

---

## 4. Acceptance harness

### 4.1 Topology

One dedicated harness at `apps/api/test/acceptance/app6-e01/`, run serially by
`apps/api/jest.app6-e01.config.mjs` (`maxWorkers: 1`, `testMatch` scoped to that
directory alone so it can never become a repository-wide aggregate).

Each case boots **one real HTTP application carrying every delivered APP6
module at once**:

```text
RequestContext · AuditContext · Validation · HttpResponse · Policy · Content
QuotationDrafting · QuotationRead · QuotationSend
CustomerQuotation · CustomerQuotationDecision
CustomRequestModeration · CustomRequestSubmittedDesign
DesignVersionAuthoring · DesignVersionDetailRead · DesignVersionSend
CustomerDesignReview · CustomerDesignDecision
```

That composition is the checkpoint. Each `B0n` suite booted the single module it
owned — which is what let it say "no route in this injector could have done
that". `E01` asks the opposite question, so the eighteen modules are put in one
injector and driven over HTTP through the real guards.

Real PostgreSQL: a **disposable** database per case with all 36 migrations
applied, created and dropped by the run.

### 4.2 What is not overridden

Nothing under test. No guard stubbed, no repository doubled, no clock replaced,
no use case rebuilt from loose collaborators. Tokens are minted and only their
**real peppered digest** is stored, so a passing test proves the HMAC path.

**The policy values are production's.** The harness calls the three publishers
`staff-bootstrap` itself calls — `PublishApp4PolicyUseCase`,
`PublishApp6PolicyUseCase`, `PublishApp6AgreementsUseCase` — with a real resolved
Admin id, reading the committed seed datasets. So the 7-day validity window, the
40/60 deposit split, the `PAYMENT_POLICY` + `RETURN_POLICY` required set and the
agreement text this run proves against are the delivered ones, not a fixture's
opinion of them.

### 4.3 What is seeded, stated once

Only prerequisite state that APP6 consumes and no APP6 operation produces:

1. an `ACTIVE` Admin and a live Admin session (APP1);
2. a Customer with one verified contact point (APP4);
3. the Catalog chain and the submitted Design Session that names it (APP2/APP3/APP5);
4. a `custom_requests` row at **`UNDER_REVIEW`** with its quantity breakdown, and
   on the COP branch its `customer_owned_products` row (APP5);
5. the `design_cases` row — created in production by the delivered APP5
   `request.submit` (TR-LC11-01), which E01 does not re-execute because it starts
   at the APP6 prerequisite boundary (§22);
6. the `REQUEST_ACCESS` grant (APP4-B05).

The harness holds no route, repository call or statement that can write a
`custom_requests.status`. `QUOTED`, `QUOTE_ACCEPTED`, `DESIGN_REVIEW` and
`APPROVED` are therefore unreachable by fixture, by construction.

### 4.4 Step-up strategy

`GRD-003` executes for real on every sensitive transaction. What the harness
supplies is a committed `VERIFIED` `STEP_UP` challenge row — the same fixture
`APP6-B05` and `APP6-B11` established — so the production resolver reads
production evidence through the production window policy.

```text
browser (S01/S02):  real 403 STEP_UP entry already proved; dev exposes no
                    plaintext code, so the transaction could not be completed
E01:                fresh committed step-up evidence established through a test
                    fixture; the sensitive accept/approve transactions are
                    proved end to end with the production guard still running
```

No guard is bypassed, no production verification code is changed, no plaintext
verification code exists anywhere in the process, and no notification provider —
real or fake — was introduced.

### 4.5 Network source

Every public call carries an explicit `X-Forwarded-For`. The delivered
`PublicNetworkKeyService` reads the **last** entry (the one a trusted hop
appended) and this harness is that hop, so each case gets its own synthetic
source. The real 30-requests-per-minute limiter stays switched on throughout and
its policy is never rewritten; the addressing simply stops one case's negatives
from starving the next case's happy path.

---

## 5. `E01-01` — Catalog happy path

One commission seeded at `UNDER_REVIEW` and nowhere further, driven B01 → B11.

**Lifecycle ledger, read from `custom_request_transitions`:**

| # | From → To | Actor kind | Produced by |
|---:|---|---|---|
| 1 | `UNDER_REVIEW → QUOTED` | `SYSTEM` | `APP6-B03` send |
| 2 | `QUOTED → QUOTE_ACCEPTED` | `SYSTEM` | `APP6-B05` accept |
| 3 | `QUOTE_ACCEPTED → DIGITIZING` | `ADMIN` | `APP6-B06` transition (`GRD-005`) |
| 4 | `DIGITIZING → DESIGN_REVIEW` | `SYSTEM` | `APP6-B09` send for review |
| 5 | `DESIGN_REVIEW → APPROVED` | `SYSTEM` | `APP6-B11` approval |

Exactly one `ADMIN` row and four `SYSTEM` rows. The four system projections are
asserted as such, not merely as reached states.

**Key proofs (17 of the §6 list):**

1. an eligible `UNDER_REVIEW` request is quotable;
2. exact money survives the wire — `3600000.00` subtotal, `3650000.00` total,
   `40.00` percent, `1460000.00` deposit, `2190000.00` remainder **by
   subtraction**;
3. the send projects `QUOTED` and re-prices nothing (the frozen total is the
   drafted `3410000.00`, not the first version's);
4. `APP6-B04` resolves through `REQUEST_ACCESS` alone — no id in the body;
5. acceptance binds the exact current sent unexpired version;
6. acceptance projects `QUOTE_ACCEPTED`, and its evidence names the
   server-derived `grant_id` and `step_up_challenge_id`;
7. `APP6-B06` alone commands `DIGITIZING`, from `QUOTE_ACCEPTED`;
8. `APP6-B07` reads the submitted Catalog design source; no session secret or
   storage vocabulary appears in the Admin body;
9. `APP6-B08` creates the formal version only after eligibility, at `DRAFT`,
   with `parentVersionId` null;
10. the Catalog placement quartet is complete and every part is the seeded one —
    nothing substituted; both COP labels null;
11. `APP6-B09` stores the canonical `sha256:` hash (equal to the one returned)
    and projects `DESIGN_REVIEW`;
12. `APP6-B10` returns the exact active review version and that stored hash;
13. `APP6-B10` returns exactly the two effective agreement types the delivered
    policy requires, each with content and a `sha256:` content hash;
14. `APP6-B11` approves the exact version, hash and agreement set; the stored
    hash is what is frozen, never one the caller chose;
15. the request projects `APPROVED`;
16. the Approval Snapshot is immutable — a `document_hash` rewrite is rejected by
    `trg_approval_snapshots__reject_mutation` and the row is unchanged;
17. no Order, payment attempt, payment obligation, production job or inventory
    reservation exists.

Snapshot content verified: `document_hash`, the Catalog product and variant,
`customer_owned_product_id` null, `quantity_total` = the seeded breakdown sum
(24), `grant_id`, `step_up_challenge_id`, and the acceptance rows matching the
submitted `agreementVersionId` / `contentHash` pairs one for one.

**14 assertions groups, all passing.**

---

## 6. `E01-02` — customer-owned-product happy path

The same commercial sequence on a request whose subject is the customer's own
garment. Identical ledger, identical actor split.

**COP truth (11 of the §6 list):**

1. no fake Catalog product, SKU, variant, side or area — the database contains
   **zero** `products`, `product_variants`, `product_sides` and
   `embroidery_areas` rows before *and* after the complete journey;
2. no Design Session is fabricated — `design_sessions` stays empty throughout;
3. the formal version is honest schema-**v2**, branch `CUSTOMER_OWNED`;
4. `customer_owned_product_id` is populated on the version and the snapshot;
5. the Catalog quartet is NULL — all four, with nothing standing in;
6. both frozen placement labels are present and are the operator's agreed text;
7. the frozen envelope is positive (120 × 80 mm), not
   `customer_owned_products`' own nullable item dimensions (600 × 800);
8. `APP6-B09`, `B10` and `B11` all work with no Catalog identity present;
9. the Approval Snapshot carries COP identity and truthful human evidence —
   `product_name` is the customer's item, `variant_label` is NULL rather than an
   invented one, `side_name`/`area_name` are the agreed labels;
10. APP7 can identify the branch later from `customer_owned_product_id` without
    inventing anything;
11. no order, payment, reservation or production row exists.

`APP6-B07` on this branch returns `submittedDesign: null` with a `200` — the
absence renders as empty, never as an error, and nothing invents a session to
fill the gap.

Pricing checked independently of `E01-01`: `5090000.00` total, `2036000.00`
deposit, `3054000.00` remainder.

**9 assertion groups, all passing.**

---

## 7. `E01-03` — quotation stale, expiry and immutability

| Proof | Result |
|---|---|
| A `SENT` version is frozen | `total_amount` and `valid_until` rewrites both rejected; row unchanged |
| A newer send supersedes the old one | v1 → `SUPERSEDED`, v2 → `SENT`, customer read returns v2 |
| Superseding is not a lifecycle move | request still `QUOTED` |
| Accepting the superseded version | `409 QUOTE_VERSION_STALE`, **nothing written** — no status change, no acceptance row, and not silently accepted on the live version instead |
| Accepting the exact current version | commits, `QUOTE_ACCEPTED` |
| Accepted evidence is immutable | `trg_quotation_acceptances__reject_mutation` rejects an amount rewrite; row unchanged |
| Re-accepting | replays (`replayed: true`), exactly one evidence row |
| `APP6-B04` on an elapsed window | `expired: true`, version returned **in full** with its lines, nothing written |
| `GRD-006` on acceptance | `409 QUOTE_VERSION_STALE` in transaction |
| No sweep ran | the version is still `SENT` with `expired_at` NULL after both the read and the refusal |

**The one fixture, stated plainly.** An already-elapsed window is not
representable through the delivered surface: `APP6-B03` stamps `valid_from` at
the send instant from published policy, and
`trg_quotation_versions__reject_mutation` freezes both the moment the version
leaves `DRAFT`. The expiry leg therefore commits its second version through the
delivered `QuotationRepository` with a past instant — exactly as `APP6-B04` and
`APP6-B05` recorded. **The request's lifecycle state is untouched by that
fixture**: it was produced by the real `APP6-B03` send and stays where the send
left it. No expiry sweep was run; `SE-015` is out of APP6 scope by `APP6-R00`,
and the point of the leg is that `GRD-006` refuses without one.

**7 assertion groups, all passing.**

---

## 8. `E01-04` — design race, revision and immutability

| Proof | Result |
|---|---|
| Exactly one active review after the send | one `SENT_FOR_REVIEW` row on the case |
| Authoring a second draft at `DESIGN_REVIEW` | allowed — a revision is another `TR-LC08-01` |
| Sending it while a review is active | `409 REVIEW_ALREADY_ACTIVE`; sibling stays `DRAFT`, incumbent stays `SENT_FOR_REVIEW`, still one active |
| Approving a version that is not under review | `409 APPROVAL_VERSION_MISMATCH`; the sibling is on the **same customer's own case**, so the refusal is about *which version is under review*, not ownership |
| Approving with a hash that is not the stored one (`GRD-007`) | `409 APPROVAL_VERSION_MISMATCH`; no snapshot, request unmoved |
| A revision request binds the exact review version | `200`, version → `REVISION_REQUESTED`, request stays `DESIGN_REVIEW` |
| The revision needs no step-up | proved on a customer who has **never** had a challenge issued; `design_reviews.step_up_challenge_id` is NULL and `grant_id` is the grant |
| First decision wins (revision → approval) | `409 INVALID_TRANSITION`; one decision row, no snapshot |
| First decision wins (approval → revision) | `409 INVALID_TRANSITION`; one decision row, one snapshot, still `APPROVED` |
| The approved version is immutable | `document_hash` and `design_document` rewrites both rejected; stored hash unchanged |
| The snapshot and its acceptances are immutable | `quantity_total` and `content_hash` rewrites both rejected |

Two vocabularies were confirmed rather than conflated: the decision record names
the **decision** (`design_reviews.outcome = REQUEST_REVISION`) while the version
names the resulting **state** (`REVISION_REQUESTED`).

One trigger fact is recorded rather than asserted wrongly:
`trg_design_versions__reject_mutation` is `frozen_when_not DRAFT` with the
lifecycle-advance columns (`status` and its instants) deliberately **mutable** —
the state machine is the application's, which the `INVALID_TRANSITION` legs
above prove. What the trigger freezes is the artwork and its fingerprint, which
is what an approval binds.

Lower-level permutations (every concurrent-send interleaving, every seeded
terminal status) are `APP6-B09`'s and `APP6-B11`'s own suites and were **not**
repeated.

**8 assertion groups, all passing.**

---

## 9. `E01-05` — secure access, step-up and non-enumeration

| Proof | Result |
|---|---|
| One `REQUEST_ACCESS` grant opens both lanes | the same token reads the quotation **and** the design review; the request holds exactly one grant |
| Quotation-read failures are non-enumerating | unknown token, revoked grant, expired grant and a live grant with nothing quoted → **one identical body** and status (`404 SECURE_LINK_UNAVAILABLE`) |
| Design-review failures are non-enumerating | unknown, revoked, expired, nothing-to-review and *not-yet-sent* → **one identical body** |
| No refusal names a real target | no request id, customer id or version id appears in any of them |
| Acceptance requires standing step-up | `403 REVERIFICATION_REQUIRED` with none |
| A lapsed step-up does not count | verified 20 min ago against the delivered 15-min window → `403` again, no evidence row |
| A fresh step-up commits | same call → `200`, `QUOTE_ACCEPTED` |
| Rejection requires no step-up | proved on a customer with **zero** challenge rows; `200`, version `REJECTED`, request stays `QUOTED` — declining commits nothing |
| Approval requires standing step-up | `403 REVERIFICATION_REQUIRED`, no snapshot |
| Revision requires none | the same un-reverified customer gets `200` |
| Identity comes from the grant | `customerId`, `adminId`, `grantId`, `requestId` and `challengeId` each rejected `400` by the `.strict()` bodies, on the read **and** on the sensitive transaction |
| No external provider needed | the whole case ran with no transport; APP6 emits intent, it does not deliver |
| No credential-shaped value returned | no token, grant id, customer id, `token_hash` or pepper in any body |

Comparison method: `meta.requestId` and `meta.timestamp` are per-call
correlation, not an answer about the target, so they are removed before two
refusals are compared. Everything a caller could learn from — status, code,
message, structure — is compared intact.

**8 assertion groups, all passing.**

---

## 10. `E01-06` — customer-safe contracts and the APP7 boundary

Two authorities, deliberately both.

**Static**, over the committed `openapi.generated.json` read as-is and never
regenerated. Every APP6 customer request and response schema is walked
transitively through its `$ref`s (cycle-bounded — `DesignElement` is recursive),
so a forbidden internal cannot hide behind a component boundary, and the proof
holds for every client generated from that document rather than only for the
bodies this run happened to trigger.

| Proof | Result |
|---|---|
| Artifact unchanged | 72 paths / 79 operations / 167 schemas; all six customer operations present as `POST` |
| No internal identifier or storage locator | 27 forbidden fragments checked — token digest, pepper, grant id, scope kind, challenge id, customer id, admin id, actor id, storage key, bucket, presigned, object key, private original, audit id, audit event, outbox, event payload, payment attempt/obligation, order id/code, reservation id, production job/spec, machine file — **zero offenders** |
| The token is a request field only | absent from every response schema on all six operations |
| Money is string authority | every `*Amount` on `CustomerQuotationResponse` is `type: string`, and the runtime body agrees (`totalAmount === '3650000.00'`) |
| DesignDocument stays the governed schema | the review response `document` is a `$ref` to `#/components/schemas/DesignDocument`, not a second definition |
| Agreement content is customer-safe text | `content` and `contentHash` are strings; no `agreementId`, no `createdByAdminId` |
| No APP6 contract names an APP7 artifact | across every quotation, design-review, design-version and submitted-design operation — zero offenders |

**Runtime**, against real bodies from a complete journey: no token, grant id,
customer id, request id, contact value, storage/bucket/`x-amz` vocabulary in
either the quotation or the review body; and after the journey, all nine APP7
tables (`orders`, `order_items`, `payment_attempts`, `payment_obligations`,
`inventory_reservations`, `inventory_soft_holds`, `production_jobs`,
`production_specifications`, `production_artifacts`) are empty.

**8 assertion groups, all passing.**

---

## 11. Proof matrix

| Category | Catalog | COP | Negative / Boundary |
|---|---:|---:|---|
| Quote exact-version workflow | ✓ `E01-01` | ✓ `E01-02` | stale + expired, both `QUOTE_VERSION_STALE` (`E01-03`) |
| Request lifecycle projection | ✓ 5-row ledger | ✓ 5-row ledger | four system states never directly commanded — harness has no writer |
| Digitizing gate | ✓ `GRD-005` from `QUOTE_ACCEPTED` | ✓ | pre-acceptance denied (`GRD-005` allow-list, `APP6-B06`) |
| Formal design version | v1 Catalog, complete quartet | v2 COP, labels + envelope | no fake Catalog on COP — zero product/variant/side/area rows |
| Send for review | ✓ `DESIGN_REVIEW` projected | ✓ | one active review; competing send `REVIEW_ALREADY_ACTIVE` |
| Secure review | ✓ exact active version | ✓ exact active version | non-enumerating failure, five causes one body |
| Agreement set | ✓ 2 effective types | ✓ 2 effective types | exact `agreementVersionId` / `contentHash` stored |
| Exact approval | ✓ `APPROVED` | ✓ `APPROVED` | hash mismatch and revision conflict both refused |
| Immutable evidence | quote + approval | quote + approval | later mutation refused at the trigger, row unchanged |
| APP7 boundary | no Order, no payment | no Order, no payment | no reservation, no production — static **and** runtime |

---

## 12. Watermark authority

```text
APP6_WATERMARK_RUNTIME_AUTHORITY = DELIVERED_APP3_S09
```

Recorded as the Product Owner ruled. `APP6-S02`'s runtime is unchanged and no
Figma artifact was touched.

The cross-layer proof (§9 of the prompt) is
`apps/storefront/test/model/app6-e01-watermark-authority.test.ts`. It compares
the two modules' **exported behaviour**, not their source text — a regex would
pass on a comment and fail on a rename, while these assertions fail exactly when
the two runtimes would draw differently:

- the rotation (`-30°`), the row/column grid (7 × 5) and the delivered
  `APP3-S09` values restated once so a drift is a failure;
- the generated tiles compared **mark for mark**, all 35;
- the token alphabet, the length (8) and the identical
  no-cryptographic-randomness fallback constant;
- that a tile carries only `key`, `leftPercent` and `topPercent` — nothing a
  `DesignDocument` could serialize, so the mark cannot enter the canonical hash
  an approval binds.

Nothing is gated against `APP6-D01`'s drawn measurements.

```text
FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01
= NONBLOCKING_DESIGN_AUTHORITY_RECONCILIATION
OWNER = APP6-X01
RUNTIME_CANONICAL = APP3-S09
```

---

## 13. Browser evidence reuse

**No browser run was performed by this checkpoint. No Playwright project was
executed.**

Reused from `APP6-S01` (accepted): `/truy-cap/bao-gia` at 1440 and 390, real
`APP6-B04`/`APP6-B05` legs including 403, stale, expired, unavailable and
transient, and credential secrecy.

Reused from `APP6-S02` (accepted): `/truy-cap/duyet-thiet-ke` at 1440 and 390,
real `APP6-B10`, real `APP6-B11` 403, real revision, unavailable and transient,
and credential secrecy.

The inability to complete a browser step-up remains nonblocking: dev
intentionally exposes no plaintext verification code. `E01` establishes valid
step-up evidence through a test fixture at the API integration level, with the
production guard still executing, and reports that distinction rather than
claiming browser coverage it does not have (§4.4).

---

## 14. Validation ledger

| Command / test | Case | Result | Reruns | Why scoped |
|---|---|---|---:|---|
| `pnpm --filter @embroidery/api exec jest --config jest.app6-e01.config.mjs --runTestsByPath …e01-01…` | `E01-01` | 13/14 → **14/14** | 1 | Harness defect: `custom_request_transitions` orders by `id`, not a `sequence` column |
| `… --runTestsByPath …e01-02…` | `E01-02` | **9/9** | 0 | First run |
| `… --runTestsByPath …e01-03…` | `E01-03` | 0/7 → **7/7** | 1 | Harness defect: two commissions in one run collided on `uq_categories__slug` (UUIDv7 prefix) |
| `… --runTestsByPath …e01-04…` | `E01-04` | 5/8 → **8/8** | 1 | Three harness defects, all wrong expectations about the delivered contract (see below) |
| `… --runTestsByPath …e01-05…` | `E01-05` | 5/8 → **8/8** | 1 | Harness defects: envelope `meta` varies per call; one count assertion was global rather than scoped |
| `… --runTestsByPath …e01-06…` | `E01-06` | 0/8 → **8/8** | 1 | Harness defect: `@embroidery/contracts` publishes no subpath export for the artifact |
| **`pnpm --filter @embroidery/api exec jest --config jest.app6-e01.config.mjs`** (`CMD-TEST-APP6-E01`) | all six, serial | **6 suites / 54 tests passed**, 22.0 s | 2 (after the responsibility split, and after the final format pass) | The aggregate, run once the harness stabilised |
| `pnpm --filter @embroidery/storefront exec jest test/model/app6-e01-watermark-authority.test.ts` (`CMD-TEST-APP6-E01-WATERMARK`) | §12 | **4/4** | 1 | The §9 cross-layer proof; one file, Docker-free |
| `pnpm --filter @embroidery/api exec tsc --noEmit` | compile | **pass** | 0 | Package-scoped; `tsconfig.json` includes `test/**/*` |
| `npx eslint test/acceptance/app6-e01 jest.app6-e01.config.mjs` | lint | **pass** | 1 | Two `no-unnecessary-type-assertion` errors fixed |
| `npx eslint test/model/app6-e01-watermark-authority.test.ts` (storefront) | lint | **pass** | 0 | One file |
| `npx prettier --check` on the nine changed source files | format | **pass** | 2 | Formatting applied, then re-verified |
| `git diff --check` | whitespace | **clean** | 0 | — |

Every rerun followed a **harness** input change. No passing case was rerun on
unchanged inputs.

The three `E01-04` harness defects are worth naming, because each was a wrong
belief about the delivered contract rather than a product defect:

1. `design_reviews.outcome` is `REQUEST_REVISION` (the decision), while the
   version becomes `REVISION_REQUESTED` (the state) — two vocabularies, asserted
   separately now;
2. approving an already-decided version answers `INVALID_TRANSITION`, not
   `APPROVAL_VERSION_MISMATCH` — the published contract draws exactly that
   distinction and the test was wrong;
3. `trg_design_versions__reject_mutation` leaves `status` mutable on purpose
   (§8), so the status-rewrite assertion was testing the wrong layer.

```text
No broad/full regression was run.
No accepted checkpoint suite was rerun without changed inputs.
```

**Not run**, and deliberately: `pnpm quality`, `pnpm quality:e2e`, any full
Jest/Playwright matrix, any all-workspace typecheck, any repository-wide build,
the `B01`–`B11` / `A01` / `A02` / `S01` / `S02` suites, the APP3/APP4/APP5
acceptance suites, OpenAPI or generated-client generation, DB manifest or
fingerprint regression, the Figma checker, SonarQube, historical APP3 gates, any
repository-wide checker aggregate, and any benchmark.

**One observation on a repository-wide gate.** `node tools/check-file-size.mjs`
was consulted **for the E01 files only**, to size the new harness. It reports 79
hard-limit violations — every one of them pre-existing in `tools/`, confirmed
identical on a clean `HEAD`. None is touched by this checkpoint and none was
repaired (unrelated refactoring is forbidden). The E01 files themselves carry no
hard-limit violation; the one `REVIEW` notice (the context at 590 lines, past the
500 test threshold) was resolved by splitting the harness on **responsibility** —
composition and boot in `app6-e01-context.ts` (305), the prerequisite world and
its documents in `app6-e01-world.ts` (332), following the
`customer-design-seed-data.ts` precedent — not by cutting a line range.

---

## 15. Runtime changes

```text
None.
```

No API, Admin, Storefront, worker or package production source was edited. No
schema, migration or generated artifact was touched. The OpenAPI document was
read and asserted, never regenerated: **72 paths / 79 operations / 167
schemas**, migrations **36** — both unchanged from entry.

---

## 16. Files changed

**Added — acceptance harness (test-only):**

```text
apps/api/jest.app6-e01.config.mjs                                          31
apps/api/test/acceptance/app6-e01/app6-e01-context.ts                     305
apps/api/test/acceptance/app6-e01/app6-e01-world.ts                       336
apps/api/test/acceptance/app6-e01/app6-e01-journey.ts                     237
apps/api/test/acceptance/app6-e01/e01-01-catalog-happy-path.acceptance.spec.ts   499
apps/api/test/acceptance/app6-e01/e01-02-cop-happy-path.acceptance.spec.ts       360
apps/api/test/acceptance/app6-e01/e01-03-quotation-negatives.acceptance.spec.ts  284
apps/api/test/acceptance/app6-e01/e01-04-design-negatives.acceptance.spec.ts     378
apps/api/test/acceptance/app6-e01/e01-05-secure-access.acceptance.spec.ts        377
apps/api/test/acceptance/app6-e01/e01-06-contract-boundary.acceptance.spec.ts    366
apps/storefront/test/model/app6-e01-watermark-authority.test.ts            82
```

**Modified — documentation only:**

```text
docs/implementation/SCOPED_COMMAND_INDEX.md            +2 rows
docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md   roadmap §9 status
docs/implementation/reports/APP6-E01-COMPLETION-REPORT.md        this file (new)
```

The phase plan's §11 per-checkpoint status ledger stops at `NEXT CHECKPOINT =
APP6-S01`; `APP6-S02` already chose not to extend it and recorded its outcome in
the §9 roadmap row instead. `E01` follows that precedent rather than adding a
block for itself and leaving a hole where S02's would be.

`APP6-E01-C1` later touched two of these files — the report (§4.3, §17, §18 and
the new §22) and `app6-e01-world.ts`, whose comment above the design-case seed
was corrected. The comment edit is why `app6-e01-world.ts` reads 336 lines here
rather than the 332 committed by `33f8747`; no code line changed (§22.6).

---

## 17. Follow-ups

**New (nonblocking):** none.

**Opened by E01 and closed by `APP6-E01-C1`:**

```text
FU-APP6-E01-DESIGN-CASE-ORIGIN-01 = CLOSED_FALSE_POSITIVE
  Delivered owner: APP5-B01 / TR-LC11-01 `request.submit`.
  E01 originally concluded that no delivered APP5 or APP6 operation creates a
  `design_cases` row. That conclusion was wrong; see §22. No runtime work is
  routed and no APP6-X01 action is required for design-case creation.
```

**Carried unchanged:**

```text
FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01   (owner APP6-X01; runtime authority
                                               now recorded as APP3-S09, §12)
FU-APP6-S01-STEPUP-BROWSER-OBSERVATION-01
FU-APP6-S01-STEPUP-CONTACT-PREFILL-01
FU-APP4-DEV-ENVELOPE-KEY-UNSET-01
FU-APP6-A02-LOADING-FRAME-BROWSER-OBSERVATION-01
FU-APP6-B10-AGREEMENT-ACTOR-01
FU-APP6-B08-P01-GATE-01
FU-APP6-DB01-01
FU-APP6-DB01-02
FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01
FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01
FU-APP6-B01-CODE-GENERATOR-PROMOTION-01
FU-APP6-B01-APP4-POLICY-CHECKER-MIGRATION-COUNT-01
FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01
```

**Closed by this checkpoint:** none. No duplicate was opened for the known
browser step-up limitation or for the absence of full regression.

**Blocking:** none.

---

## 18. Roadmap

| Checkpoint | Status | Note |
|---|---|---|
| `APP6-S01` | `COMPLETE` | Customer secure quotation |
| `APP6-S02` | `COMPLETE` | Customer secure design review |
| `APP6-E01` | `COMPLETE` | Focused cross-layer acceptance **PASS**; `C1` evidence correction incorporated (§22) |
| `APP6-X01` | `INCOMPLETE` | **Next** — phase closure |

---

## 19. Acceptance criteria

All 48 criteria in the checkpoint prompt §22 are met. The five that need a word
rather than a tick:

- **#3** — exactly six focused serial cases; the aggregate command runs them in
  one serial process and is the final evidence (§14).
- **#12** — the harness cannot command the four system states because it holds
  no writer for `custom_requests.status` at all; this is structural, not a rule
  it obeys (§4.3).
- **#13/#14** — the expired-window leg uses one stated fixture, because an
  elapsed window is unrepresentable through the delivered send; the request's own
  lifecycle state is still the real send's (§7).
- **#27** — the step-up fixture commits evidence the production resolver reads;
  `GRD-003` is executed, not mocked, and refuses when the evidence is absent or
  lapsed (§4.4, §9).
- **#42** — no product or runtime defect was found. Six harness defects were
  found and fixed; three of them were wrong beliefs about the delivered contract
  and are named in §14 rather than quietly corrected.

---

## 20. Commit

```text
test(app6): deliver APP6-E01 focused cross-layer acceptance

COMMIT = 33f8747
```

Local commit only. Nothing pushed.

---

## 21. Next

```text
NEXT CHECKPOINT: APP6-X01 — Phase closure
```

---

## 22. `APP6-E01-C1` — design-case origin evidence correction

```text
APP6-E01-C1 = COMPLETE
CORRECTION  = DESIGN_CASE_ORIGIN_EVIDENCE_ALIGNMENT
```

### 22.1 The original false conclusion

§4.3 and §17 inferred, from the fact that the E01 fixture seeds the
`design_cases` row, that **no delivered APP5 or APP6 operation creates one** —
and opened `FU-APP6-E01-DESIGN-CASE-ORIGIN-01` against `APP6-X01` on that basis.
The inference does not hold: a fixture seeding a row proves only that the
seeding phase does not produce it inside its own execution window, not that no
delivered operation produces it at all.

### 22.2 The stronger accepted evidence

Design-case header creation is owned by **APP5**, and was delivered and proved
there:

| Source | What it establishes |
| --- | --- |
| `docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md` (LC-11) | `TR-LC11-01 (submit) → NEW` — "W1 tx (request + design case + grant)", **create case** |
| `docs/implementation/audits/APP5_PHASE_ENTRY_AUDIT.md` §126, §235, §355 | "Design case header creation — **Yes** … Created by APP5 per TR-LC11-01"; `APP5-B01` scope explicitly includes "create design case" in the W1 transaction |
| `docs/implementation/audits/APP5_G01_SUBMISSION_MODERATION_AUTHORITY.md` §104, §233 | "Design case header — created (TR-LC11-01)" on **both** the catalog and COP branches, inside the one W1 transaction |
| `docs/implementation/reports/APP5-B01-COMPLETION-REPORT.md` §5, §7 | submission transaction map row "design case → APP3 `DesignCaseRepository.createForRequest`", with real-PostgreSQL row-count evidence |

`APP5-B01`'s real-PostgreSQL evidence, restated:

```text
first submission          -> 1 custom_requests, 1 design_cases
same completed replay     -> byte-identical 201; still 1 design case
concurrent duplicate CC-18-> custom_requests = 1, design_cases = 1
```

Targeted source read confirming the delivered creator (no test run):

```text
apps/api/src/modules/order/application/submit-custom-request.use-case.ts:230
  await this.designCases.createForRequest(newId() as DesignCaseId, requestId);
```

Therefore:

```text
DESIGN_CASE_ORIGIN = APP5-B01 request.submit (TR-LC11-01)
```

### 22.3 Correct interpretation of the E01 fixture

E01 deliberately begins the APP6 journey at the **APP6 prerequisite boundary** —
a `custom_requests` row already at `UNDER_REVIEW` — instead of calling APP5
`request.submit`. That is in scope: APP5 is a prior accepted phase and E01 is a
phase-scoped acceptance run, not an APP5→APP6 re-execution. Because the
submission call is outside the E01 execution window, the fixture must seed the
APP5 consequences APP6 consumes, and the design-case header is one of them.
E01 seeds it as **prior-phase evidence reuse**, not because production lacks a
creator.

### 22.4 `APP6-B08` semantics — unchanged

`APP6-B08` remains correct as delivered: it authors versions onto the case
addressed by `custom_requests.current_design_case_id` and answers
`DESIGN_CASE_UNRESOLVED` when that accepted prerequisite is absent or corrupt.
No case-creation behavior is added to APP6, and no new APP6 checkpoint is
created for it.

### 22.5 Follow-up disposition

```text
FU-APP6-E01-DESIGN-CASE-ORIGIN-01 = CLOSED_FALSE_POSITIVE
DELIVERED OWNER                   = APP5-B01 / TR-LC11-01 request.submit
E01 FIXTURE RATIONALE             = prerequisite-boundary seeding of an
                                    already-delivered APP5 consequence
```

`FU-APP6-S02-WATERMARK-DRAWN-VS-DELIVERED-01` and every other carried follow-up
in §17 are unchanged, still owned by `APP6-X01`.

### 22.6 Files changed by C1

```text
docs/implementation/reports/APP6-E01-COMPLETION-REPORT.md   §4.3, §17, this §22
apps/api/test/acceptance/app6-e01/app6-e01-world.ts         comment text only
```

The harness edit replaces the false comment above the design-case seed with the
correct APP5 attribution. No statement, fixture value or assertion changed, so
no behavior changed.

### 22.7 Validation

Evidence/documentation only. No production source, harness behavior, fixture
semantics, database, OpenAPI, generated client or Figma change was made, so no
suite was rerun — a passing command is not re-executed on unchanged inputs.

```text
targeted source read   APP5 authority + evidence + submit-custom-request.use-case.ts
targeted grep          FU-APP6-E01-DESIGN-CASE-ORIGIN-01 (2 hits, both in this report)
                       "no delivered ... design case" (1 hit, the harness comment)
git diff --check       clean
```

### 22.8 Unchanged verdict

```text
APP6-E01                          = COMPLETE
APP6 CROSS-LAYER ACCEPTANCE       = PASS
BLOCKING DEFECTS                  = 0
six serial acceptance cases       = not rerun, not reopened
APP5-B01 suite                    = not rerun
APP6_WATERMARK_RUNTIME_AUTHORITY  = DELIVERED_APP3_S09
NEXT CHECKPOINT                   = APP6-X01
```
