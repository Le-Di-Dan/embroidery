# APP2-X01 — Phase Closure — Completion Report

- Checkpoint: `APP2-X01` (closure and evidence; no product behaviour)
- Phase: APP2 — Assets and Catalog Publication
- Verdict: **`PASS_WITH_FOLLOW_UPS`**
- Date: 2026-08-02
- Branch: `production`
- Preflight: `APP2_X01_PREFLIGHT = PASS`

Current authority for checkpoint status, commit chain, frozen artifacts and
routed follow-ups is [`APP2-CLOSURE-MATRIX.md`](./APP2-CLOSURE-MATRIX.md). This
report is the validation evidence for the closure run itself.

---

## A. Preflight and `APP2-E01-C1` entry

| Fact | Value |
|---|---|
| Branch | `production` |
| HEAD at entry | `377321fdb2f065b3d229c863b26cc29e9425d7d0` |
| Subject | `docs(app2): record publication journey correction evidence` |
| Files | `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` (2 ±), `docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md` (2 ±), `docs/implementation/reports/APP2-E01-C1-CORRECTION-REPORT.md` (580 +) |
| Tree | clean, tracked and staged |
| Ahead of `origin/production` | 70 at entry, 72 after closure |
| Pushed | no |
| `evidences/` | ignored, user-owned, untouched — not created, deleted, read, staged or claimed |

HEAD equalled the exact `APP2-E01-C1` evidence Commit D. No accepted commit was
amended, squashed, rewritten or replayed. No X01 or APP3 work predated closure.

Preflight gates, all at that HEAD:

| Command | Exit | Result |
|---|---|---|
| `pnpm check:secrets` | 0 | pass |
| `pnpm check:lifecycle` | 0 | pass |
| `pnpm check:pagination-authority` | 0 | pass |
| `node --test tools/check-pagination-authority.test.mjs` | 0 | 14 / 0 |
| `pnpm check:storefront-route-authority` | 0 | pass |
| `node --test tools/check-storefront-route-authority.test.mjs` | 0 | 21 / 0 |
| `pnpm check:storefront-product-detail-authority` | 0 | pass |
| `node --test tools/check-storefront-product-detail-authority.test.mjs` | 0 | 34 / 0 |
| `pnpm check:storefront-product-detail-correction` | 0 | pass |
| `node --test tools/check-storefront-product-detail-correction.test.mjs` | 0 | 19 / 0 |
| `pnpm check:figma-design-index` | 0 | 86 IDs / 86 node rows / 11 tables |
| `node --test tools/check-figma-design-index.test.mjs` | 0 | 31 / 0 |
| `pnpm check:openapi` | 0 | artifact hash unchanged |
| `pnpm check:api-client` | 0 | generated tree up to date |
| `pnpm db:check:manifest` | 0 | pass |
| `node --test tools/smoke-app2-e01-publication-production.test.mjs` | 0 | 42 / 0 |
| `pnpm quality` | 0 | `# pass 344 / # fail 0` |
| `git diff --check` | 0 | clean |

---

## B. Closure scope and method

The canonical checkpoint set was derived from current phase authority — the
phase plan §6.1 map, the roadmap APP2 row, the traceability matrix and the 44
APP2 reports on disk — and then **verified against Git**, not against the
reports' own prose. Where a report omits its own self-hash, the hash was read
from `git log`. No hash in the matrix was inferred.

Nothing outside the allowed scope was touched. Commit A changed four documents,
three tool files and one `package.json` script. No `apps/**`, runtime package,
OpenAPI document, generated client, migration, Figma artifact, infrastructure
file, dependency or lockfile entry changed.

No production defect was discovered during closure, so nothing had to be blocked
and routed to an owning checkpoint.

---

## C. Canonical checkpoint matrix

| Measure | Value |
|---|---|
| Canonical checkpoints (parents, incl. `APP2-X01`) | **30** |
| Matrix rows (parents + correction rows) | **45** |
| Correction rows | **16** |
| Checkpoints with a blocking status | **0** |
| Checkpoints missing an evidence commit | **0** |
| Rows naming a report that does not exist | **0** |
| Rows with an abbreviated or invalid hash | **0** |

