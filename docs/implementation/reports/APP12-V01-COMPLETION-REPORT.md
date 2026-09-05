# APP12-V01 — Professional UI/UX Live Audit (Wave 1) — completion report

## A. Verdict

```text
APP12-V01 = COMPLETE

audit                = live, production-mode, Playwright/Chromium
storefront routes    = 20/20 accounted for   (13 audited · 7 WITHHELD_WAVE2)
admin routes         = 26/26 accounted for   (16 audited · 10 WITHHELD_WAVE2)
screens measured     = 137
screenshots          = 260
findings             = 32   (2 CRITICAL · 15 HIGH · 10 MEDIUM · 3 LOW · 2 OBSERVATION)
                       14 systemic · 18 local
                       4 FIGMA_DESIGN_DEFECT · 12 RUNTIME_DEFECT · 14 BOTH
                       1 ACCEPTABLE_RUNTIME_DEVIATION · 1 GOOD_AS_IS
runtime files changed= 0
Figma writes         = 0
CORRECTION_USED      = 0 / 1
```

The audit was performed as §1 redirects it: as a senior product designer looking
at the running shop, not as a Figma-conformance tester. Figma was treated as one
source of intent and is contradicted where it is wrong — four findings land on
the approved design rather than on the implementation.

**The headline judgement is in `evidences/v01/EXECUTIVE-UIUX-REVIEW.md` and is
not repeated here.** In one sentence: the product is functionally complete and
visually consistent, and it does not yet read as a shop — because the public site
still sells a Wave-2 commission service including a 40% deposit that no Wave-1
order uses, because the Product Detail fold contains no product, and because
there is no rule for what the one accent the palette has actually means — it is
"commit" on one Admin screen, "look up" on the next and nothing at all on the one
where money moves.

---

## B. H08 reconciliation

`APP12-H08` remains **COMPLETE — PO PASS**. Nothing in it was reopened, re-run or
re-argued. Three H08 artefacts were carried forward rather than duplicated:

| H08 asset | how V01 used it |
|---|---|
| `warmGateway` (`FU-APP12-H08-04`) | imported unchanged; V01 then found the same stall recurs **mid-project** after an idle gap, not only on a first connection, and added `gotoSettled` for every audit navigation |
| the S02/S03/A02 world modules | reused wholesale — V01 places real orders through the real checkout and drives the real operator, exactly as H08 does |
| the contrast ruling (`PO-APP12-004`, `FU-APP12-H08-02`) | re-observed as a before-state; **no fifth offending token found** (`V01-UX-031`) |

Two H08 follow-ups routed to this checkpoint are reconciled in §S.

---

## C. Audit methodology

Four Playwright projects over one environment, run by
`node packages/e2e-testing/scripts/run-e2e.mjs --app12-v01`:

```text
app12-v01-public-chromium         every anonymous Wave-1 Storefront route × 3 viewports
app12-v01-commerce-chromium       Product Detail → checkout → order → secure surface
app12-v01-admin-shell-chromium    the whole operator route tree × 2 viewports
app12-v01-admin-order-chromium    the six-state lifecycle, both screens at every state
```

Each audited screen produced two things at once, and the split between them is
the method:

- **A measurement** (`support/app12/v01-ux-probe.mjs`) — quantities only, never a
  verdict: characters in `main`, paragraph count and mean length, every visible
  text block with its size/weight/colour/position, the distinct typographic
  layers actually painted, every action with its box and paint, every control's
  box, every self-painting surface with its nesting depth, section gaps, and what
  fits above the fold.
- **A screenshot** — the full page, plus the fold where hierarchy lives above it.

Every classification in the audit was then made by a human reading the numbers
beside the picture. **No spec asserts a design opinion**: a test that failed on
"too many characters" would invent a threshold the Product Owner did not set and
would stop the run before the next screen was seen. The suite's only assertion is
that the screen rendered at all.

