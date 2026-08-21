# APP6-A02 — Admin Design-Case Workbench · Completion Report

**Checkpoint:** `APP6-A02`
**Screen:** Admin design-case workbench
**Route:** `/requests/{requestId}/design`
**Entry:** `19f17e3` (`APP6-A01-C1`), reachable from `HEAD = 0e22b49`
**Status:** `COMPLETE`
**Commit:** `7d031aa` (local only — nothing pushed)

---

## 1. Entry verification

| Check | Result |
|---|---|
| `19f17e3` reachable from HEAD | **yes** (`git merge-base --is-ancestor`) |
| Branch | `production` |
| Working tree at entry | **clean** (`git status --porcelain` empty) |
| OpenAPI operations at entry | **78** (71 paths / 163 schemas) |
| Equivalent exact-version detail operation already present | **no** — see §3 |
| `APP6-A01` / `A01-C1` | accepted, not reopened |

The entry probe confirmed the §5 unblock was genuinely required: the artifact
carried `adminCustomRequestDesignVersion_create`, `_list` and `_send` and
`adminCustomRequestSubmittedDesign_get`, and no operation returning a single
version's document, its review feedback or its approval evidence.

## 2. Figma authority

`FIG-APPROVAL-APP6-D01-PO-001`. **Live Figma was unavailable** — the connector
surfaced only `authenticate` / `complete_authentication`, so no design node could
be read. Per §2 the registry is sufficient authority, and all 13 rows were read
from `docs/design/FIGMA_DESIGN_INDEX.md` (lines 871–883), each
`APPROVED_FOR_IMPLEMENTATION` on file `BQwqV8GdfUIELvsQDB1UQE`, page `APP_06`,
route `/requests/{requestId}/design`. Layout conventions were taken from
`APP6-D01`'s completion report §4/§5 (240 px sidebar, 336 px rail wrapping below
1360, tables scrolling in their own frame, no separate mobile Admin product).

| Registry id | Node | Consumed by |
|---|---|---|
| `FIG-APP6-A02-DEFAULT-CATALOG-DESKTOP` | `692:3` | workbench default |
| `FIG-APP6-A02-EVIDENCE-ABSENT-DESKTOP` | `694:3` | honest source absence |
| `FIG-APP6-A02-COP-DESKTOP` | `694:111` | customer-owned branch |
| `FIG-APP6-A02-CREATE-VERSION-DESKTOP` | `695:3` | create-DRAFT dialog |
| `FIG-APP6-A02-SEND-REVIEW-CONFIRM-DESKTOP` | `695:138` | send confirmation |
| `FIG-APP6-A02-REVIEW-ALREADY-ACTIVE-DESKTOP` | `695:266` | reconciliation |
| `FIG-APP6-A02-SENT-FOR-REVIEW-DESKTOP` | `696:3` | awaiting customer |
| `FIG-APP6-A02-REVISION-REQUESTED-DESKTOP` | `696:113` | revision + feedback |
| `FIG-APP6-A02-APPROVED-DESKTOP` | `697:3` | approval snapshot |
| `FIG-APP6-A02-LOADING-DESKTOP` | `698:3` | loading |
| `FIG-APP6-A02-ERROR-DESKTOP` | `698:63` | load error |
| `FIG-APP6-A02-GATE-DESKTOP` | `698:97` | pre-digitizing gate |
| `FIG-APP6-A02-NARROW1280` | `698:143` | narrow reference |

Figma was **not mutated** and the registry is **unchanged**, so
`node tools/check-figma-design-index.mjs` was not run.

## 3. The PO-authorized contract unblock

Entry truth matched §4, so exactly one operation was added.

```text
GET /api/admin/custom-requests/{requestId}/design-versions/{versionId}
    → adminCustomRequestDesignVersion_detail
```

The operation id first minted as `adminCustomRequestDesignVersionDetail_detail`,
because the policy derives the domain from the class name. It was brought into
the accepted family through the `CONTROLLER_DOMAIN_KEYS` table — the seam that
exists precisely for a controller split for file-layout reasons inside one
published domain, and the same entry `APP6-B09`'s send controller uses. B08's and
B09's three accepted ids are untouched; the family now reads `_create`, `_list`,
`_send`, `_detail`.

