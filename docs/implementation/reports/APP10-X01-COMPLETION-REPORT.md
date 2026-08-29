# APP10-X01 — Phase Closure and Final Authority Lock — Completion Report

Phase: **APP10 — Customer Operations and Communication**
Checkpoint: `APP10-X01` · Mode: DOCUMENTATION / CLOSURE
Entry condition: `APP10-E01 = PO PASS`
Date: 2026-08-29

---

## A. Final verdict

```text
APP10-X01            = COMPLETE
APP10                = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS  = 0
PHASE                = CLOSED
PO_DECISION_REQUIRED = NONE
```

`PASS_WITH_FOLLOW_UPS` rather than `PASS` because 30 nonblocking follow-ups
remain open, which is the APP5–APP9 convention for a phase that meets every exit
criterion while carrying classified debt. No follow-up blocks closure and none
blocks APP11.

X01 changed **no runtime code**. It is documentation only.

---

## B. Canonical checkpoint matrix

Ten canonical checkpoints, all complete. This matrix is the closure copy of the
single canonical status table in
`docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md` §12.

| # | Checkpoint | Capability | Status | Commit |
|---|---|---|---|---|
| 1 | `APP10-G01` | Phase-entry baseline & canonical roadmap audit | `COMPLETE` | documentation, folded into `df1d0bc` |
| 2 | `APP10-B01` | Customer profile & contact maintenance | `COMPLETE` | folded into `df1d0bc` |
| 3 | `APP10-B02` | Merge case lifecycle & consequence preview | `COMPLETE` | `df1d0bc` |
| 4 | `APP10-B03` | Merge execution & immutable event history | `COMPLETE` | `1f93d63` |
| 5 | `APP10-D01` | APP10 design package | `COMPLETE` / `PO APPROVED` | `08dfd09` |
| 6 | `APP10-A01` | Admin customer profile maintenance UI | `COMPLETE` | `f2fa01a` |
| 7 | `APP10-A02` | Admin customer merge workflow | `COMPLETE` | `a2e1845` |
| 8 | `APP10-I01` | Zalo/Messenger simple handoff | `COMPLETE` | `39ee62a` |
| 9 | `APP10-E01` | Customer operations cross-boundary acceptance | `COMPLETE` / **PO PASS** | `96d73d5` |
| 10 | `APP10-X01` | Phase closure and final authority lock | `COMPLETE` | this closure commit |

Retired candidates stay retired. `C01`, `C02`, `C03`, `C04` (REMOVE), the old
agreement `B03` and the duplicated notification checkpoints (ALREADY_DELIVERED by
APP6 and by APP4-B08/A01 respectively), and self-service `S01` (DEFER) are **not**
restored — this is the 15-candidate to 10-checkpoint disposition `APP10-G01` §E
locked, and X01 does not reopen it.

Corrections used in APP10: **none.** No checkpoint required a `-C1`.

---

## C. Final runtime authority

### C.1 Customer maintenance

```text
display name maintenance                    DELIVERED   (customers.display_name)
internal notes maintenance                  DELIVERED   (customers.notes)
promote an existing verified ACTIVE contact DELIVERED
deactivate a contact (soft)                 DELIVERED
contact creation                            NOT DELIVERED — deliberate
customer list / directory / search          NOT DELIVERED — deliberate
masking                                     AUTHORITATIVE
```

The writable surface is bounded to exactly two columns. `verified_at`,
`merged_into_customer_id` and `anonymized_at` have no member on any input type, so
no request shape can reach them. Promotion runs as one transaction over the
`CST-006` partial unique index and accepts only an owned, active, already-verified
contact; deactivation is soft and refuses the last verified or the primary
contact. Masking is authoritative at the boundary: `APP10-E01` case `E01-01`
searched whole raw response bodies for the raw values and for the keys
`tokenhash`, `codehash`, `pepper`, `normalizedvalue` and `displayvalue`, and found
none.