`gotoSettled` is the one addition worth naming. `APP12-H08` believed the E2E
gateway's `504` stall was confined to a project's first connection and solved it
with a warm-up. V01 lost a run to the same `504` on the **eighth** navigation of
an already-warmed project, after an idle gap while the previous screen was
measured — and because a 504 page measures and photographs perfectly, the failure
surfaced as "the products list links to nothing". Every audit navigation now
treats a proxy status as the environment answering, retries it, and records the
stall.

---

## D. Runtime and fixture authority

```text
mode            production — freshly built, `next start`, NODE_ENV=production
api             the real NestJS AppModule (built dist)
gateway         the real Nginx gateway on the real hostnames
database        disposable PostgreSQL, provisioned and dropped by the run
object storage  disposable MinIO, provisioned and dropped by the run
release state   CUSTOM_EMBROIDERY_RELEASE_ENABLED = false
```

Both applications were rebuilt before the audit (`pnpm build`, 12/12 tasks) so no
finding could be an artefact of a stale bundle — the fault `APP12-A02-C1` records
losing a live tier to.

**Content density.** §13 makes representative content mandatory, and
`seedS02Catalog` alone supplies one Product — a Discover grid with one card is
calm by accident. So a density fixture
(`support/app12/v01-density-fixture.mjs`, `v01-catalog-content.mjs`) layers a
plausible shop on top: 16 published Products across 6 categories with realistic
Vietnamese names, price spread, multi-axis variants, out-of-stock states and
three images each, plus 8 gallery entries. It also renames the two S02 fixture
rows — "Đồ thử nghiệm S02" would otherwise head every Product Detail screenshot,
and a critique of a page titled with a test string is a critique of the fixture.
The orders are not seeded: the run places them through the real checkout.

**Stated limits.** The images are deterministic synthetic gradients, so the audit
judges image scale, placement and aspect and never image *content*; composition
findings that depend on photography should be re-read once real product
photography exists. No adversarial strings were used, per §13.

---

## E. Full route inventory

The route tree is derived from `apps/*/src/app/**/page.tsx` on disk, not from a
remembered list, then joined to the screens the ledgers actually recorded. A
route present in the tree and absent from a ledger would show as
`MISSING — V01 AUDIT DEFECT`; there are none. Full table:
`evidences/v01/INVENTORY.md`, structured form `data/route-inventory.json`.

```text
Storefront   20 page routes   13 AUDIT_REQUIRED_WAVE1   7 WITHHELD_WAVE2
Admin        26 page routes   16 AUDIT_REQUIRED_WAVE1  10 WITHHELD_WAVE2
             (/healthz in both is a route handler, not a page route, and is
              excluded from both baselines — the counts match unchanged)
```

The seven withheld Storefront routes were opened at 1440 and photographed
answering the canonical not-found page, so that claim has a picture rather than a
sentence. Of the ten Wave-2 Admin routes, the four list screens were captured for
the record; the six detail routes below them have **no subject that can exist** —
`APP12-G02` §G traced every write that mints a custom request or a custom order
and proved both reachable only from withheld public operations. Wave-2 UAT is
`APP12-W01`…`W03`.

---

## F. Evidence directory

```text
evidences/v01/
  README.md                    runtime, content, naming, exclusions, hygiene
  EXECUTIVE-UIUX-REVIEW.md     the design judgement — the document to read first
  FINDINGS.md                  32 findings, severity then systemic order
  INVENTORY.md                 every route, classified, joined to what was captured
  AUDIT-LOG.md                 appended per cluster **during** the run (§44)
  storefront/<route>/<viewport>/<state>-{full,above-fold}.png
  admin/<route>/<viewport>/<state>-{full,above-fold}.png
  data/  findings.json · route-inventory.json · four measurement ledgers
```

Names are deterministic throughout — no Playwright-generated artefact names — so
a finding, a measurement and an image always join on `route/viewport/state`.

**The directory is not committed, and that is the repository's standing rule
rather than this checkpoint's choice.** `.gitignore` line 46 ignores `evidences/`
outright, and every earlier phase's evidence (`evidences/app_11`,
`evidences/app_12`, `evidences/app6-a02`) is likewise untracked. The audit
therefore leaves 260 screenshots, four measurement ledgers and five documents on
the working tree at `evidences/v01/`, exactly where §7 requires them, and the
checkpoint's committed record is this report plus the tooling that regenerates
the whole directory in one command. If the Product Owner wants the evidence in
version control, that is a change to the ignore rule and a decision of theirs —
it is flagged here rather than made silently by an audit.