### Read-only module boundary

`DesignVersionDetailReadModule` imports `IdentityModule`, `DatabaseModule` and
`CustomRequestDesignContextModule`, declares one controller and exports nothing.
What it deliberately does **not** hold is the point:

- **no `DESIGN_CASE_REPOSITORY`** — it carries `createVersion`, `sendForReview`,
  `recordReview`, `setCurrentVersion` and `supersede`, and constructing it also
  requires `PLACEMENT_HIERARCHY_PORT` and therefore `CatalogModule`. The read
  reaches AGG-10/AGG-11 through its own four-SELECT port instead, which is also
  what keeps `FU-APP6-B09-CASE-REPO-SIZE-01` closed — the 399-line AGG-10 adapter
  is untouched;
- **no `APPROVAL_SNAPSHOT_REPOSITORY`**, so nothing here can freeze an approval;
- **no `ContentModule`** — see the agreement note below;
- `DatabaseModule` is imported for the executor and does export
  `TransactionManager` and `OutboxEventStore`, but nothing composed here injects
  either: the adapter extends `DrizzleRepository` (whose only dependency is
  `DatabaseExecutor`) and the query holds one port.

The integration suite proves this structurally: booting only this module, a
`POST …/send` and a `POST …/design-versions` are **404 from the router**, not
refusals.

### Response

`data` carries the version's fields directly: `versionId`, `designCaseId`,
`version`, `status`, `parentVersionId`, `documentSchemaVersion`, `branch`, the
Catalog quartet (null on COP), both placement labels (null on Catalog), both
physical dimensions as strings, `current`, `sentAt`, `approvedAt`,
`documentHash`, `document`, `reviews[]` and `approval`.

- **Document** — the single generated `APP3-P01` `DesignDocument` component, by
  `$ref` through the `APP3-B08-C1` marker. One document component exists in the
  whole artifact; both governed schema versions (v1 Catalog, v2 COP) travel
  through it unchanged. Returned verbatim: no migration, no rewrite, no
  re-canonicalization on read.
- **`documentHash`** — the value `APP6-B09` stored at send, `null` on an unsent
  DRAFT. Nothing recomputes a digest for a response.
- **Feedback source** — `design_reviews.feedback`, read by an adapter that
  selects three columns (`outcome`, `decided_at`, `feedback`) and never
  retrieves `customer_id`, `grant_id` or `step_up_challenge_id`. No audit entry,
  outbox payload or request note is consulted.
- **Approval snapshot** — every field from `approval_snapshots` and its
  acceptance children. Proved frozen by a test that renames the live product
  *after* approval and asserts the response still reports the approved name.
  Contacts are masked once, in the application projection, using the delivered
  `maskContact` (the same cross-module use `notification` already makes of it);
  `ApprovalEvidenceView` has no field that could hold an unmasked value.
  `reverified` is the boolean the snapshot's committed step-up evidence reduces
  to — computed from the column rather than hard-coded, so a column later made
  nullable changes the answer.
- **Agreements** — `agreementType`, `contentHash`, `acceptedAt`. The
  human-readable **version integer is deliberately absent**: it lives on
  `agreement_versions` in AGG-21, and the only port reaching it
  (`AGREEMENT_REPOSITORY`) also carries `addVersion`, `publishVersion`,
  `setCurrentVersion` and `withdrawVersion` — the publication path, one injection
  from a GET. The content hash is what `GRD-008` binds acceptance to, so it
  identifies the accepted version exactly without reaching into another
  aggregate's mutable publication state from a card whose premise is frozen
  evidence.

### Authority

`Authenticated Admin → requestId → current_design_case_id → case (which must
name the request back) → versionId matched **within that case**`. No caller
supplies a case id and there is no global version lookup, so a foreign version is
unreachable rather than refused: `findVersion(caseId, versionId)` matches both
predicates and a foreign row returns `undefined`. Unknown and foreign both raise
`DESIGN_VERSION_NOT_FOUND` → **404**, with no `403` on the operation at all.
`Cache-Control: no-store`. No transaction, no lock, no audit, no outbox, no grant
work.