Full per-checkpoint rows: [`APP2-CLOSURE-MATRIX.md` §1](./APP2-CLOSURE-MATRIX.md).

Two entry gates that began as blocks are classified as **gates**, not
corrections, because that is what they were: `APP2-S01-G01` cured
`BLOCKED_BY_STOREFRONT_DISCOVER_ROUTE_DECISION` and `APP2-S02-G01` cured
`BLOCKED_BY_UI03_RECONCILIATION`, each after an attempt that changed zero files.
`APP2-B01-G01` and `APP2-B02-G01` likewise closed entry blockers. Misfiling any
of them as a correction would inflate the correction count and hide the fact
that the block worked.

---

## D. Bounded Git chain

| Fact | Value |
|---|---|
| APP2 entry commit | `8643431b420d28b6eb8458bb3a87c936ca803280` — `docs(app2): audit assets and catalog publication entry` |
| `APP2-E01-C1` evidence (entry HEAD) | `377321fdb2f065b3d229c863b26cc29e9425d7d0` |
| Commits in the phase range | **94** |
| Closure Commit A | `bcb810f829175c22e47467474b37e9d4d5c6f628` |
| Ahead of origin after closure | 72 |

Of those 94: **90** are checkpoint implementation/decision/correction/evidence
commits (45 pairs), and **4** are not. Each of the four is disclosed by an
accepted report:

| Commit | Subject | Disclosed by |
|---|---|---|
| `5dcde4b695cb28a31c096826360048d9b9301511` | `chore: add evidences/ to .gitignore` | `APP2-A03-C1` §L.1 |
| `7e3e4987cda5f4cd63c7a0ca1af9d889c5f3d54d` | `fix(admin): make the product form's exits work` | `APP2-A03-C1` §L.1 |
| `2d921513132039db57a61dd42863cfded4036412` | `fix(admin): show the product form's actions only when there is a change` | `APP2-A03-C1` §L.1 |
| `b7df24f2e8572db411f3cf0cd561a125f28c4c02` | `docs(security): forbid writing .env and require asking for secrets` | `APP2-A04-C1`, `APP2-T01`, `APP2-B04` |

**No accepted commit was amended.** No checkpoint carries an unreported commit.
No duplicate implementation exists. No forbidden `C2` exists.

---

## E. Correction-policy reconciliation

Every correction in the phase is exactly one implementation commit (C) followed
by one evidence commit (D), and every delivered implementation has an evidence
commit. Two departures from "at most one correction per checkpoint" are stated
plainly rather than reinterpreted:

1. **`APP2-DEC-STORAGE` carries C1 *and* C2.** Both were reviewer-directed and
   accepted at the time, before the one-correction rule was tightened. This is a
   historical fact of the phase. Recording it is the point; a closure that
   quietly renamed one of them would be falsifying the record it exists to
   preserve.
2. **`APP2-I02-FD1` is a final verification, not a second correction.**
   `APP2-I02-C1` is marked `SUPERSEDED_BY_FINAL_PROCESS_PROOF` because the
   process-isolation proof it claimed was actually completed by `FD1`.

The checkpoints ruled out by name — `APP2-A03-C2`, `APP2-A04-C2`, `APP2-B02-C2`,
`APP2-B04-C2`, `APP2-T01-C2`, `APP2-S02-C2`, `APP2-E01-C2`, `APP2-D04` and
`APP2-S01-C1` (`NOT_APPLICABLE`) — have no matrix row, no report on disk and no
commit in range. `pnpm check:app2-closure` fails if any of them appears.

---

## F. Decisions

Each is present once and locked:

| Decision | Locked value | Enforced by |
|---|---|---|
| Q-01 pagination | `KEYSET` (ADR-DB5-001 R10) | `pnpm check:pagination-authority` |
| Discover route | `/kham-pha` (IMP-D038) | `pnpm check:storefront-route-authority` |
| S01 staged non-interactive cards before S02 | IMP-D038 | `pnpm check:storefront-route-authority` |
| Product Detail route | `/san-pham/[slug]` (IMP-D039) | `pnpm check:storefront-product-detail-authority` |
| Product Detail supported/deferred scope | IMP-D039 | `pnpm check:storefront-product-detail-authority` |
| Story measure | 640 / 640 / 342 | `APP2-S02-G01-C1`; authority checker |
| Not-found transport | `SAFE_STREAMED_NOT_FOUND` (IMP-D040) | `pnpm check:storefront-product-detail-correction` |
| Mobile band | 24px / 342px (IMP-D040) | `pnpm check:storefront-product-detail-correction` |