Contact identity is addressed by `contactId` and never rendered.

### C.2 Merge

```text
open / detail+preview / reject / execute    DELIVERED   (4 operations)
survivor and loser                          EXPLICIT — an operator names both
duplicate detection / scoring               NOT DELIVERED — forbidden by scope
business-profile conflict                   FAIL-CLOSED before any destructive write
ownership transfer                          ATOMIC — one transaction
ACTIVE loser grants                         REVOKED (never repointed — DB3 §4 step 4)
loser record                                TOMBSTONED via customers.merged_into_customer_id
frozen evidence                             UNCHANGED
merge-event sequence                        IMMUTABLE, append-only, one row per step
execute replay                              DUPLICATE-SAFE (ALREADY_EXECUTED)
```

The live/frozen split is per column, not per table, and is now recorded in the
schema file itself (`customer-merge-cases.ts`, corrected in `APP10-B03`, closing
`FU-APP10-G01-01`): `orders.customer_id`, `custom_requests.customer_id`,
`customer_contact_points.customer_id`, `business_profiles.customer_id` and
`assets.uploaded_by_customer_id` are repointed; `order_transitions`,
`custom_request_transitions`, `approval_snapshots`, `quotation_acceptances`,
`design_reviews` and `audit_events` keep their original `customer_id` and their
frozen contact copies. An order changes owner while that same order's transition
history does not.

The business-profile collision is checked under `SELECT … FOR UPDATE` **before**
any destructive write, so a refused merge destroys nothing.

### C.3 Admin UI

```text
/support/customer-access                      extended by APP10-A01  (APP4-A01 route)
/support/customer-access/merge                added by APP10-A02
/support/customer-access/merge/{caseId}       added by APP10-A02
```

`NEW_ADMIN_ROUTES = 2`. Both merge routes are sub-routes of the existing
customer-access support entry, so `resolveNavItemState` already answers `section`
for them and **APP10 adds 0 sidenav entries**; the Admin shell is unchanged.

### C.4 Storefront handoff — final runtime truth

```text
Zalo/Messenger        = simple external handoff
placement             = floating action dock / button, bottom-right
backend               = none
provider SDK          = none
network call          = none
configuration         = external configured URLs only
                        (NEXT_PUBLIC_ZALO_CONTACT_URL, NEXT_PUBLIC_MESSENGER_CONTACT_URL)
missing/malformed cfg = that channel safely omitted; both unusable -> group not rendered
new Storefront routes = 0
```

Authority:

```text
PO-DIRECTIVE-APP10-E01-I01-FLOATING-HANDOFF-001
```

`StorefrontContactHandoff` is rendered by `StorefrontShell` as a sibling of
`<main>`: `position: fixed`, bottom-right, `z-index: 90` — below `$z-drawer: 100`,
so an open mobile drawer's scrim covers it — two 56px circles stacked
`column-reverse` so Zalo sits nearest the thumb, 16px inset on mobile and 24px on
desktop with `env(safe-area-inset-*)`. The accessible name is real text inside the
link, not an `aria-label`; the channel mark is an `aria-hidden` initial, because
the design system holds no licensed provider artwork.

**The footer placement is historical, not current runtime truth.** The CTAs were
removed from `StorefrontFooter` entirely, so no URL is published twice per page.

Every `APP10-I01` boundary is unchanged and still asserted: configured URLs
verbatim with nothing appended, `target="_blank"` with `rel="noopener noreferrer"`,
absolute http(s) with a host and no credentials, `URL.href` rendered rather than
raw operator text, and no chatbot, embedded chat, provider SDK, webhook, inbox,
backend adapter or new route. Only the placement moved.

---

## D. E01 final acceptance

```text
APP10-E01                = PO PASS
CORRECTION_REQUIRED      = NO
JOURNEYS                 = 4
CASES                    = 11
PASSED                   = 11
FAILED                   = 0
BLOCKING_FINDINGS        = 0
PRODUCT_RUNTIME_DELTA    = ACCEPTED_PO_DIRECTED_REMEDIATION
```

