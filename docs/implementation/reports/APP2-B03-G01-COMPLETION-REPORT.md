# APP2-B03-G01 — Product unpublish lifecycle authority reconciliation

**Verdict: PASS.**

The gate adds one canonical Product lifecycle transition — `TR-LC04-05`
`PUBLISHED → DRAFT`, **Unpublish Product** — and reconciles every canonical
document that contradicted it. Documentation and one consistency gate only: no
migration, no schema, no application source, no OpenAPI, no generated client, no
Figma, no dependency.

---

## A. Preflight and blocked B03 evidence

```text
APP2_B03_G01_PREFLIGHT = PASS
```

| Fact | Value |
|---|---|
| Branch | `production`, ahead of `origin/production` by 37 — nothing pushed |
| HEAD at entry | `f9d1fa631ef2d94fd2acf351885e000f4e90ce80` — the exact `APP2-A03-C1` evidence Commit D |
| Commit D subject | `docs(app2): record A03 correction evidence` |
| Commit D files | roadmap, APP2 phase plan, `APP2-A03-C1-CORRECTION-REPORT.md` (3 files, evidence only) |
| Tracked/staged tree | clean |
| `evidences/` | untouched (user-owned, ignored) |
| B03 / A04 / B04 / S01 / S02 / E01 / T01 source | none |

Preflight gates: `pnpm quality` **exit 0**, `check:secrets` (347 docs / 1,598
tracked files), `check:openapi`, `check:api-client`, `check:figma-design-index`,
`node --test tools/check-figma-design-index.test.mjs` 31/31,
`pnpm db:check:manifest`, `git diff --check` — all clean.

`APP2-B03` blocked at its §5 representability gate **before any source change**,
producing no commit and no file. That result is accepted here as the entry
evidence.

---

## B. Exact lifecycle contradiction

The phase requires unpublish. No accepted authority defined a transition out of
`PUBLISHED` other than archive.

| Authority | What it said about Product publication |
|---|---|
| `DB3_LIFECYCLE_SPECIFICATIONS.md` LC-04 | **4 TR**: `DRAFT→PUBLISHED`, `PUBLISHED→ARCHIVED`, `DRAFT→hard delete`, `ARCHIVED→PUBLISHED` |
| `DB3_COMPLETENESS_MATRIX.md` | LC-04 = "4 TR", status **complete** |
| `DB0_LIFECYCLE_INVENTORY.md` LC-04 | "create → publish → archive; edit in place" |
| `DB0_REQUIREMENT_MATRIX.md` REQ-CAT-003 (LOCKED) | "create/edit/**archive**" |
| `07-ADMIN-OPERATIONS.md` **§3 Catalog** | create / edit / **archive** |
| `07-ADMIN-OPERATIONS.md` **§4 Gallery** | "Publish/unpublish" — **Gallery Entry (AGG-18)**, a different aggregate |
| `DB2_AGGREGATE_CATALOG.md` AGG-06 | events = product-**published / archived / changed** |
| Repository-wide | the string `PUBLISHED → DRAFT` appeared **nowhere** |

LC-04's header read `DRAFT → PUBLISHED ↔ (edit in place, audited) → ARCHIVED`.
The `↔` means *editing while published*, not a return to `DRAFT`.

Against that, APP2 implementation authority required the opposite:

| Source | Claim |
|---|---|
| `APP2_PRE_IMPLEMENTATION_AUDIT.md` line 176 | B03 transition = **`DRAFT↔PUBLISHED`** |
| same, line 97 | "Publish / unpublish … **schema sufficient**" |
| `10-MASTER-APPLICATION-ROADMAP.md` §4 | "unpublish removes public visibility" |
| `APP2-D03` / IMP-D033 / Figma `442:205` | A04 owns an approved `Gỡ xuất bản` capability |

**The distinction the audit missed.** `products.status` is a plain
`CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED'))` with **no transition
guard**, so the column can hold `DRAFT` after `PUBLISHED`. That is physical
representability. It says a state can be *stored*, not that reaching it is
*authorized*. Lifecycle authority is LC-04, and LC-04 did not define the move.

---

## C. Current LC-04 audit (before this gate)