Runtime behaviour matches: the closure production run measured
`/kham-pha` and `/san-pham/{slug}` serving the Product, the mobile band at
`{"left":24,"right":24,"content":342}`, and the streamed not-found at
`{"measuredStatus":200,"approvedSurface":true,"noindex":true}`.

**No new business decision was created to record closure.**

---

## G. Design authority

| Screen | Implementation authority | Historical |
|---|---|---|
| APP2-S01 Discover | UI02 Discover Feed `208:2002` / `224:871` / `226:1038` (`REUSE_AND_SUPPLEMENT_ONLY`) | — |
| APP2-S02 Product Detail | `APP2-S02-G01` reconciled `529:2224` — desktop `529:2225`, tablet `529:2431`, mobile `529:2575` | UI03 draft `261:1290` = `HISTORICAL_DRAFT_SOURCE` |

Approval `FIG-APPROVAL-APP2-S02-G01-PRODUCT-DETAIL-001` remains valid. Registry
is **86 IDs / 86 node rows / 11 tables**, unchanged. No APP2 screen is
`WITHHELD` or `NOT_APPROVED` — the single `NOT_APPROVED` occurrence in the index
is inside a labelled "Reconciliation history for this row" paragraph describing
what the row used to read. No next-phase design was started. Figma was not
modified.

`pnpm check:figma-design-index` exit 0; `node --test
tools/check-figma-design-index.test.mjs` 31 / 0.

---

## H. OpenAPI and generated client

Recomputed at closure by `pnpm check:app2-closure`, from the artifacts:

| Artifact | Measured | Frozen |
|---|---|---|
| OpenAPI SHA-256 | `c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8` | identical |
| Paths / operations / schemas | 16 / 19 / 34 | identical |
| Generated client tree hash | `7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2` | identical |

The client hash uses `hashGeneratedTree`, the same function `pnpm
check:api-client` uses — not a second implementation that could agree with
itself while disagreeing with the gate.

Public Product and media DTOs expose no storage key, bucket, provider endpoint,
internal identity, status or `updatedAt`. `productMediaId` appears only inside
the opaque public media path. The closure production run re-measured this on
every public surface: `no storage key, bucket or provider endpoint reached any
public surface` and `no raw domain code, request id, stack or SQL reached any
public surface`, both PASS.

---

## I. Database and migrations

| Fact | Measured | Frozen |
|---|---|---|
| Migration files | 33 | 33 |
| Migration checksums | manifest match, exit 0 | frozen |
| Tables / columns / CHECKs | 78 / 833 / 190 | identical |
| Fingerprint | `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf` | identical |
| PostgreSQL | 16.14 | — |