| Journey | Scope | Cases |
|---|---|---|
| J1 | Masked customer resolution and representative bounded maintenance | `E01-01`, `E01-02` |
| J2 | Guarded merge — preview, business-profile conflict, atomic execution, replay | `E01-03`…`E01-06` |
| J3 | Notification inspection with recipient and provider redacted, and duplicate-safe replay | `E01-07`, `E01-08` |
| J4 | Unauthorized denial, and the external Zalo/Messenger handoff | `E01-09`…`E01-11` |

Eight of the eleven cases were **additionally** driven through the running
Docker/Nginx stack in a real browser via Playwright, against
`admin.embroidery.local` and `embroidery.local`, with a real `admin_sessions` row.
**That live verification was explicitly directed by the Product Owner and is
accepted**, overriding the E01 prompt's own "no browser automation" line. It is
what exposed the two defect classes in §E that no test suite could reach.

E01 is **reused as accepted evidence and was not re-executed by X01.**

Three scoped commands carry it, all indexed in `SCOPED_COMMAND_INDEX.md` §3:
`CMD-TEST-APP10-E01-API`, `CMD-TEST-APP10-E01-ADMIN` and
`CMD-TEST-APP10-E01-STOREFRONT`.

---

## E. PO-directed remediation accepted

The E01 prompt set `PRODUCT_RUNTIME_DELTA = 0`; six product files changed. All six
are **accepted PO-directed acceptance remediation, not scope drift**, and are
**retained** — X01 reverts nothing.

### E.1 Fatal SCSS defects — both applications were HTTP 500 at `HEAD`

`embroidery.local` and `admin.embroidery.local` returned **HTTP 500 on every
route**, including `/login` and `/healthz`. Sass halts at the first error, so each
app reported only one; a static sweep of every `styles.$var` against the tokens the
package defines, and every `styles.spacing(N)` against the approved base-4 scale,
found all six.

| File | Defect | Fix | Origin |
|---|---|---|---|
| `admin/…/customer-merge/styles/customer-merge.scss:73` | `$color-text-link` — never defined | `$color-action-primary`, the APP8 `job-page__back` precedent | `APP10-A02` |
| same `:180`, `:189` | `$color-text-inverse` — never defined | `$color-surface-primary`, the repository-wide precedent for text on a filled action button | `APP10-A02` |
| same `:472` | `spacing(20)` — off-scale | `spacing(24)` | `APP10-A02` |
| `storefront/…/_final-payment-tokens.scss:54` | `spacing(14)` — off-scale | `14px`, the documented-local-literal convention the file's own header prescribes | `APP9-S01` |
| `storefront/…/_final-payment-evidence.scss:163` | `spacing(20)` — off-scale | `tokens.$stack-gap` (20px), already defined in that feature | `APP9-S01` |
| `storefront/…/_final-payment-transfer.scss:107` | `$font-family-mono` — never defined | new `tokens.$mono-family` in the feature's own token file, not the shared package | `APP9-S01` |

Three of the six are APP10's own regression; three are inherited from `APP9-S01`.
No design change — the Storefront fixes preserve the approved measurements exactly.
`next/jest` mocks SCSS, so component tests never compile a stylesheet, and the
repository has no SCSS compile gate; `tools/check-file-size.mjs` scans
`.ts/.tsx/.js/.jsx/.mjs/.cjs` only. Recorded as `FU-APP10-E01-02`.

### E.2 Duplicate React keys — proven live on real merged-customer data

```text
Encountered two children with the same key, `EMAIL-a***@vidu-e01-live.test`.
```

`maskContact` is deterministic and lossy, so two addresses at one domain sharing a
first character mask **identically** — and a merge survivor holds precisely that
pair, because a merge exists when two records are the same person. Three lists
keyed on `kind + maskedValue` are rekeyed:

| File | Fix |
|---|---|
| `customer-access-support/components/customer-contact-panel.tsx` | to `contact.contactId`, which `APP10-B01` publishes here because it addresses two operations by it |
| `customer-merge/components/merge-participant-card.tsx` | to index; `APP10-B02` deliberately publishes no `contactId` on a merge participant |
| `custom-request-detail/components/request-customer-panel.tsx` | to index; same projection gap. APP5 surface, included because an APP10 merge is what makes it reachable |

Verified live after the fix: the survivor's card renders all four contacts,
including both identical EMAIL masks, with zero console errors.

### E.3 Floating handoff relocation

Directed during live acceptance and confirmed twice. See §C.4 for the delivered
runtime and §F for the design consequence. Retained.

---

## F. Final design authority

```text
APP10-D01              = COMPLETE / PO APPROVED
APPROVAL TOKEN         = FIG-APPROVAL-APP10-D01-PO-001
APP10 REGISTRY ROWS    = 41
  APPROVED_FOR_IMPLEMENTATION = 37
  REVIEW_REQUIRED             =  4   (the FIG-APP10-I01-* placement frames)
PAGE                   = APP_10   (reused — no new Figma file)
FIGMA NODES TOUCHED BY X01 = 0
```

`APP10-D01` remains completed and approved overall. The later PO-directed change

```text
I01 footer placement  ->  floating handoff dock
```

supersedes the D01 footer-placement decision **for I01 runtime behavior only**,
under `PO-DIRECTIVE-APP10-E01-I01-FLOATING-HANDOFF-001`. Nothing else in the D01
package is affected; the 37 Admin and specification rows keep their approval.

The four I01 frames — `FIG-APP10-I01-FOOTER-DESKTOP` (`842:3`),
`FIG-APP10-I01-FOOTER-MOBILE` (`842:48`), `FIG-APP10-I01-CTA-STATES` (`843:3`) and
`FIG-APP10-I01-HANDOFF-SPEC` (`843:44`) — draw the footer rectangles. Therefore:

- they are **historical / stale for placement**;
- `REVIEW_REQUIRED` with approval evidence cleared is **intentional**, and is the
  registry telling the truth rather than a defect;
- they **must not be used to revert runtime**; the runtime authority is the PO
  directive, not the frame;
- a future redraw should capture the floating dock and **supersede** them;
- the redraw is **nonblocking**, because the runtime presentation was approved
  directly by the Product Owner during live acceptance — what is pending is the
  drawing, not approval of the thing it would depict.

**No Figma approval is invented for a node that was not redrawn.** The redraw could
not happen during E01 — the `figma-desktop` MCP server was `ConnectionRefused` for
the whole session — and X01 modified no Figma artifact and no approval evidence.
Tracked as `FU-APP10-E01-01`.

`node tools/check-figma-design-index.mjs` **passes**: 491 registry ids, 491 node
rows, 22 registry tables, with canonical files, statuses, deep links and
cross-phase composites verified.

---

## G. Final HTTP inventory — 7 APP10-owned operations

```text
B01   +3   PATCH /api/admin/customers/{customerId}                                 adminCustomer_update
           POST  /api/admin/customers/{customerId}/contacts/{contactId}/primary    adminCustomerContact_promote
           POST  /api/admin/customers/{customerId}/contacts/{contactId}/deactivate adminCustomerContact_deactivate
B02   +3   POST  /api/admin/customer-merges                                        adminCustomerMerge_open
           GET   /api/admin/customer-merges/{caseId}                               adminCustomerMerge_detail
           POST  /api/admin/customer-merges/{caseId}/reject                        adminCustomerMerge_reject
B03   +1   POST  /api/admin/customer-merges/{caseId}/execute                       adminCustomerMerge_execute
A01/A02/I01/E01  +0   (frontend and acceptance only)
--------------------------------------------------------------------------------------------------
APP10_OWNED_HTTP_OPERATIONS = 7
```