| TR | From → To | Actor | Guards | Audit |
|---|---|---|---|---|
| TR-LC04-01 | DRAFT → PUBLISHED | admin | required public fields present | yes |
| TR-LC04-02 | PUBLISHED → ARCHIVED | admin | — (open cases keep snapshots; INV-12) | yes R |
| TR-LC04-03 | DRAFT → (hard delete) | admin | never published & unreferenced (ADR-DB1-011) | yes |
| TR-LC04-04 | ARCHIVED → PUBLISHED | admin | fields still valid | yes R |

Transition count **4**. Next free identifier: **`TR-LC04-05`** (derived from the
existing two-digit numbering, not assumed from the prompt).

Code vocabulary audited for consistency (no code changed):

| Concern | Convention found in source |
|---|---|
| Audit `action` | lowercase dot-namespaced — `staff.login.succeeded`, `staff.credential.rotated` |
| Audit `target_kind` | SCREAMING_SNAKE — `ADMIN_ACCOUNT` |
| Audit actor kind | `ADMIN` |
| Outbox `eventType` | lowercase dotted — `asset.inspection.requested` |
| Outbox `aggregateKind` | SCREAMING_SNAKE — `'ASSET'` |
| Outbox payload | minimal + `schemaVersion`, mirrored in `payloadSchemaVersion` |
| Product lifecycle errors | `PRODUCT_NOT_FOUND`, `PRODUCT_VERSION_CONFLICT`, `PRODUCT_NOT_EDITABLE`, `PRODUCT_ARCHIVE_NOT_ALLOWED`, `PRODUCT_MEDIA_ASSET_UNAVAILABLE`, … |
| Transition guard naming | `PRODUCT_EDITABLE_STATES` / `isEditableState`, `PRODUCT_ARCHIVABLE_STATES` / `isArchivableState` |

---

## D. Product Owner decision

Recorded as **IMP-D035**, status `LOCKED`, owner Product/domain authority,
checkpoint `APP2-B03-G01`:

> Product unpublish is `PUBLISHED → DRAFT`. It removes public visibility without
> archiving or deleting Product authoring facts. Archive remains a distinct
> `PUBLISHED → ARCHIVED` transition. Every later publish or republish
> re-evaluates publication readiness transactionally.

Rejected alternatives, and why: `PUBLISHED → ARCHIVED` as unpublish would
conflate a reversible visibility change with a durable retirement fact whose only
exit is back to `PUBLISHED`; dropping unpublish would leave A04's approved
`Gỡ xuất bản` control with no backend and make public visibility one-way.

---

## E. New unpublish transition

Added to LC-04 as row `TR-LC04-05`:

| TR | From→To | Actor | Guards | Effects | Audit |
|---|---|---|---|---|---|
| TR-LC04-05 | PUBLISHED→DRAFT | admin | current status is `PUBLISHED`; concurrency token matches | delist event; returns to the editable draft state | yes |

**Preconditions.** Product exists · current status `PUBLISHED` · actor is an
authorized Admin · `expectedUpdatedAt` matches database truth when executed
through the Admin command. Lifecycle authority states the token requirement
without embedding HTTP details.

**Postconditions.** `status = DRAFT` · public eligibility false (the row leaves
the `status='PUBLISHED'` predicate that scopes every public read, IDX-065) · the
row persists · `slug`, `category_id`, `name`, `description`,
`base_price_amount`, `currency_code`, `display_order`, `seo_*` and
`is_indexable` unchanged · ordered `product_media` unchanged · Assets and
derivatives unchanged · `updated_at` advances under the accepted monotonic
mechanism.

**Forbidden side effects.** Never `status = ARCHIVED`, never write `archived_at`,
no hard delete, no media-link removal, no Asset/derivative/object deletion, no
slug change, no price clear, no category reset.

**Editability.** Afterwards the product is editable again under the existing
`DRAFT` rules. **No `UNPUBLISHED` state is created** — a second editable state
would force every editing rule to name both.

---

## F. Archive and unpublish distinction

| Action | Source state | Target state | Public visibility | Editable | Archive fact |
|---|---|---|---|---|---|
| Unpublish (`TR-LC04-05`) | `PUBLISHED` | `DRAFT` | removed | **yes** — existing DRAFT rules | **no** — `archived_at` untouched |
| Archive (`TR-LC04-02`) | `PUBLISHED` | `ARCHIVED` | removed | no — `PRODUCT_EDITABLE_STATES` is `DRAFT` only | **yes** — `archived_at` written |
| Republish archived (`TR-LC04-04`) | `ARCHIVED` | `PUBLISHED` | restored | no (published) | per existing authority; this gate changes nothing about it |