`APP2-E01-C1` is what makes this reproducible rather than asserted: the closure
run created an **empty** disposable TLS PostgreSQL, applied all 33 committed
migrations with the repository's own runner (`pnpm --filter
@embroidery/database db:migrate` through the tracked `db-migrate` one-shot),
proved the history with `db:status` at `33 applied / 33 in repository`, and
verified the result with the seven committed DB6 checkers ending in
`db-fingerprint-gate.mjs`. No migration, snapshot or development dump was
created by closure.

---

## J. Production journey

`pnpm smoke:app2-e01-publication:production`, retries 0, one run at closure —
X01 may not change the E01 harness or any runtime source, so a second run would
re-measure an unchanged system.

```text
== summary: 121/121 passed ==   exit 0
```

Topology and evidence, all preserved:

| Element | Evidence |
|---|---|
| empty disposable TLS PostgreSQL, all 33 migrations | `33 applied / 33 in repository`; frozen fingerprint gate exit 0 |
| independent prerequisite bootstrap | categories from migration 0033; staff via the API bootstrap CLI; worker policy published as one immutable version |
| production API / worker / Admin / Storefront | all four `mounts: 0`, canonical `runner` images |
| temporary HTTPS gateway | `__Host-adm_session` measured `secure: true`, `httpOnly: true`, `sameSite: Strict` |
| private MinIO | disposable; not reachable through the gateway (404) |
| real upload and derivatives | one Asset from a real multipart upload; one READY unwatermarked `THUMBNAIL` and one `CATALOG_PREVIEW`; worker attempt `ASSET_PROCESSING` / `SUCCEEDED` |
| real Admin create / publish / unpublish | `DRAFT → PUBLISHED → DRAFT`, price `480000.00`, media order 0 |
| real Discover / Detail / media | Product in server-rendered HTML; real `THUMBNAIL` and `CATALOG_PREVIEW` bytes at `natural: 256` |
| republish and final unpublish | Asset, media, derivatives and slug all reused; ends `DRAFT` |
| Audit / Outbox balance | published 2 / unpublished 2 added, each side |
| `SAFE_STREAMED_NOT_FOUND` | `{"measuredStatus":200,"approvedSurface":true,"noindex":true,"productCanonical":false,"productMetadata":false,"productData":false,"rawCause":false}` |
| real media 404 after revocation | both previously live paths return HTTP **404** |
| zero residue | `{"residualImages":0,"residualContainers":0,"temporaryDirectoryRemoved":true}` |

`node --test tools/smoke-app2-e01-publication-production.test.mjs` — 42 / 0.

---

## K. Routes and public safety

| Fact | Value |
|---|---|
| Public routes | `/kham-pha`, `/san-pham/[slug]` |
| Public operations | `publicProduct_list`, `publicProduct_detail`, `publicProductMedia_get` |
| Not-found authority | `SAFE_STREAMED_NOT_FOUND` |
| Anonymous Admin access | still refused (`/login`) |
| Private object store through the gateway | 404 |

The measured HTTP 200 for the streamed not-found is Next 16.2.10 framework
behaviour for `notFound()` from a dynamic segment, accepted as IMP-D040. It is
recorded as measured and is never described as a 404; `check:app2-closure` fails
on any unlabelled line that calls it one.

---

## L. Follow-up inventory

**11 routed, 0 blocking, 0 ownerless, 0 falsely resolved, 0 silently dropped.**
9 APP2-owned, 2 inherited from APP1. Full rows with issue, target and reason:
[`APP2-CLOSURE-MATRIX.md` §2](./APP2-CLOSURE-MATRIX.md).

| ID | Status | Owner |
|---|---|---|
| FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01 | ROUTED — NONBLOCKING_FOR_A04 | Product Owner + APP2-B03 lifecycle authority |
| FU-APP2-PRODUCT-ARCHIVE-UI-01 | DEFERRED_PENDING_PRODUCT_OWNER_SURFACE_DECISION | Product Owner |
| FU-APP2-ADMIN-MEDIA-PLACEHOLDER-01 | DEFERRED — NONBLOCKING_FOR_APP2-B04 | APP2 Admin surface owner |
| FU-APP2-THUMBNAIL-01 | ROUTED_TO_APP2-T01 — superseded by ADMIN-MEDIA-PLACEHOLDER-01 | APP2 Admin surface owner |
| FU-APP2-PUBLIC-MEDIA-DIMENSIONS-01 | ROUTED — NONBLOCKING | APP2 public-contract owner |
| FU-APP2-STOREFRONT-CONTENT-BAND-01 | ROUTED — NONBLOCKING | APP1 shell owner |
| FU-APP2-DETAIL-NOT-FOUND-STATUS-01 | ROUTED — FRAMEWORK_TRACKING — NONBLOCKING_AFTER_C1 | framework tracking (Next.js) |
| FU-APP2-CATEGORY-MANAGEMENT-01 | DEFERRED_BEYOND_CATALOG_ALPHA | Product Owner |
| FU-APP2-PRODUCT-VARIANTS-SKU-01 | DEFERRED_BEYOND_APP2_CATALOG_ALPHA | Product Owner |
| APP1-FU02 | REPRODUCED — NONBLOCKING | APP0 / infrastructure E2E reliability |
| FU-APP1-SHELL-BRAND-TOUCH-TARGET-01 | ROUTED — NONBLOCKING_FOR_APP2-S02 | APP1 shell owner |

`APP1-FU02` is listed because it **reproduced during this closure** (§O). It did
not reproduce at APP1 closure, and recording it silently as "not reproduced"
would have been the easy and wrong answer.

No follow-up was implemented by `APP2-X01`.

### Preserved boundaries — not follow-ups

- **Publication Outbox stays `PENDING`.** No APP2 consumer owns
  `product.published` / `product.unpublished`; the closure run measured
  `{"published":{"PENDING":2},"unpublished":{"PENDING":2}}` and `DISPATCHED = 0`
  on both. The checkpoint that introduces a consumer owns the assertion change.
- **`DRAFT → ARCHIVED` remains unauthorized**, tracked by
  FU-APP2-PRODUCT-ARCHIVE-LIFECYCLE-01. Closure does not close it.

---

## M. Blocking verdict

| Question | Answer |
|---|---|
| Unresolved blocking checkpoint | 0 |
| Failed correction chain | 0 |
| Unauthorized C2 | 0 |
| Missing evidence commit | 0 |
| Frozen-artifact drift | 0 |
| Ownerless open blocker | 0 |
| Nonblocking gaps without an explicit owner | 0 |
| Production journey reproducible from repository state | yes — empty database, committed migrations, committed checkers |

`PASS_WITH_FOLLOW_UPS` is therefore the honest verdict, not a blocker in
disguise. Every follow-up above states an owner, a target and a reason it sits
outside closure, and the two preserved boundaries are recorded as boundaries.

---

## N. Closure checker

New: `tools/check-app2-closure.mjs` (393 lines) and
`tools/check-app2-closure-artifacts.mjs` (135 lines), split by responsibility —
the second owns exactly the question "do the artifacts still hash and count to
what the phase froze?". Wired as `pnpm check:app2-closure` and added to `pnpm
quality`. No dependency change; no generic Markdown parser — the two canonical
tables are parsed by their fixed column structure.

```text
pnpm check:app2-closure
check:app2-closure — APP2 COMPLETE — PASS_WITH_FOLLOW_UPS — DELIVERED_FOR_REVIEW
  (45 checkpoint rows, 11 routed follow-ups, 0 blocking; OpenAPI 16/19/34,
   33 migrations, Figma 86/86/11, SAFE_STREAMED_NOT_FOUND current,
   APP3 NOT STARTED)                                                   exit 0