Reconciled two independent ways, and they agree. Forward, from the phase baseline:
APP9 closure `108` to APP10 closure `115`; `115 − 108 = 7`, exactly the figure
`APP10-G01` predicted. And by enumeration: the seven operation ids above are all
present in the committed `openapi.generated.json`.

Reused APP4 operations are **not** counted. `adminCustomerSupport_resolve`,
`adminCustomerSupport_detail` and `adminCustomerSupport_grants` are `APP4-B07`,
consumed by APP10 screens but owned by APP4; the notification operations journey
J3 exercises are likewise APP4-B08 / APP4-A01.

---

## H. Final measurable baseline

Every figure below was measured during X01 from the committed artifacts, not
copied from `APP10-G01`.

```text
BRANCH                  production
X01 ENTRY HEAD          96d73d5   (APP10-E01)
X01 COMMIT              this closure commit
WORKING TREE            clean before X01; clean after the closure commit
PUSH STATE              NOT_PUSHED = true   (local is 122 commits ahead of origin/production)

OPENAPI_PATHS           106      (APP9 closure 100  ->  +6)
OPENAPI_OPERATIONS      115      (APP9 closure 108  ->  +7)
OPENAPI_SCHEMAS         232      (APP9 closure 222  -> +10)

MIGRATIONS              37       (unchanged; last 0037_add_app7_transfer_evidence_association, APP7)
APP10_OWNED_MIGRATIONS  0        -> APP10_SCHEMA_DISPOSITION = NO_MIGRATION_REQUIRED, as G01 predicted

ADMIN_ROUTES            23       (entry 21 -> +2, both APP10-A02)
STOREFRONT_ROUTES       12       (unchanged — I01 adds no route)

FIGMA_REGISTRY_IDS      491      (APP9 closure 450 -> +41, the whole D01 package)
APP10_FIGMA_ROWS        41       (37 APPROVED_FOR_IMPLEMENTATION + 4 REVIEW_REQUIRED)

APP10_OWNED_HTTP_OPS     7
CANONICAL_CHECKPOINTS   10       (all COMPLETE)

RUNTIME_DEPENDENCY_DELTA 0       (no package.json or pnpm-lock.yaml change since APP9 closure)
WORKER_DELTA             0       (apps/worker untouched for the whole phase)
```

Method, so a reviewer can repeat it: OpenAPI counted read-only from
`packages/contracts/openapi/openapi.generated.json` — paths enumerated, HTTP
methods counted per path, `components.schemas` keys counted; **the artifact was not
regenerated and the API client was not regenerated**. Migrations read from
`packages/database/migrations/meta/_journal.json`. Routes counted as `page.tsx`
files under each app's `src/app`. The Figma figure is the gate's own output, not a
grep.

**One reconciliation worth recording.** `APP10-G01` stated an entry baseline of
"495 Figma rows"; the gate reports 491 at closure, after APP10 added 41. The gate's
figure is authoritative and the two are consistent: `APP9-X01` recorded 450 gate
ids at APP9 closure, and `450 + 41 = 491`. G01's 495 came from a looser textual
count, not from the gate. No registry row was added or removed by X01.

The only persistence-layer change in the whole phase was a **comment** in
`packages/database/src/schema/customer/customer-merge-cases.ts` plus two barrel
exports in `packages/database/src/index.ts` — no DDL, which is why the journal is
unchanged at 37.

---

## I. Follow-up matrix

Every open APP10 item, classified exactly once. Duplicates recorded under two ids
across reports are merged here and both ids are named.

```text
BLOCKING     =  0
NONBLOCKING  = 30
CLOSED       =  4
TOTAL        = 34
```

### I.1 Blocking

**None.**

### I.2 Closed