`ARCHIVED → PUBLISHED` is preserved exactly as it stands. Archive was **not**
rewritten as `ARCHIVED → DRAFT`; that would require a separate Product Owner
decision.

---

## G. Readiness and republish semantics

Unpublish **destroys no readiness fact**. A product returned to `DRAFT` may still
satisfy every publication requirement, and nothing is recomputed or cleared by
the transition.

That is not permission to re-publish automatically. **Every publish re-evaluates
readiness inside its own transaction**, because the facts publication depends on
— category publication state, Asset eligibility (`CATALOG_MEDIA` /
`PRODUCTION_SENSITIVE` / `ACCEPTED`), derivative readiness — are owned by other
aggregates and can change while the product sits in `DRAFT`.

---

## H. Audit vocabulary

Derived from the implemented convention (§C), not invented:

| Transition | `action` | `target_kind` | before → after | `reason` |
|---|---|---|---|---|
| TR-LC04-01 publish | `product.published` | `PRODUCT` | `DRAFT` → `PUBLISHED` | not required |
| TR-LC04-05 unpublish | `product.unpublished` | `PRODUCT` | `PUBLISHED` → `DRAFT` | not required |

**Mapping recorded:** the prompt's `PRODUCT_PUBLISHED` / `PRODUCT_UNPUBLISHED`
map to `product.published` / `product.unpublished`, because every implemented
audit action in this repository is lowercase dot-namespaced. `target_kind` keeps
the SCREAMING_SNAKE form.

**Reason is deliberately not required.** The `R` on the Product/catalog audit row
applies to archive and unarchive only — now stated explicitly as
"R (archive/unarchive **only**)". A required reason must be collected from the
operator, and the approved publication command carries a concurrency token and
nothing else; a mandatory reason would have to be fabricated by the server or
force an unapproved field into the request. Catching this here is the point of
the gate: B03 would otherwise have hit the contradiction mid-implementation.

`summary` stays bounded — before/after status plus correlation id — and never
carries description, price, media, Asset ids, storage facts, the full product
record, credentials, cookies, authorization headers, raw errors or SQL. Archive
is never recorded as an unpublish action.

---

## I. Outbox vocabulary

| Business event | `eventType` | `aggregateKind` | Meaning |
|---|---|---|---|
| Product Published | `product.published` | `PRODUCT` | public visibility became eligible |
| Product Unpublished | `product.unpublished` | `PRODUCT` | public visibility was removed |

Payload, following `asset.inspection.requested`:

```json
{ "schemaVersion": 1, "productId": "<UUIDv7>", "slug": "<server-owned slug>" }
```

mirrored in `payloadSchemaVersion`. Never a product snapshot, description, price,
media, Asset ids, storage data, Admin identity, credentials or headers.

Delivery remains at-least-once; the durable row inside the product transaction is
the handoff. No worker handler, CDN, public query or cache adapter is defined
here.

---

## J. Error vocabulary

| Outcome | Code |
|---|---|
| publish from `PUBLISHED` or `ARCHIVED` | `PRODUCT_PUBLISH_NOT_ALLOWED` |
| unpublish from `DRAFT` or `ARCHIVED` | `PRODUCT_UNPUBLISH_NOT_ALLOWED` |
| stale `expectedUpdatedAt` | `PRODUCT_VERSION_CONFLICT` |
| readiness incomplete at publish time | `PRODUCT_PUBLICATION_NOT_READY` |
| unknown product | `PRODUCT_NOT_FOUND` |

None of these collapses into `PRODUCT_NOT_EDITABLE`, which keeps its existing
meaning (a mutation attempted against a non-`DRAFT` product). HTTP status is not
part of lifecycle authority and is not fixed here.

This vocabulary is consistent with the `APP2-A03-C1` correction, which made only
the exact `PRODUCT_VERSION_CONFLICT` code open the stale-version dialog — a
lifecycle refusal must stay distinguishable from a concurrency conflict on the
wire, or that correction is undone.

---

## K. Canonical document reconciliation