node --test tools/check-app2-closure.test.mjs
# pass 30
# fail 0                                                               exit 0
```

The 30 regressions fail when a checkpoint reopens or becomes blocking, an
evidence report disappears, a hash is abbreviated, the checkpoint table is
emptied, a `C2` row or `C2` report appears, a follow-up becomes blocking or
loses its owner, the register empties, the verdict is dropped, a route or frozen
value drifts **in either direction** (a changed artifact under an unchanged
matrix is caught by mutating the real OpenAPI document), the streamed not-found
is called a 404, publication events are marked dispatched, or an APP3 report
appears. Historical and prohibitive prose stays legal, which is tested too.

---

## O. Quality and E2E

| Command | Exit | Result |
|---|---|---|
| `pnpm quality` | 0 | `# pass 384 / # fail 0` |
| `pnpm quality:e2e` (run A) | **1** | 14 passed, **1 failed** — `storefront.smoke.spec.ts` on WebKit: 504 Gateway Time-out, plus the `nosniff` chunk rejection it causes |
| `pnpm quality:e2e` (run B) | 0 | **15 passed** (13.3s) |
| `pnpm quality:e2e` (run C) | 0 | **15 passed** (13.2s); cleanup verified, disposable database dropped |

Run A's failure is reported rather than buried. It is the transient already
recorded as `APP1-FU02` — a WebKit 504 gateway flake — reproducing here for the
first time since APP1 closure. Playwright `retries = 0` in every run; runs B and
C are two consecutive clean greens, which is the same standard APP1-X01 applied
to its own single transient. APP2 changed no gateway, Compose or Storefront
runtime file, so this is an infrastructure characteristic under host load, not
an APP2 defect. It stays routed and nonblocking, with the reproduction recorded
in the closure matrix.