## 4. Contract delta

```text
operations   78 → 79        new operations = 1
paths        71 → 72        schemas 163 → 167
migrations   36 → 36        (none added by this checkpoint)
```

Semantic diff: `+ adminCustomRequestDesignVersion_detail`; **0** removed, **0**
moved; `+ DesignVersionDetailResponse`, `DesignVersionDetailReviewResponse`,
`ApprovalEvidenceResponse`, `ApprovalAgreementResponse`; exactly one
`DesignDocument` component; no public customer surface change. A graph walk over
the whole reachable response tree found none of 24 forbidden field names
(session secret, token, grant, step-up challenge, customer id, storage key,
bucket, provider URL, presign, preview hash/derivative, order, payment, deposit,
production job, audit, outbox).

One OpenAPI generation and one client generation were run, each once.

## 5. Frontend

`apps/admin/src/features/request-design-case/` — components / hooks / model /
services / styles, one production component per file, thin route at
`app/(protected)/requests/[requestId]/design/page.tsx`, existing protected shell
and single QueryClient, TanStack Query for all server state, curated generated
client only, no second server-state store.

- **Submitted Catalog source** — B07's request-bound document, rendered
  client-side as native SVG. `submittedDesign: null` is exposed as a distinct
  `absent` flag read from a **successful** response, so a failed read can never
  be mistaken for "there is no source", and no blank document is fabricated.
- **COP** — states that a customer-owned request has no Design Session by design
  and shows request evidence instead. Each image follows the APP5 protected-blob
  lifecycle (`requestId + assetId` → `Blob` → object URL → revoked on
  replacement/unmount, `gcTime: 0`, per-asset hook ownership). No presign, no
  storage key, no object URL in a route, query parameter or browser storage.
- **Version list** — B08's order, nothing sorted, filtered or hidden;
  superseded/void rows stay visible. `current` is read from the returned flag
  and labelled *"Bản mới nhất"*, never as anything about the customer; the
  version awaiting review is shown by its own status. The two are kept distinct
  in copy, in the model and in a test.
- **Exact-version selection** → the §3 read, keyed by request **and** version.
- **Create DRAFT** — append-only. The source is a discriminated union carrying
  the document it names, so the dialog cannot claim to copy v1 while sending v2's
  artwork. A revision copies the **exact predecessor's** persisted document,
  never "latest". Catalog sends `{ document }` and nothing else; COP adds the two
  labels and the envelope as numbers. Nothing assembles `requestId`,
  `designCaseId`, `branch`, a Catalog id, `status`, `version`, `parentVersionId`
  or `documentHash`.
- **Send** — bodyless, bound to the id the dialog was opened for, guarded by an
  `inFlight` ref, replay reported as replay, request context re-read afterwards
  because B09 may project `DESIGN_REVIEW`. The screen never claims to set it.
- **`REVIEW_ALREADY_ACTIVE`** — its own outcome, told apart by code (the one
  place a code is read and never rendered). No optimistic success, dialog
  closed, request + whole version tree re-read, reconciliation state shown, one
  exit. No supersede, no send-another, no select-latest, no retry.
- **States** — `SENT_FOR_REVIEW` read-only; `REVISION_REQUESTED` shows the
  customer's verbatim words and offers only a new DRAFT; `APPROVED` is immutable
  evidence. No approve/request-revision control exists anywhere, and no
  request-target selector at all.
- **Gate** — truthful for every state outside `DIGITIZING`/`DESIGN_REVIEW`; on
  `QUOTE_ACCEPTED` it **links to** the request detail where `APP6-B06` owns the
  transition rather than duplicating the control.

### "Mở trình số hoá" — reuse decision

`ENGINEERING_JUDGMENT = A02_LOCAL_DOCUMENT_EDITING`. The delivered APP3 Admin
Template editor has an equivalent model module, but `EditorStage` is coupled to
`ResolvedTemplateScope` — a Catalog-template concept a COP request has no
equivalent for — plus its own copy catalog and SCSS. §17 forbids deep-importing
another bounded feature, and hoisting the shared parts would change source
`APP3-A03` owns and pull its whole editor suite into this checkpoint's
validation set for a refactor that changes no behaviour.