| File | Change |
|---|---|
| `docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md` | LC-04 header now `DRAFT ↔ PUBLISHED`; row `TR-LC04-05` added; new `### TR-LC04-05 — Unpublish Product` subsection with pre/postconditions, forbidden side effects, editability and readiness |
| `docs/database/DB3_COMPLETENESS_MATRIX.md` | LC-04 `4 TR` → `5 TR` |
| `docs/database/DB3_AUDIT_SPECIFICATION.md` | Product/catalog row reason scoped to archive/unarchive **only**; new "Product publication actions" section with the action/target/before-after/reason table |
| `docs/database/DB0_LIFECYCLE_INVENTORY.md` | LC-04 transitions now include unpublish back to draft |
| `docs/database/DB0_REQUIREMENT_MATRIX.md` | REQ-CAT-003 now reads create/edit/publish/unpublish/archive |
| `docs/database/DB2_AGGREGATE_CATALOG.md` | AGG-06 commands and events include unpublish/unpublished |
| `docs/07-ADMIN-OPERATIONS.md` §3 | adds "Publish/unpublish product" with the non-archive meaning |
| `docs/implementation/audits/APP2_PRE_IMPLEMENTATION_AUDIT.md` | "schema sufficient" corrected in the row; new correction section separating physical representability from lifecycle authority |
| `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` | B03 row and narrative name `TR-LC04-01` / `TR-LC04-05` and keep archive distinct |
| `docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md` | **IMP-D035** added, `LOCKED`; no prior decision renumbered |

`docs/01-PRODUCT-REQUIREMENTS.md` and `docs/04-BUSINESS-RULES.md` contain no
publication statement at all, so neither contradicts the decision and neither was
touched. `10-MASTER-APPLICATION-ROADMAP.md` §4 already reads "unpublish removes
public visibility" and needed no reconciliation.
`11-TRACEABILITY-AND-STATUS-MATRIX.md` explicitly defers current status to
roadmap §6 and is not a duplicate status location, so it was left alone.

**No historical completion report was rewritten.** The `APP2-B03` block stands as
recorded; this gate supersedes it going forward rather than editing it away.

---

## L. Transition-count reconciliation

| Location | Before | After |
|---|---|---|
| `DB3_LIFECYCLE_SPECIFICATIONS.md` LC-04 rows | 4 | **5** |
| `DB3_COMPLETENESS_MATRIX.md` LC-04 | `4 TR` | **`5 TR`** |

Verified by parsing the section rather than trusting prose:

```text
TR-LC04-01 DRAFT      -> PUBLISHED
TR-LC04-02 PUBLISHED  -> ARCHIVED
TR-LC04-03 DRAFT      -> (hard delete)
TR-LC04-04 ARCHIVED   -> PUBLISHED
TR-LC04-05 PUBLISHED  -> DRAFT
declared count: 5
```

No other lifecycle count was touched — `DB3_COMPLETENESS_MATRIX` also lists
LC-15, LC-18, LC-20 and LC-22 at 4 TR, and all four are unchanged.

---

## M. Consistency-gate hardening

**Audit of existing tooling.** `check-figma-design-index` owns registry
integrity; `check-report-secrets` owns documentation secret safety;
`check-file-size`, `check-styles`, `check-frontend-*`, `check-e2e`,
`check-spike-boundaries`, `db-manifest-check` own structural and schema
boundaries. **None compared an implementation document's lifecycle claim with the
lifecycle specification**, which is exactly how a four-transition LC-04 and a
`DRAFT↔PUBLISHED` audit coexisted through every gate.

Added: **`tools/check-lifecycle-consistency.mjs`**, script **`pnpm check:lifecycle`**,
wired into `pnpm quality` immediately after `check:secrets`.

It is bounded, not a general Markdown parser: it reads the `## LC-04` section of
one file as a table, one row of the completeness matrix, and two fixed claims in
the two APP2 documents. Four invariants:

1. LC-04 defines **exactly one** `PUBLISHED → DRAFT` transition;
2. LC-04 keeps `PUBLISHED → ARCHIVED` as a distinct transition;
3. the completeness-matrix count equals the parsed transition count;
4. no APP2 document claims `DRAFT↔PUBLISHED` while LC-04 lacks the return leg, and
   none documents unpublish as targeting `ARCHIVED`.

**Regression tests — `tools/check-lifecycle-consistency.test.mjs`, 10 tests, all passing:**