---

## G. Storefront systemic findings

| id | severity | finding |
|---|---|---|
| `V01-UX-001` | CRITICAL | every public content surface sells a Wave-2 commission service, including a 40/60 deposit model no Wave-1 order uses — homepage, `/dich-vu`, the FAQ's payment answer, and the **published payment policy** |
| `V01-UX-002` | CRITICAL | the Product Detail fold contains no product: `h1` at y=1045, CTA at y=1494, **70 characters** above a 900px fold |
| `V01-UX-003` | HIGH | one filled button on the entire public site; section CTAs are painted identically to the card titles beside them |
| `V01-UX-004` | HIGH | the interface narrates its own limitations, in ten rendered sentences |
| `V01-UX-007` | HIGH | the focus ring is the error red, and on the payment surface it lands on the page title |
| `V01-UX-008` | HIGH | three of five header nav items are dead and so is the search box |
| `V01-UX-018` | MEDIUM | the content pages are documentation: no card, no button, 86–130 characters per paragraph |
| `V01-UX-022` | MEDIUM | a four-column marketing footer takes about a third of every transactional page |
| `V01-UX-023` | MEDIUM | the type scale does not step down at 390 |

---

## H. Admin systemic findings

| id | severity | finding |
|---|---|---|
| `V01-UX-003` | HIGH | three screens, three rules for the accent: the merge case gets it right, the merge selection paints two reversible lookups brand red while the irreversible commit is disabled-pale, and the order detail — where money is settled — has no filled button at all |
| `V01-UX-004` | HIGH | the same limitation narration, in six more places |
| `V01-UX-005` | HIGH | thirteen raw database enums in the queue's filter legend; `OrderItem` as a card heading; `(BR-021)`, `(BR-029)`, `(BR-030)` cited on screen |
| `V01-UX-032` | HIGH | a Wave-1 customer has no name anywhere in the Admin — an irreversible merge is decided between two masked addresses |
| `V01-UX-021` | MEDIUM | the two applications print the same instants in two ambiguous formats |
| `V01-UX-026` | MEDIUM | a table row's only action is a 16px-tall text link; a category name is not painted as a link at all |

Local, and high-value: `V01-UX-009` (the queue is 36% filter, its caption
describes a different product, two of eight columns carry nothing),
`V01-UX-010` (nine explanations against two actions beside a ~780×780 void),
`V01-UX-015` (the operator's landing screen is an empty placeholder that says the
features do not exist yet), `V01-UX-016` (the payment dialog is taller than the
viewport, opens with its own title clipped, and its scrim leaves the shell
undimmed), `V01-UX-020` (the merge screen's two participants are drawn
identically on an operation it calls irreversible).

---

## I. Content and copy findings

The audit's largest category, and the Product Owner's first concern. Measured
rather than asserted: `/dich-vu` carries 2,225 characters in 24 paragraphs
averaging 86, with **zero** painted actions; `/cua-hang` averages 109; the
returns policy 130; the FAQ shows 2,330 of its 2,490 characters above the fold.
The Admin order detail carries nine explanatory blocks against two actions.

Four worked `CURRENT / PROBLEM / KEEP / DIRECTION` rewrites are in
`EXECUTIVE-UIUX-REVIEW.md` §5 — enough to establish the pattern, and deliberately
not a rewrite of every sentence (§41).

Terminology defects, exact strings recorded: `tiền cọc` in four places on a
Ready-Made FULL order (`V01-UX-006`), "Đơn hàng đã tạo từ thiết kế được duyệt" on
a queue of ready-made checkouts (`V01-UX-009`), and "Xưởng đang đối chiếu" shown
before the customer has transferred anything (`V01-UX-013`).

---

## J. Hierarchy and typography findings

Every Storefront screen resolves to the same three layers:

```text
16px / 400 / #171717     primary body
14px / 400 / #6b7280     secondary body
16px / 500 / #9ca3af     tertiary
```