So A02 composes over the **same public APIs**: `@embroidery/design-document`
(types, limits, controlled font registry, `validateDesignDocumentStructure`) and
`@embroidery/design-engine` (`buildElementGraph`, `resolveEffectiveTransform`).
There is no second schema, no second validator, no second schema-version
authority, no second geometry authority and **no second rendering engine** — the
stage is native React SVG, asserted by a source scan for `konva`/`fabric`/
`pixi`/`three`/`getContext(` across every feature file with comments stripped.
Element ids are document-local counters, never `crypto.randomUUID` (secure-context
only). No DST/PES, no stitch simulation, no production specification, and the
surface says so on screen.

Editing is a browser-memory copy; the only exit that persists is B08's create,
which appends a **new** DRAFT. Nothing writes to `localStorage`,
`sessionStorage` or IndexedDB, and no document is logged — both asserted by a
source scan.

## 6. `FU-APP6-A01-C1-REQUEST-STATUS-COPY-DUPLICATION-01` — CLOSED

Extracted `apps/admin/src/shared/presentation/request-status.ts`: the ten LC-11
labels, the neutral fallback, and nothing else — no transition table, no action
matrix, no ordering, no backend enum widening. `APP5-A02` and `APP6-A01` now
re-export from it (their component call sites are unchanged), the design-case
workbench consumes it, and the duplicate label blocks were removed from both copy
catalogs so a third source cannot drift back.

Focused compatibility proof, exactly the tests owning the changed imports:
`request-quotation-model`, `request-quotation-bootstrap`,
`custom-request-detail-render` — **93 tests, all passing**. Their assertions were
repointed from the deleted copy keys to the shared presenter, so they now assert
the shared vocabulary rather than a private copy of it.

`FU-APP6-A01-C1-REQUEST-STATUS-COPY-DUPLICATION-01 = CLOSED_BY_APP6_A02`.

## 7. Tests

| Suite | Count | Result |
|---|---|---|
| Exact-version detail **contract** (`…detail.contract.spec.ts`) | 16 | pass |
| Exact-version detail **integration**, real PostgreSQL | 22 | pass |
| A02 Admin **model** (`request-design-case-model`) | 39 | pass |
| A02 Admin **component** (`design-case-workbench`) | 29 | pass |
| Shared-status compatibility (3 existing files) | 93 | pass |
| **Total focused** | **199** | pass |

### Mutation proofs — five, and two of them found vacuous tests

The suites were confirmed to discriminate, not merely to be green:

1. **Ownership predicate removed** (`and(caseId, versionId)` → `versionId`) —
   the foreign-version test failed. ✅
2. **Contacts published unmasked** — the masking test failed. ✅
3. **Payload re-wrapped in `{ version: … }`** — six integration tests failed,
   including the new shape-pinning one. ✅
4. **Send `inFlight` guard removed** — **initially still green.** The test used
   `await user.click(…)` three times, and both `userEvent` and `fireEvent` flush
   React between clicks, so `disabled` had already applied by the second one. It
   proved nothing. Rewritten to dispatch three raw `MouseEvent`s in one
   synchronous run — the real double-click that reaches the handler one render
   before `disabled` — after which the mutation fails. ✅
5. **Revision built from the submitted source instead of the exact predecessor**
   — the predecessor test failed. ✅

A sixth vacuous test was caught by **ESLint**, not by running: the deep-import
guard still destructured `text` after the field was renamed to `code`, so it was
scanning `undefined`. Two more boundary guards were failing on their own
documentation (files that *state* "never `localStorage`", "no Konva") until the
scans were changed to strip comments — they now assert about code.

## 8. Browser acceptance — real staff session, `http://admin.embroidery.local`

Conducted in the first A02 attempt, not deferred. The operator credential was
requested once, used once to log in, and is not recorded here.

Two environment repairs were needed first, and both were pre-existing rather than
A02 defects:

- the Admin dev container had not picked up a new App Router segment (the known
  restart quirk) — restarted;