| Required proof | Test | Result |
|---|---|---|
| corrected repository passes | `the corrected repository passes` | ✅ |
| removing `PUBLISHED → DRAFT` fails | `removing PUBLISHED → DRAFT from LC-04 fails` — also reports the APP2 documents, reproducing the exact B03 blocker pairing | ✅ |
| reverting the count to 4 fails | `reverting the declared count to 4 fails` | ✅ |
| unpublish documented as ARCHIVED fails | `documenting the APP2 unpublish target as ARCHIVED fails` | ✅ |
| duplicate unpublish fails | `duplicating the unpublish transition fails` | ✅ |
| ordinary prose is not a false positive | `ordinary prose about PUBLISHED and DRAFT is not a violation` — including the correct contrast sentence | ✅ |
| archive deletion fails | `deleting the archive transition fails` | ✅ |
| structure/count parsing | `LC-04 has exactly five transitions…` | ✅ |
| bidirectional claim only fails when unauthorized | `a bidirectional claim is only a violation when the transition is absent` | ✅ |
| missing section is reported, not silently passed | `a missing LC-04 section is reported…` | ✅ |

The tests read the **real repository files**, so the gate cannot pass its own
fixtures while failing the repository. One false positive was found and fixed
during development: the first `unpublish … → ARCHIVED` rule matched the correct
contrast sentence "unpublish is PUBLISHED → DRAFT; archive is PUBLISHED →
ARCHIVED"; the window now stops at `.`, `;`, `(` and `)` so the arrow must be
attributed to unpublish itself.

No existing gate was weakened. Repository tools tests: 122 → **132**.

---

## N. Frozen engineering artifacts

| Artifact | Required | Measured | Status |
|---|---|---|---|
| OpenAPI sha256 | `c4d1fef8ecc54c330aa8cf8e130582c92e4e6af9dd3643664cc020757da72d0b` | up to date, unchanged | ✅ |
| Generated client tree hash | `3e3e267dc3c76bd630138bcb21f1500006ecf38dec2d088c5bc4d4c2133acfdb` | identical | ✅ |
| Migrations | 33 | 33 | ✅ |
| Tables / columns / CHECKs | 78 / 833 / 190 | unchanged (manifest passed) | ✅ |
| DB fingerprint | `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf` | no schema or migration change | ✅ |
| Figma registry | 72 IDs / 72 node rows | 72 / 72 | ✅ |

No `apps/**` change, no `packages/**` change, no dependency or lockfile change,
no Nginx/Compose change, no Product state mutated, no API operation added.

---

## O. Commit A evidence

```
bd4498040bcaeaef2b25b74917442886713e69ad
docs(domain): define product unpublish lifecycle
13 files changed, 447 insertions(+), 16 deletions(-)
```

```
docs/07-ADMIN-OPERATIONS.md                                        |   3 +
docs/database/DB0_LIFECYCLE_INVENTORY.md                           |   6 +-
docs/database/DB0_REQUIREMENT_MATRIX.md                            |   2 +-
docs/database/DB2_AGGREGATE_CATALOG.md                             |   4 +-
docs/database/DB3_AUDIT_SPECIFICATION.md                           |  33 +++-
docs/database/DB3_COMPLETENESS_MATRIX.md                           |   2 +-
docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md                      |  47 ++++-
docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md         |   1 +
docs/implementation/audits/APP2_PRE_IMPLEMENTATION_AUDIT.md        |  33 +++-
docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md  |   4 +-
package.json                                                       |   5 +-
tools/check-lifecycle-consistency.mjs                              | 196 +++++++++
tools/check-lifecycle-consistency.test.mjs                         | 127 +++++++
```

---

## P. Validation

| Command | Result |
|---|---|
| `node tools/check-lifecycle-consistency.mjs` | ✅ LC-04: 5 transitions, one `PUBLISHED → DRAFT`, archive distinct, APP2 documents agree |
| `node --test tools/check-lifecycle-consistency.test.mjs` | ✅ **10/10** |
| `pnpm check:secrets` | ✅ 347 documents, 1,598 tracked files |
| `pnpm check:openapi` | ✅ artifact up to date |
| `pnpm check:api-client` | ✅ tree hash matches |
| `pnpm check:figma-design-index` | ✅ 72/72 |
| `node --test tools/check-figma-design-index.test.mjs` | ✅ 31/31 |
| `pnpm db:check:manifest` | ✅ all checks passed |
| `node tools/check-file-size.mjs` | ✅ passed (21 pre-existing review-threshold notices) |
| `pnpm format:check` | ✅ clean |
| **`pnpm quality`** | ✅ **exit 0**; tools tests **132/132**; both new gates ran inside it |
| `git diff --check` | ✅ clean |