Primary and secondary differ by two points and one grey, so nothing carries
weight and every line arrives in the same voice — the "too many text tones are
visually too similar" the Product Owner reported, and it is a **scale** problem
rather than a contrast one. Three concrete collapses: the homepage's `<h3>` card
titles and its section CTAs are both 16px/500/`#171717`; four `<h2>` at 40px/600
give the homepage four equal focal points; and the Admin order queue paints
**thirteen** distinct layers with no dominant one — the highest count in the
audit.

---

## K. Colour and CTA findings

The full action matrix (§42) — sixteen rows, surface by surface, with current
label, current paint, intended priority, perceived priority and the problem — is
in `EXECUTIVE-UIUX-REVIEW.md` §7. Its conclusion is one sentence: **there is no
rule.** Filled means "create" on the catalog screens, "look up" on the merge
selection, "commit" on the merge case, and nothing at all on the order detail —
and the merge case is the proof that the right answer already exists inside the
product and is simply not applied.

Contrast: the four token pairs already on record are still the only ones, and no
component-invented colour was found (`V01-UX-031`). `PO-APP12-004`'s three plus
the fourth `FU-APP12-H08-02` named remain V02's, unchanged and un-relitigated.

---

## L. Widget and control-size findings

The full matrix (§43) is in `EXECUTIVE-UIUX-REVIEW.md` §8. The judgements:

```text
TOO_LARGE     Product Detail media block (1152×662, exceeds the fold alone)
              Product Detail h1 at 390 (40px, ~120 of 844px)
              Admin queue filter block (325px of a 900px fold, 15 checkboxes)
              Checkout footer (~430 of 1500px)
              Verify dialog (taller than 900px, title clipped on open)
TOO_SMALL     Admin queue row link (125×16 — under the 24px minimum)
              Transfer reference (12px mono — the string that must match exactly)
TOO_DENSE     Admin order-detail rail (9 explanations + 2 actions in 300px)
              Admin category list (37 painted surfaces, 2 deep, for 7 rows)
INCONSISTENT  Secure order cards (1152 / 700 / 365 / 1152px stacked)
WRONG_PAINT   Purchase CTA disabled state (574×44 at 1.5:1)
APPROPRIATE   Checkout summary card — the reference component for V02
```

---

## M. Spacing and card-density findings

`V01-UX-010` (a ~780×780 void beside the densest rail in the product),
`V01-UX-017` (six bordered callouts around one bank transfer, two of them two
deadlines stacked in different colours), `V01-UX-019` (four card widths down one
page), `V01-UX-026` (37 nested surfaces for seven category rows). The homepage
and Discover are **not** flagged: their whitespace is doing work.

---

## N. Responsive findings

Zero horizontal overflow at every audited viewport and state — and §34 is
explicit that this is not a pass. Beyond overflow: the desktop type scale is used
unchanged at 390 (`V01-UX-023`); nine gallery entries are 6.4 phone screens tall
against 2.5 at 1440, and Discover drops a grid column earlier than 1024 requires
(`V01-UX-024`); the full marketing footer follows the customer onto the checkout
and the payment surface at every width (`V01-UX-022`).

---

## O. State and terminology findings

`V01-UX-012` — the secure order page is headed "Thanh toán đơn hàng" in all nine
states, including the four where the payment is settled and the one where no
total exists yet. Confirms `FU-APP12-S03-01` live and widens it from three states
to five.

`V01-UX-013` — opening the transfer panel moves the surface to
`PAYMENT_UNDER_REVIEW`, so the customer is told the workshop is reconciling a
payment they have not made, on the one surface whose entire design brief is that
nothing a customer does may read as payment confirmed.

`V01-UX-006` — `tiền cọc` on a Ready-Made FULL obligation, in the dialog title,
the expectation label, the submit, the settled announcement **and** the evidence
empty-state, three centimetres from a box stating "Không có DEPOSIT/REMAINING".

`V01-UX-011` — the only outright runtime bug in the audit: the checkout's
"verify your contact" refusal is not cleared by the verification that satisfies
it, so the card shows the red refusal directly above the green "✓ Đã xác minh".