- **the dev database was two migrations behind** (34/36 applied). `0036`
  (`APP6-DB01`) adds `design_versions.customer_owned_product_id`, whose absence
  was making `APP6-B08`'s **delivered** list endpoint return `500` in dev.
  Applied forward-only via the database CLI inside the API container; `36/36
  up-to-date`. `.env` was never written and no secret was read: the container
  already holds `DATABASE_URL`.

Review data for all seven request states was seeded into the dev database
(`CR-A02-0001`…`0007`, ids prefixed `019fa202-`), because the dev database held
no request past `QUOTED` and therefore no design thread at all.

### 1440 — verified live

| Frame | Evidence |
|---|---|
| `692:3` default Catalog | source rendered client-side, 1 DRAFT row, panel `DRAFT`, hash absence stated, empty reviews, correct Vietnamese labels |
| `694:3` source absent | honest empty state; **no** error state and **no** fabricated preview |
| `694:111` COP | truthful copy, no Catalog fabrication, `blob:` object URL, no storage URL, `localStorage` empty |
| `695:3` create DRAFT | source line names its origin; Catalog read-only with no COP fields; COP shows the four fields and blocks submit with no source |
| `695:138` send confirm | names "phiên bản 2", focus inside dialog, fits viewport |
| `695:266` `REVIEW_ALREADY_ACTIVE` | **triggered live** by sending a DRAFT while an older version was in review; dialog closed, reconciliation shown, no constraint name, nothing written |
| `696:3` sent / awaiting | read-only, no re-send, no editing; also reached **live** by a real send that returned a server-computed hash and projected the request to `DESIGN_REVIEW` |
| `696:113` revision requested | feedback verbatim including a literal `<b>` rendered as text (no `<b>` element), line break preserved via `pre-wrap`, real stored hash, only the new-DRAFT CTA |
| `697:3` approved snapshot | frozen product name shown and the **live** name absent, real hashes, masked contacts, no grant/challenge/raw-contact leak, APP7 denial present, no editing controls |
| `698:63` load error | **live** 404 on a non-existent request: `role="alert"`, safe copy, no retry offered, no request id leaked |
| `698:97` gate | correct copy, no create/send controls, links to `APP6-B06`'s screen, no raw enum in any control |

The full **authoring → new version → send** round trip was exercised live: open
the digitizer on the exact document, add a layer, save as a new DRAFT (v2
created, history re-read, v1 no longer current), then send — v2 became
`SENT_FOR_REVIEW` with a hash the *server* computed and the request moved to
"Duyệt thiết kế" as a read fact.

**`698:3` (loading) — partial.** It renders and is asserted in the component
suite (loading shows, then the workbench, and the two never collapse), and it was
present at first paint, but it could not be *held open* in the browser for a
recorded observation: route interception is not available in this Playwright
toolset, pausing the API container was denied by the environment, and every
in-page `fetch` fixture is discarded by the hard navigation needed to re-enter the
pending state (a client-side return is served from the query cache, so
`isPending` is correctly false). This is recorded as a partial rather than
claimed as a pass — see the follow-up in §11.

### 1280 (`698:143`) — verified

Shell preserved; grid collapses to one column and the rail wraps **below** the
main column; the version table scrolls inside its own frame; dialogs fit within
both axes with focus trapped; **0 px** page horizontal overflow and **0**
elements wider than the viewport.

### Runtime review

```text
React errors             = 0
hydration errors         = 0   (no hydration markers in the served HTML)
console errors/warnings  = 0   on a fresh load after the fixes
secret material in URL / DOM / console = none
   (no session cookie value, grant, step-up challenge, session secret or
    storage URL in the DOM; clean URL; localStorage empty; sessionStorage holds
    only Next.js dev-tools debug channels, checked for design content)
```

### Defect found and fixed in the browser

**One, and it was mine.** The controller returned `data: { version: { … } }`
while `envelopeSchemaOf` published `data` **as** the version — so the generated
client read `data.documentHash` and found `undefined`. On screen: the
revision-requested panel rendered no feedback, no preview and claimed a sent
version had no hash.