Direct verification, independent of prose:

```text
LC-04 parsed transitions        = 5
PUBLISHED → DRAFT transitions   = 1  (TR-LC04-05)
PUBLISHED → ARCHIVED present    = yes (TR-LC04-02)
DB3_COMPLETENESS_MATRIX LC-04   = 5 TR
APP2 audit / phase plan         = unpublish is PUBLISHED → DRAFT
Audit vocabulary                = product.published / product.unpublished (distinct)
Outbox vocabulary               = product.published / product.unpublished (distinct)
```

| Recorded value | |
|---|---|
| Old / new transition count | 4 → **5** |
| Exact transition ID | **`TR-LC04-05`** |
| Decision ID | **IMP-D035** |
| Checker | `tools/check-lifecycle-consistency.mjs` → `pnpm check:lifecycle` |
| Checker tests | 10 |

---

## Q. Acceptance

All 60 criteria met. Highlights: exact clean A03-C1 entry (1–3); no migration or
schema change (4, 48); LC-04 audited and the missing transition proven (5–6);
Product Owner option 1 recorded as IMP-D035 `LOCKED` (7, 37); exactly one
transition added at the next real identifier, counts reconciled (8–11);
semantics, preservation and forbidden side effects explicit (12–21); archive kept
distinct with its exit preserved and no `UNPUBLISHED` state (22–25);
readiness re-evaluation locked (26); distinct audit actions, outbox events,
minimal payload and lifecycle-specific errors (27–32); APP2 audit and phase plan
corrected, DB0/DB2/DB3 reconciled, no historical report rewritten (33–36);
sequence unchanged (38); checker added with all four rejection proofs and a
false-positive guard (39–44); secret gate, OpenAPI, client, database, Figma,
dependencies and application source all clean (45–51); full quality passes (52);
commit split respected (53–55); tree clean and nothing pushed (57–58); no
downstream checkpoint started (59); no correction prompt authored (60).

### Q.1 Discovered and disclosed — not fixed here

**`DRAFT → ARCHIVED` has the same species of gap.** `APP2-B02` implemented
archive with `PRODUCT_ARCHIVABLE_STATES = [DRAFT]`, but LC-04 defines archive
only as `PUBLISHED → ARCHIVED` (`TR-LC04-02`); `DRAFT → ARCHIVED` is not a
defined transition either. B02's own comment is explicit that archiving a
`PUBLISHED` product was deferred to B03 because it would have to withdraw the
product from the storefront.

This gate adds **exactly one** transition, as instructed, and archive scope is a
separate Product Owner decision. It is recorded here so it is not rediscovered as
a surprise: whoever owns archive next must decide whether LC-04 gains
`DRAFT → ARCHIVED` or B02's archive is re-scoped. `pnpm check:lifecycle` does not
currently assert this, because asserting a transition nobody has approved would
fail the repository today.

---

## R. B03 implementation handoff

```text
APP2-B03-G01 = COMPLETE — DELIVERED_FOR_REVIEW
APP2-B03     = READY — NOT STARTED
APP2-A04     = BLOCKED_BY_APP2-B03
APP2-B04     = BLOCKED_BY_APP2-A04
APP2-T01     = ROUTED — NOT PLANNED_FOR_EXECUTION
```

What B03 may now rely on, and what it still owns:

- **Authority is closed.** `TR-LC04-05` `PUBLISHED → DRAFT` is canonical; the
  representability gate that blocked B03 now passes for all three operations.
- **Vocabulary is decided, constants are not written.** B03 adds the code-level
  audit actions, outbox event types and error codes to match §H–§J exactly. The
  documents are the authority they must satisfy.
- **Reason is not required** for publish or unpublish — B03 must not add a reason
  field to the request to satisfy the audit row.
- **Unpublish deletes nothing** and re-runs no readiness; publish re-runs all of
  it inside its own locked transaction.
- **Archive stays out of B03's unpublish path**, and `DRAFT → ARCHIVED` (§Q.1)
  remains an open authority question that B03 must not resolve by implementation.
- The `APP2-A03-C1` rule holds on the wire: a lifecycle refusal and a concurrency
  conflict must remain distinguishable domain codes, never one collapsed 409.