---

## P. Brand findings

The brand system itself is sound — the symbol, the wordmark, the restrained
palette and the type all read as intended, and the homepage hero is the best
expression of it in the product. What undercuts it is not design but publication:
three greyed header items and a dead search box on every route (`V01-UX-008`), a
footer that says the address and opening hours "will be updated" above an
invitation to visit (`V01-UX-027`), an unstyled English `Choose File` control on
the payment surface (`V01-UX-014`), and a value proposition that describes a
service the release cannot sell (`V01-UX-001`).

The retired-brand Admin login placeholder recorded as `FU-APP12-PO-BRAND-01` was
re-inspected: the login screen carries the current symbol and wordmark. Closed.

---

## Q. Figma defects

Four findings are the approved design's rather than the implementation's:

```text
V01-UX-002  the single-column Product Detail with an uncapped media block
V01-UX-010  the Admin order-detail rail, sized for the custom lifecycle
V01-UX-017  six approved callouts that were never composed together
V01-UX-018  a document template used for the commercial services page
```

Two more are shared (`BOTH_RUNTIME_AND_FIGMA`) because the copy was transcribed
verbatim from approved frames and the frames carry the Wave-2 promise:
`V01-UX-001` and `V01-UX-012`.

**Method limitation, stated rather than hidden.** The Figma desktop MCP server
did not connect during this checkpoint, so no node was opened directly. The
classifications rest on the frame provenance recorded in source — every copy
module in both applications transcribes its strings from a named node id and says
so — plus `FIGMA_DESIGN_INDEX.md`. That is documentary rather than visual
evidence and is labelled as such in `FINDINGS.md`. `FIGMA_WRITES = 0` regardless.

---

## R. Accepted runtime deviations

```text
V01-UX-028  no visible required marker on the checkout delivery fields
            — every field on the card is required, so four markers would be
              noise; aria-required carries the semantics. The implementation's
              reasoning is better than a literal marker. One sentence closes it.
—           a resolved merge slot replaces its own lookup form with the
            participant it found — cleaner progressive disclosure than the static
            two-column form, and the reason this audit's harness had to be
            corrected to follow it.
—           the QR panel is mounted once and placed by CSS rather than mounted
            twice and hidden, so there is one fallback sentence rather than two
            contradictory ones at different widths.
```

---

## S. Known follow-up reconciliation

Every follow-up §47 lists was re-inspected against the **current** runtime rather
than assumed:

| follow-up | current state |
|---|---|
| `FU-APP12-H08-01` — no visible required indication | **CONFIRMED, and agreed with.** `V01-UX-028` (LOW): the reasoning is sound; add one sentence, not four asterisks |
| `FU-APP12-H08-02` — a fourth contrast token | **CONFIRMED, unchanged.** Folded into `V01-UX-031`; no fifth token found |
| `FU-APP12-H08-03` — FULL verification says "tiền cọc" | **CONFIRMED and widened.** `V01-UX-006` (HIGH): five strings, not one, including a self-contradiction on the same screen |
| `FU-APP12-A01-03` — archived-state tone consistency | **NOT REPRODUCED.** The category list's published/archived states are distinguished by an outlined status pill consistent with the rest of the Admin. No finding raised |
| `FU-APP12-A02-C1-02` — payable-total preview vs server authority | **NOT REPRODUCED as a UX defect.** The Admin's "Tổng khách phải trả" matched the server's obligation exactly at every state of the live lifecycle. The *repetition* of that figure four times on one screen is folded into `V01-UX-010` |
| `FU-APP12-PO-BRAND-01` — retired-brand Admin login | **CLOSED.** The login screen carries the current symbol and wordmark |
| `FU-APP12-PO-BRAND-04`, `FU-APP12-H06-03` | **NOT REPRODUCED.** The brand system renders consistently across both shells at all audited viewports |
| `FU-APP12-H05-02/03/04` | out of V01's scope — performance, not composition; owned by their own follow-up |
| `FU-APP12-S03-01` — one heading for eight states | **CONFIRMED and widened** to five states as `V01-UX-012` (HIGH) |
| `FU-APP12-S03-02/04`, `FU-APP12-S01-01` | **NOT REPRODUCED as UX defects**; the delivered resolutions read correctly in the live surface |