Package-level test totals inside `pnpm quality`: api 115 suites / 1468 tests,
worker 24 / 283, admin 46 / 519, storefront 25 / 231, persistence 9 / 112,
object-storage 5 / 150.

| Gate | Exit |
|---|---|
| `pnpm check:secrets` | 0 |
| `pnpm check:lifecycle` | 0 |
| `pnpm check:pagination-authority` · test 14/0 | 0 |
| `pnpm check:storefront-route-authority` · test 21/0 | 0 |
| `pnpm check:storefront-product-detail-authority` · test 34/0 | 0 |
| `pnpm check:storefront-product-detail-correction` · test 19/0 | 0 |
| `pnpm check:figma-design-index` · test 31/0 | 0 |
| `pnpm check:openapi` | 0 |
| `pnpm check:api-client` | 0 |
| `pnpm db:check:manifest` | 0 |
| `node tools/check-file-size.mjs` | 0 (38 files above the review threshold, none over the hard limit) |
| `git diff --check` | 0 |

---

## P. Closure production run

Recorded in §J: `121/121`, exit 0, retries 0, one run. Runtime identities were
all four canonical `runner` images with `mounts: 0` and `NODE_ENV=production`.

---

## Q. Cleanup and restoration

```text
development storefront restored                       {"exit":0}
development admin restored                            {"exit":0}
development worker restored                           {"exit":0}
development api restored                              {"exit":0}
development gateway restored without the TLS listener {"exit":0}
no temporary residue
  {"residualImages":0,"residualContainers":0,"temporaryDirectoryRemoved":true}
```

`pnpm quality:e2e` teardown additionally verified all E2E ports closed and the
disposable database dropped. The tracked Nginx and Compose files were never
modified. The developer's database and object store were never written.

---

## R. Frozen artifacts

| Artifact | Value | State |
|---|---|---|
| OpenAPI | `c2c3b874ba6a3a77680e373a67c288b43580e549090c3fbc6075efbd66b84ee8` — 16 / 19 / 34 | unchanged |
| Generated client | `7524fc918629c7b699ff732771940e05c962309be5eeefdfb53123bbe8ecf5a2` | unchanged |
| Database | 33 migrations / 78 tables / 833 columns / 190 CHECKs | unchanged |
| Fingerprint | `82864268c990990e4597c74cfc69b7b5a91b1bc5a2adbde098ab9ad43aed58cf` | unchanged |
| Figma | 86 IDs / 86 node rows / 11 tables | unchanged |

Every one was **recomputed** at closure, not copied forward.

---

## S. Commit A evidence

```text
bcb810f829175c22e47467474b37e9d4d5c6f628
docs(app2): close assets and catalog publication

 docs/implementation/10-MASTER-APPLICATION-ROADMAP.md              |   2 +-
 docs/implementation/11-TRACEABILITY-AND-STATUS-MATRIX.md          |   2 +-
 docs/implementation/phases/APP2-ASSETS-AND-CATALOG-PUBLICATION.md |  24 +
 docs/implementation/reports/APP2-CLOSURE-MATRIX.md                | 222 +
 package.json                                                     |   3 +-
 tools/check-app2-closure-artifacts.mjs                            | 135 +
 tools/check-app2-closure.mjs                                      | 393 +
 tools/check-app2-closure.test.mjs                                 | 362 +
 8 files changed, 1140 insertions(+), 3 deletions(-)
```

No X01 completion report, no application source, no generated artifact.

---

## T. Acceptance