Every suite was green through it. The contract spec only inspects the document
(which was right); the integration assertions read `.version.*` and so matched
the wrong runtime; the frontend fixture happened to be correct, which is why the
frontend needed no change at all. Fixed by unwrapping the controller — the
OpenAPI artifact is **unchanged**, confirming the contract always said the flat
shape. A shape-pinning integration test now asserts the exact key set on `data`,
and mutation proof 3 above shows it catches the regression.

## 9. Validation actually run

| Command | Changed input that justified it | Result |
|---|---|---|
| `pnpm --filter @embroidery/api typecheck` | new backend read module | pass |
| `pnpm --filter @embroidery/api exec jest --testPathPatterns=design-version-detail` | the new contract + integration specs | 38 pass |
| `pnpm --filter @embroidery/api openapi:generate` | the new GET (**once**) | 79 ops |
| `pnpm --filter @embroidery/api openapi:check` | the regenerated artifact | up to date |
| `pnpm --filter @embroidery/api-client generate` | the changed artifact (**once**) | 2 files |
| `pnpm --filter @embroidery/api-client check:generated` | the regenerated client | up to date |
| `pnpm --filter @embroidery/api-client typecheck` | curated exports added | pass |
| `pnpm --filter @embroidery/admin typecheck` | the new feature | pass |
| `pnpm --filter @embroidery/admin exec jest` (5 focused patterns) | A02 sources + the two changed status imports | 161 pass |
| scoped `eslint` on the A02 files | new/changed source | clean |
| `npx prettier --check` on every changed file | the change set | clean |
| `git diff --check` | the working tree | clean |
| `pnpm --filter @embroidery/admin build` | the new route + SCSS | compiled, route registered |
| Browser 1440 / 1280, real staff session | the whole screen | see §8 |
| database CLI `status` + `migrate` (dev) | dev DB two migrations behind | 36/36 |

**Deliberately not run, and why:** no repository-wide aggregate; B11 CC-02/04/16,
B10 secure review, B09 send race, B08 full authoring integration and B07 full
integration (none of their owned source changed — A02's fixtures live in their
own files precisely so this stayed true); `packages/design-document` (183) and
`design-engine` suites (package source unchanged); the full APP3-A03 editor suite
and APP3 Studio suite (no shared editor source changed); full API, full
repository, worker, Storefront, Playwright/E2E, DB global gates, migration
generation, the Figma checker (registry unchanged), APP3 historical gate sweeps,
and SonarQube.

Three pre-existing ESLint errors in `approve-design-version.use-case.ts`
(`APP6-B11` source, verified unmodified by this checkpoint) were left alone.

## 10. Files changed

**New — backend (10):** `design-version-detail.port.ts`,
`drizzle-design-version-detail.adapter.ts`, `design-version-detail.projection.ts`,
`read-design-version-detail.query.ts`, `design-version-detail-read.module.ts`,
`admin-custom-request-design-version-detail.controller.ts`,
`admin-design-version-detail.request.ts`, `admin-design-version-detail.response.ts`,
`…detail.contract.spec.ts`, `design-version-detail.integration.spec.ts` +
`design-version-detail-context.ts`.

**New — frontend (20):** the `request-design-case` feature (11 components, 6
hooks, 6 model files, 1 service, 1 stylesheet, `index.ts`), the route file, and
`shared/presentation/request-status.ts`.

**New — tests (3):** `design-case-workbench.test.tsx`,
`request-design-case-model.test.ts`, `request-design-case-fixture.ts`.

**Modified (16):** `app.module.ts`, `operation-id.ts`,
`design-version-authoring.errors.ts`, `design-version-http-errors.ts`, the two
generated client files, `api-client/src/index.ts`, `openapi.generated.json`,
`main.scss`, the two APP5-A02 model/copy files, the two APP6-A01 model/copy
files, and the three existing test files whose status import changed.

## 11. Follow-ups

**Closed**

```text
APP6-A02 exact-version Admin detail                        = CLOSED_BY_APP6_A02
FU-APP6-A01-C1-REQUEST-STATUS-COPY-DUPLICATION-01          = CLOSED_BY_APP6_A02
```

**Opened**