De-duplication is deliberate: five of the ten resolved to "still true, and here
is the finding", four to "not reproduced", one closed.

---

## T. V02 candidate matrix

Grouped into themes so the Product Owner approves a small number of systemic
corrections rather than 31 local edits.

| theme | root issue | findings | scope | risk | expected proof |
|---|---|---|---|---|---|
| **WAVE-1 CONTENT TRUTH** | the public site describes a service the release cannot sell | `001`, `013`, `009` (caption) | copy + IA | low technically; needs PO copy authority | before/after of the four content surfaces; no "40%" or "đặt cọc" reachable from a Wave-1 page |
| **PURCHASE DECISION IN THE FOLD** | the product page's fold has no product | `002` | design + component | medium — changes an approved frame | above-fold capture at 1440/1024 showing name, price, variant and CTA |
| **CTA HIERARCHY** | there is no rule for what the accent means | `003`, `020`, `025` | shared component + token | medium | the action matrix re-measured: one filled primary per screen, on the consequential action |
| **CONTENT COMPRESSION** | absence rendered as body copy | `004`, `017`, `018` | copy | very low | character count per screen, before/after |
| **OPERATOR VOCABULARY** | enums and rule identifiers on screen | `005`, `006` | copy + one branch | very low | zero SCREAMING_SNAKE tokens and zero `(BR-xxx)` in rendered text |
| **ADMIN WORKBENCH DENSITY** | nine explanations, two actions, an empty half-page | `010`, `029`, `016` | design + copy | medium | the rebalanced order detail at 1440 and 1024 |
| **OPERATOR DECISION SPEED** | queue and dashboard answer no operator question, and no screen says who the customer is | `009`, `015`, `026`, `032` | copy + component | low | first-screen capture showing rows and counts above the fold |
| **AFFORDANCE AND STATE COLOUR** | focus is the error red; disabled is unreadable | `007`, `025`, `011` | token + SCSS + one runtime fix | very low | focus and disabled states captured on checkout and payment |
| **TRANSACTIONAL CHROME** | marketing shell on payment pages | `008`, `022` | design + component variant | low | checkout and secure order at 1440/390 with reduced chrome |
| **MOBILE AND GRID COMPRESSION** | desktop scale at 390; grids drop early | `023`, `024` | token + SCSS | low | page height and above-fold content at 390 and 1024 |
| **CONSISTENCY** | two date formats, mixed link colours | `021`, `026`, `019` | shared utility + SCSS | very low | one format across both apps |
| **ALREADY AUTHORISED** | the contrast tokens | `031` (`PO-APP12-004` + `FU-APP12-H08-02`) | token | low | the before/after measurement `PO-APP12-004` already asks for |

Twelve themes; `V02` should not attempt all of them. §U orders them.

---

## U. Top ten correction priorities

In `EXECUTIVE-UIUX-REVIEW.md` §12, with scope and risk per row. In order:

```text
 1  Wave-1 content pass                              001
 2  Bring the product into the product page's fold   002
 3  One button scale, assigned by consequence        003 · 020 · 025
 4  Delete the limitation narration                  004
 5  Fix the deposit vocabulary on Ready-Made         006
 6  Give focus its own token                         007
 7  Rebalance the Admin order detail                 010 · 029
 8  Make the order queue an operator tool            009 · 032 · 005 · 026
 9  Strip marketing chrome from transactional pages  008 · 022
10  Responsive type scale and grid                   023 · 024
```

Riding along, already authorised or trivially small: the `PO-APP12-004` contrast
tokens plus the fourth (`031`), and the checkout's stale-error runtime defect
(`011`) — a two-line fix and the only outright bug in this audit.

---

## V. Validation

Selected from `VALIDATION_GOVERNANCE.md` §3 for what this change actually is: new
**test/evidence tooling** and audit artifacts, with zero runtime source touched.