| Criterion | Status |
|---|---|
| clean exact `APP2-E01-C1` entry | met (§A) |
| accepted APP2 history unchanged | met (§D) |
| no next-phase implementation | met (§V) |
| canonical checkpoint set derived from authority | met (§B, §C) |
| every checkpoint final with evidence | met (§C) |
| every correction exactly C/D | met (§E) |
| at most one correction per checkpoint | **disclosed departure**: `APP2-DEC-STORAGE` has C1 and C2, both historically accepted (§E) |
| no forbidden C2 | met (§E) |
| no missing report | met (§C) |
| exact full hashes and bounded Git chain | met (§D) |
| zero blocking checkpoint / follow-up | met (§M) |
| every nonblocking follow-up owned and sourced | met (§L) |
| publication Outbox and archive boundaries preserved | met (§L) |
| OpenAPI 16/19/34 and hash unchanged | met (§H) |
| client hash unchanged | met (§H) |
| database 33/78/833/190 and fingerprint unchanged | met (§I) |
| Figma 86/86/11 unchanged | met (§G) |
| UI02 / S02 design authorities correct | met (§G) |
| routes unchanged | met (§K) |
| `SAFE_STREAMED_NOT_FOUND` current | met (§K) |
| E01 migration regressions pass | met (42/0, §J) |
| one final E01 production run passes, retries 0 | met (121/121, §J) |
| dev topology restored, zero residue | met (§Q) |
| closure checker and regressions pass | met (30/0, §N) |
| `pnpm quality` and `pnpm quality:e2e` pass | met — quality 384/0; e2e green on runs B and C after one disclosed transient (§O) |
| no application / generated / schema / Figma / dependency / infra change | met (§B, §S) |
| two scoped X01 commits | met |
| complete report | this document |
| clean tree, `evidences/` untouched, nothing pushed | met (§A) |
| APP2 verdict `PASS_WITH_FOLLOW_UPS` | met |
| next phase NOT STARTED | met (§V) |

**Verdict: `PASS_WITH_FOLLOW_UPS`.** Two facts are disclosed rather than
claimed clean: the `APP2-DEC-STORAGE` double correction, and the run-A E2E
transient. Neither is a blocker; both are recorded because a closure that hides
them is worth less than one that does not.

---

## U. Final APP2 baseline

```text
APP2      = COMPLETE — PASS_WITH_FOLLOW_UPS — DELIVERED_FOR_REVIEW
APP2-X01  = COMPLETE — DELIVERED_FOR_REVIEW
```

Milestone **R1 Catalog Alpha achieved**: an operator can upload a real catalog
image, have it inspected and turned into derivatives, author a Product draft,
publish it, and see it anonymously on `/kham-pha` and `/san-pham/[slug]` with
real media — then unpublish it and watch every public trace disappear. That
whole path is reproducible from repository state alone with one command.

---

## V. Next-phase handoff

```text
NEXT_CANONICAL_PHASE = APP3 — Design Templates and 2D Design Studio
APP3 = READY — NOT STARTED
```

APP3 receives published products, validated assets, and the
publication/read-model patterns for templates and studio bootstrapping — plus
the two open boundaries in §L, which it must not assume closed.

No APP3 work was started, no APP3 report exists, no follow-up was implemented,
nothing was pushed, and no next-phase prompt was written.

---

## Addendum — `APP2-X01-C1` (2026-08-03): the Figma baseline is scoped, not counted

This report recorded the frozen Figma artifact as **86 registry IDs / 86 node
rows / 11 tables**. Those numbers were measured correctly and remain the true
size of what APP2 closure owned — but freezing them as *global totals* of
`docs/design/FIGMA_DESIGN_INDEX.md` was structurally wrong, and the dated record
above is left intact rather than rewritten.

The registry is **one shared, appendable document** that every later phase writes
into. A global total therefore made any unrelated, valid later addition a closure
failure — which is exactly what happened when the BRD0 logo work
(`2a5d3bf`) took the registry to 96/96/13 and broke `pnpm quality`. Worse, a
total was simultaneously *too weak*: deleting an APP2-owned row and inserting an
unrelated one in its place keeps the count identical and would have passed.

`APP2-X01-C1` replaced the total with the thing closure actually owns: the exact
**86-record APP2-owned subset**, transcribed mechanically from this commit
(`8b5f3b0279b1920babd05b52014af3b853f526c0`) into
[`APP2-CLOSURE-FIGMA-BASELINE.json`](./APP2-CLOSURE-FIGMA-BASELINE.json). Every
owned record must still be present, unique, in its original section and unchanged
across eleven authority fields, and the registry must stay internally consistent;
unrelated rows may be appended freely. Nothing about the APP2 closure verdict,
its checkpoints, its follow-ups or any other frozen artifact changed.

Evidence: [`APP2-X01-C1-COMPLETION-REPORT.md`](./APP2-X01-C1-COMPLETION-REPORT.md).