| Id | Item | Closed by |
|---|---|---|
| `FU-APP10-G01-01` | The `customer-merge-cases.ts` file comment contradicted DB4 §7 / DB3 §4 on repointing | `APP10-B03` — the comment now states the per-column live/frozen split |
| `FU-APP10-B02-02` | The preview reported the loser's business profile but not the survivor's, so an execution could hit `uq_business_profiles__customer` | `APP10-B03` — the collision is a `FOR UPDATE` fail-closed check before any destructive write |
| `FU-APP10-I01-01` | `spacing(14)` in `_final-payment-tokens.scss` broke the Storefront bundle (inherited `APP9-S01`) | `APP10-E01` §E.1 |
| `FU-APP10-D01-04` | `admin-shell-nav.ts` section-active matching for the nested merge route | `APP10-A02` — verified; 0 sidenav entries added |

### I.3 Nonblocking — design and documentation

| Id | Item |
|---|---|
| `FU-APP10-E01-01` | Redraw the four `FIG-APP10-I01-*` frames as the floating dock and re-approve; the rows sit at `REVIEW_REQUIRED` until then. **Explicitly nonblocking for closure** — the runtime presentation was PO-approved live |
| `FU-APP10-D01-05` | The Storefront footer still carries no canonical company contact block (carried from `APP1-S01A`); I01 adds two external links and does not close that gap |
| `FU-APP10-D01-06` | Zalo/Messenger brand marks are unused because the design system holds no licensed provider artwork; licensed assets could be adopted without a layout change |
| `FU-APP10-I01-03` | The opening-text handoff `843:44` permits belongs on a page-level surface that already holds a public request or order code, not in a shared global affordance |

### I.4 Nonblocking — contract and API gaps

| Id | Item |
|---|---|
| `FU-APP10-A01-01` | `APP10-B01`'s refusals carry no business `code`: five causes share one 409. A01 classifies by re-reading the authority; stable codes would remove the second round trip and separate `CUSTOMER_MERGED` from a contact-state refusal |
| `FU-APP10-A02-01` | The same for `B02`/`B03`: three execute causes and three open causes each share one 409 |
| `FU-APP10-B02-03` · `FU-APP10-D01-02` | The rejection reason has no column and is durable only in `audit_events.reason`, so no read publishes it. It needs a `decision_reason` column — a migration, deliberately not taken in APP10 |
| `FU-APP10-D01-01` | `customer_merge_events` is immutable and complete but published by no HTTP operation; a real event timeline needs a new backend read |
| `FU-APP10-D01-03` | `AdminCustomerContactResponse` publishes no active/deactivated flag and the detail read omits deactivated contacts, so contact history is invisible |
| `FU-APP10-E01-03` | The merge participant card renders no `customerId`, and two customers' masked contacts can be byte-identical. When display names also collide — the situation that *produces* a merge case — an operator cannot tell the two cards apart. Needs a design decision plus, probably, publishing `customerId` on `MergeParticipantResponse` |
| `FU-APP10-A02-04` | There is no way to find an existing REQUESTED case for a pair except the URL of the open that created it; the duplicate-open conflict cannot link to it |
| `FU-APP10-B03-02` | A merged loser's `secure_access_grants` keep `customer_id = loser` — correct by DB3 §4 step 4, revoke and never repoint — so a survivor read does not list links the merged identity once held |
| `FU-APP10-B01-03` | `AdminCustomerSummaryPort` (APP5-B04) publishes no `contactId`; this is the projection gap behind two of the §E.2 index keys |

### I.5 Nonblocking — surfaces deliberately not built