```text
pnpm --filter @embroidery/e2e-testing typecheck    PASS
pnpm --filter @embroidery/e2e-testing lint         PASS
pnpm --filter @embroidery/e2e-testing check:e2e    PASS  (boundary clean; 230 tests collect)
pnpm build                                          PASS  (12/12 — the audited build)
node packages/e2e-testing/scripts/run-e2e.mjs --app12-v01
                                                    PASS  21/21 across 4 projects, 3.7 min
```

**Not run, and not justified by this change**: the API, worker, Storefront and
Admin unit suites, the database integration tier, SonarQube, and any Figma gate —
no runtime source, no schema, no OpenAPI and no design registry entry was
touched. `check:e2e` is the control that matters here, and it is the one that
proves the new specs and projects collect and that no E2E code reached an
application `src`.

```text
node tools/check-report-secrets.mjs                 PASS  (673 documents)
node tools/check-file-size.mjs --paths <this change's files>
                                                    PASS  (50 files, 14 above review)
npx prettier --check <this change's files>          PASS
```

The run is indexed in `docs/implementation/SCOPED_COMMAND_INDEX.md` as
`CMD-E2E-APP12-V01`.

### One file-size note, stated rather than buried

`playwright.config.ts` stood at 389 lines before this checkpoint, and four more
projects with their reasoning would have carried it past the 400-line hard limit.
They were therefore extracted to `playwright.projects.v01.ts` and the config sits
at exactly 400 — the split is by checkpoint, which is how that file has always
been organised internally.

`scripts/run-e2e.mjs` is a different case and is reported rather than fixed. It
was **837 lines at entry** — already more than twice the hard limit — and this
checkpoint's mode wiring takes it to 931. Splitting the canonical orchestrator
every checkpoint's mode depends on is a real refactor of shared infrastructure,
unrelated to an audit-only checkpoint and forbidden by `CLAUDE.md` §7's "no
unrelated refactoring". The V01 block also deliberately matches the `--app12-h06`
block immediately above it, which resolves `sharp` and the S3 client the same
way. Recorded as **`FU-APP12-V01-01`**: `run-e2e.mjs` needs a per-mode split, and
it is the harness owner's, not this audit's.

---

## W. Hygiene

```text
runtime files changed            0
SCSS / design tokens changed     0
copy changed                     0
Figma writes                     0
API delta                        0
route delta                      0
migration delta                  0
schema delta                     0
shared-dev commercial residue    0   (disposable database only; dropped by the run)
G03 data created                 false
production deployed              false
pushed                           false
```

Everything added is test/evidence tooling under `packages/e2e-testing` plus the
`evidences/v01` artifacts and this report. `check:e2e`'s boundary control proves
none of it can reach an application bundle.

**Secret and PII hygiene** is enforced by three mechanisms rather than one
intention: `capture()` refuses to photograph a page whose URL still carries a
credential; the measurement probe counts characters and never returns free text,
and never reads an element `value`; and traces, video, HAR and failure
screenshots are off for every V01 project, so a *failure* cannot be the thing
that writes secret-bearing material to disk. Every contact, name, address and
merchant detail visible in the evidence is this run's synthetic value.

---

## X. Frozen baseline

```text
OpenAPI              125 / 138 / 278     unchanged
public operations    49                  unchanged
release matrix       28 DENY / 18 ALLOW / 3 SCOPE_GATED   unchanged
migrations           38                  unchanged
DB tables            79                  unchanged
Admin routes         26                  unchanged — and verified against the tree
Storefront routes    20                  unchanged — and verified against the tree
Figma                unchanged
```

The two route counts are the only baseline figures this checkpoint could move,
and V01 re-derived both from the App Router trees on disk rather than restating
them (§E).

---

## Y. Roadmap

```text
APP12-V01 = COMPLETE
CORRECTION_USED = 0 / 1
NEXT = APP12-V02 — Runtime Visual & Content corrections and live re-verification
```

`V02` is **not started**: no runtime file, no SCSS, no token, no copy string and
no Figma node was changed by this checkpoint. The locked roadmap is untouched at
38 checkpoints.