```text
FU-APP6-A02-LOADING-FRAME-BROWSER-OBSERVATION-01
  `698:3` is asserted in the component suite and renders in the browser, but was
  not held open for a recorded browser observation: route interception is absent
  from this Playwright toolset and pausing the API container was denied. Not a
  known defect — an unproven frame. Closeable by any pass with request
  interception available.
```

**Carried unchanged:** `FU-ADMIN-SHARED-DIALOG-01` (A02 carries its own dialog
shell rather than opening that refactor, per §32),
`FU-APP6-B10-AGREEMENT-ACTOR-01`, `FU-APP6-B08-P01-GATE-01`, `FU-APP6-DB01-01`,
`FU-APP6-B03-ORDER-AGGREGATE-SUITE-RED-01`,
`FU-APP6-B02-NULLABLE-OBJECT-TYPE-DEBT-01`,
`FU-APP6-B03-REQUOTE-AFTER-ACCEPTANCE-01`,
`FU-APP6-B01-APP4-POLICY-CHECKER-MIGRATION-COUNT-01`,
`FU-APP6-B01-CODE-GENERATOR-PROMOTION-01`.

## 12. Verdict

```text
APP6-A01 = ACCEPTED
APP6-A02 = COMPLETE

SCREEN = ADMIN DESIGN-CASE WORKBENCH
ROUTE  = /requests/{requestId}/design

D01 APPROVAL        = FIG-APPROVAL-APP6-D01-PO-001
A02 APPROVED FRAMES = 13 / CONSUMED   (12 verified live, 698:3 partial — §11)

REQUEST STATUS PRESENTATION = ADMIN-SHARED / THIRD MAP ABSENT
SUBMITTED CATALOG SOURCE    = B07 REQUEST-BOUND DOCUMENT
SUBMITTED SOURCE ABSENCE    = HONEST EMPTY
COP SOURCE                  = REQUEST EVIDENCE / NO DESIGN SESSION FABRICATION
COP CATALOG FABRICATION     = ABSENT

DESIGN VERSION LIST      = DELIVERED
EXACT VERSION DETAIL     = DELIVERED
EXACT VERSION DOCUMENT   = CONCRETE P01
REVISION FEEDBACK        = PERSISTED DECISION RECORD
APPROVAL SNAPSHOT READ   = FROZEN EVIDENCE

CREATE DRAFT     = B08
DRAFT HISTORY    = APPEND ONLY
REVISION SOURCE  = EXACT PREDECESSOR DOCUMENT
CATALOG BRANCH   = SERVER AUTHORITY
COP LABELS       = TRUTHFUL

MỞ TRÌNH SỐ HOÁ              = FORMAL DESIGNDOCUMENT AUTHORING ONLY
MACHINE DIGITIZING / STITCH  = ABSENT
SECOND RENDERING ENGINE      = ABSENT

SEND EXACT VERSION       = B09 / BODYLESS
SEND DUPLICATE ACTIVATION= BLOCKED (mutation-proved)
SAME-VERSION REPLAY      = RECONCILED
REVIEW_ALREADY_ACTIVE    = RE-READ / NO AUTO-SEND (proved live)

SENT_FOR_REVIEW   = READ ONLY
REVISION_REQUESTED= FEEDBACK SHOWN / NEW DRAFT ONLY
APPROVED          = IMMUTABLE SNAPSHOT
DIRECT DESIGN_REVIEW COMMAND = ABSENT
DIRECT APPROVED COMMAND      = ABSENT

SERVER RASTER / STORAGE LEAK    = NONE
LOCAL PRIVATE DESIGN PERSISTENCE= NONE

BROWSER 1440 = PASS (698:3 partial)
BROWSER 1280 = PASS
PAGE HORIZONTAL OVERFLOW = NONE
CONSOLE/HYDRATION ERRORS = NONE
SECRET LEAK              = NONE

NEW HTTP OPERATIONS = 1
OPENAPI OPERATIONS  = 79
DATABASE MIGRATION  = NONE
FIGMA MUTATION      = NONE

S01/S02/E01 = NOT STARTED
NEXT CHECKPOINT = APP6-S01
```