| Id | Item |
|---|---|
| `FU-APP10-G01-02` | **No business-event notification is emitted anywhere.** The only producers are `verification.code` and the secure-grant link. `FU-APP9-B01-01` (SE-010 `payment.final-requested`) was routed here by `APP9-G01` §8 and is **not scheduled in APP10** — it needs a commerce owner |
| `FU-APP10-G01-03` | Customer shipping-fee acknowledgement UI (`BACKEND_READY / UI_DEFERRED`), routed here by `APP9-CLOSURE-MATRIX`. An order-surface debt, not a customer-operations one; recommend it return to a commerce phase |
| `FU-APP10-G01-05` · `FU-APP10-A02-03` | `business_profiles` has no Admin read or write surface, so an operator who hits the business-profile merge blocker has no in-product path to resolve it. No operation and no approved design exists for such a screen |
| `FU-APP10-G01-06` | Duplicate-candidate *detection* is permitted by DB3 §3 but forbidden by APP10 §5.4; the operator brings the evidence, and CST-005 already prevents the only automatic case |
| `FU-APP10-I01-02` | Production Zalo/Messenger URLs are not configured, so the dock is invisible in every environment. By design — the only step left is configuration |

### I.6 Nonblocking — tooling, schema mechanism and inherited debt

| Id | Item |
|---|---|
| `FU-APP10-E01-02` | **No SCSS compile gate exists.** Six fatal stylesheet defects reached `production` and took both applications down; `next/jest` mocks SCSS and `check-file-size.mjs` ignores `.scss`. A per-app `sass main.scss` check belongs in the scoped command index |
| `FU-APP10-G01-04` | CST-098 / CST-096 append-only and immutability **triggers** are documented but not built for `customer_merge_events` and `agreement_versions`. Inherited DB-phase gap; B03 relies on application shape, exactly as `inventory_ledger_entries` does |
| `FU-APP10-B01-01` | `CMD-CHECK-APP4-B07-CONTRACT` (7 failures) still describes the pre-APP10 world; four rules are superseded by B01 and two counts were already frozen. Reclassified `HISTORICAL_SCOPED`; repair is APP4 / tooling maintenance |
| `FU-APP10-B03-01` | `CMD-CHECK-APP4-B02` reports 74 failures (70 inherited at HEAD, 4 superseded by B03's merge execution). Same classification |
| `FU-APP10-B01-02` · `FU-APP10-B02-01` | 3 pre-existing `@typescript-eslint/no-unnecessary-type-assertion` errors in `approve-design-version.use-case.ts` (APP6). Verified present on a pristine tree |
| `FU-APP10-A01-02` · `FU-APP10-A02-02` | 1 pre-existing ESLint error in `apps/admin/test/components/request-quotation-bootstrap.test.tsx` (unused `UNKNOWN_REQUEST_STATUS_LABEL`, APP6) |
| `FU-APP10-A01-03` | `customer-access-support.scss` is 652 lines and grows with each checkpoint that extends the route; it needs a feature-wide styling split |
| `FU-APP10-B01-04` | `notes` is free text readable by any authenticated Admin and can accumulate PII; `CustomerRepository.anonymize` already sets it to `NULL`, so no new mechanism is missing |
| — | Storefront `/favicon.ico` returns 404. Observed live; cosmetic |
| — | Synthetic customers and one executed merge case remain in the **development** database from the live run. Not deleted: `customer_merge_events` and `audit_events` are append-only evidence tables |

---

## J. Validation

X01 is documentation and closure only. No implementation regression was rerun.

```text
FULL_MONOREPO_TEST = NOT_RUN
FULL_E2E           = NOT_RUN
E01_NOT_RERUN      = true
```

### J.1 Run

| Command | Scope | Result |
|---|---|---|
| `git status --porcelain -uall` | entry and exit hygiene | clean on entry; clean after the closure commit |
| `git rev-list --left-right --count origin/production...HEAD` | push state | local 122 ahead, 0 behind — `NOT_PUSHED` |
| `node tools/check-figma-design-index.mjs` | design registry integrity | **pass** — 491 ids, 491 node rows, 22 tables |
| `node tools/check-report-secrets.mjs` | every report, including the two X01 documents | see §J.3 |
| read-only count of `openapi.generated.json` | OpenAPI baseline | 106 paths / 115 operations / 232 schemas |
| read-only count of `migrations/meta/_journal.json` | database baseline | 37 entries, last `0037` (APP7) |
| `find … -name page.tsx` on both apps | route baseline | 23 Admin, 12 Storefront |
| `git diff --stat 644b2045..HEAD` on `package.json` / lockfile / `apps/worker` / `packages/database` | dependency, worker and schema delta | 0 / 0 / comment-only |
| `npx prettier --check` on the two X01 documents | docs formatting | see §J.2 |

### J.2 Prettier

Run on the two closure documents only. `CLAUDE.md` §9 forbids a repository-wide
aggregate, and no source file changed, so nothing justifies a broader run.

### J.3 The report-secret gate

The gate takes no file arguments, so it cannot be scoped to X01's own files. It was
run once, after both X01 documents were written. Its findings are the same
pre-existing prose heuristics that `APP9-X01` §21 and `APP9-G01`
(`FU-APP9-G01-01`) already record — inherited, nonblocking and unchanged — and
**neither X01 document adds one**. No credential, token or real contact value
appears in any APP10 document; every value in the E01 evidence is synthetic
(`*@vidu-e01-live.test`).

### J.4 Deliberately not run

```text
APP10-E01 acceptance suites (API/Admin/Storefront)  closure reuses accepted evidence; §12 forbids re-execution
all API / Admin / Storefront / worker tests         X01 changed no runtime code
B01…B03, A01, A02, I01 suites                       each proved its own behaviour; X01 asks a different question
full monorepo build                                 nothing was built
full E2E / Playwright                               X01 needs no running service and no browser
Docker / full stack                                 same
OpenAPI regeneration, API client regeneration       forbidden; both artifacts were read, not rebuilt
migration tests / db-manifest                       forbidden; the journal was read
Figma redraw or re-approval                         forbidden; the registry was read and gated
DB / payment / inventory / notification regression  outside the closure question
repository-wide ESLint or SonarQube                 no source file changed; CLAUDE.md §9 forbids an aggregate
APP10 closure-consistency checker                   none exists — tools/ carries check-app2/3/4-closure only,
                                                    and no generic phase-closure checker does
```

---

## K. Files changed by X01

```text
A  docs/implementation/reports/APP10-X01-COMPLETION-REPORT.md
A  docs/implementation/reports/APP10-CLOSURE-MATRIX.md
M  docs/implementation/phases/APP10-CUSTOMER-OPERATIONS-AND-COMMUNICATION.md   X01 -> COMPLETE, PHASE -> CLOSED
M  docs/implementation/10-MASTER-APPLICATION-ROADMAP.md                        APP10 -> CLOSED
```

Documentation only. **No runtime, application, persistence, worker, frontend,
schema, migration, OpenAPI, generated-client, test or Figma file was modified by
X01.** In particular, the accepted E01 remediation in §E — the six SCSS fixes, the
three duplicate-key fixes and the floating handoff — is retained untouched.

---

## L. Next phase

Canonical authority: `docs/implementation/10-MASTER-APPLICATION-ROADMAP.md` §3
dependency order and its phase table.

```text
NEXT_PHASE = APP11 — Gallery, Content, SEO and Store Presentation
PLAN       = docs/implementation/phases/APP11-GALLERY-CONTENT-AND-SEO.md
```

APP11 starts from a clean APP10 baseline: 115 OpenAPI operations, 37 migrations,
23 Admin and 12 Storefront routes, 491 Figma registry rows, a clean working tree
and 0 blocking follow-ups. Nothing in §I gates it.

The first APP11 checkpoint is its own phase-entry audit, which is where the two
routed-away items — `FU-APP10-G01-02` (business-event notification) and
`FU-APP10-G01-03` (shipping-fee acknowledgement UI) — should be re-dispositioned to
a commerce owner rather than carried silently forward.

---

```text
APP10-X01 = COMPLETE
APP10     = PASS_WITH_FOLLOW_UPS
BLOCKING_FOLLOW_UPS = 0
PHASE     = CLOSED
```
