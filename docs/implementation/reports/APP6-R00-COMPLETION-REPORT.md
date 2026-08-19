# APP6-R00 — Phase Entry Audit & Roadmap Reconciliation — Completion Report

## 1. Verdict

```text
APP6-R00 = COMPLETE
APP6 = AUDITED — NOT YET IMPLEMENTED

APP6_SCHEMA_DISPOSITION = MIGRATION_REQUIRED
DESIGN GATE             = DESIGN_REQUIRED_BEFORE_UI_ONLY
TRUE_PO_DECISION        = none
```

This checkpoint changed **documentation only**. No runtime source, no schema, no
migration, no generated artifact, no Figma node and no test was touched, and no
suite was run.

Full audit:
[`../audits/APP6_PHASE_ENTRY_AUDIT.md`](../audits/APP6_PHASE_ENTRY_AUDIT.md).

---

## 2. Repository baseline

```text
branch              production
entry HEAD          3d4c74e  docs(app5): record the X01 commit hash in its completion report
working tree        1 unrelated pre-existing change, preserved untouched:
                    ` D beginning_app_development_with_flutter_by_rap_payne.pdf`
APP5 closure commit 4da8947  reachable (git merge-base --is-ancestor → true)
APP5-X01            COMPLETE · PASS_WITH_FOLLOW_UPS · blocking follow-ups 0
```

Every frozen APP5-X01 value was **recomputed**, not assumed. No delta:

```text
OpenAPI        58 paths / 63 operations / 132 schemas
OpenAPI SHA256 ef5dc35884d4f38f7adac5164b6401971bceeda326f11cb27a35bf655cb1f243
migrations     35   latest 0035_add_app5_intake_provenance
APP5 HTTP ops  10
Figma APP_05   65 references, all APPROVED_FOR_IMPLEMENTATION
Figma APP_06   0 references
```

Generated-client state was not inspected beyond the committed OpenAPI artifact;
nothing was regenerated. The APP6-relevant Figma registry state is **empty** —
the single fact the design gate turns on.

A dirty tree was not treated as a blocker: the one change is a deleted PDF
unrelated to APP6, left exactly as found.

---

## 3. APP5 handoff inventory

| Handoff | Classification |
|---|---|
| Eligible Custom Request states | `READY_AS_IS` |
| Request transition history + moderation notes | `READY_AS_IS` |
| Customer-owned-product branch (TBL-038) | `READY_WITH_APP6_EXTENSION` |
| Request-bound COP evidence/assets + private streaming | `READY_AS_IS` |
| Quantity lines | `READY_AS_IS` |
| Catalog request provenance / Design Session context | `PARTIAL` |
| `REQUEST_ACCESS` secure grant | `READY_AS_IS` |
| Grant-scoped customer status surface | `READY_WITH_APP6_EXTENSION` |
| Admin request queue / detail / moderation surface | `READY_WITH_APP6_EXTENSION` |
| Notification / outbox foundation | `READY_AS_IS` |

Nothing on this list needs rebuilding. The two `PARTIAL`/extension items that
carry real work are the submitted Design Session (no FK; APP6 must read it
defensively) and the COP branch (§6).

---

## 4. APP6 capability inventory

Condensed; the full four-part table is in the audit §5.

| Capability | Status | Current owner / evidence | Gap | Roadmap consequence |
|---|---|---|---|---|
| Design case root + current pointer | `DELIVERED` | `DesignCaseRepository`; APP5-B01 creates the case | — | Reuse |
| Formal design version creation | `PARTIAL` | Port + Drizzle adapter exist; no application, module or HTTP layer | Application + API + UI | `APP6-B08` |
| Document canonicalization + hash | `DELIVERED` | `packages/design-document` server subpath (ADR-DB1-012 §8) | — | `APP6-B09` |
| Single active review (INV-16) | `DELIVERED` | `uq_design_versions__case__sent_for_review` partial unique | — | `APP6-B09` |
| Preview / render artifact | `ABSENT` by design | Both preview columns nullable; no server raster pipeline | No server render | `APP6-G01` rules for the delivered APP3 SVG renderer + `APP3-S09` watermark |
| Admin access to the submitted design | `PARTIAL` | APP5-B04/B06 exist; no read of the session document | The digitizing source | `APP6-B07` |
| Customer secure review delivery | `ABSENT` | — | Everything | `APP6-B10` |
| Approval snapshot + exact-hash binding | `PARTIAL` | Repository + S24 immutability triggers; no update/delete offered | Application + API | `APP6-B11` |
| Step-up re-verification (GRD-003) | `DELIVERED` | `StepUpWindow` service (APP4) | — | Composed by `APP6-B11` |
| Agreement acceptance (GRD-008) | `PARTIAL` | Repository + snapshot child table exist; **no published content, no locked type set** | Data + ruling | `APP6-G01` + `APP6-B10` |
| Quotation root / version / lines / accept / expire | `DELIVERED` (persistence) | `QuotationRepository`, `QuotationModule` composed | No application, HTTP or UI layer | `APP6-B01`…`B05` |
| Exact money | `DELIVERED` | `numeric(14,2)`, strings across the port | — | Enforce in projections |
| Stale-version prevention (GRD-006) | `DELIVERED` (contract) | Port carries G-DB7-20 | Wiring + race proof | `APP6-B05` |
| Idempotency (`design.approve`, `quotation.accept`) | `DELIVERED` (infrastructure) | `idempotency_records` + the DB3 namespace bindings | Wiring | `APP6-B05`, `APP6-B11` |
| Secure grant / link / notification / outbox | `DELIVERED` | APP4 B01–B08, W01 | Event kinds only | `APP6-B03`, `B09`, `B11` |
| Admin and Storefront APP6 surfaces | `ABSENT` | — | Everything | `APP6-A01/A02/S01/S02` |
| Order creation, obligations, reservations | `OUT_OF_SCOPE` | — | — | APP7 / APP8 |

**The headline finding:** APP6's persistence layer is essentially complete — the
DB era shipped every table, every guard and all three repository ports, with
`QuotationModule` already composed. What is missing is the application layer, the
HTTP surface, the UI, and **one schema capability** (§6). Zero design-case,
design-version, approval or quotation operations exist in the 58-path OpenAPI
artifact.

---

## 5. Lifecycle and commercial ordering

`ADR-DB3-001` (Accepted, DEC-16) locks **Option A**:

```text
Request review → Quotation sent → Customer ACCEPTS quotation (secure flow)
→ Digitizing → Design review loop → Customer APPROVES exact design version
→ [APP7 boundary] Order created (AWAITING_DEPOSIT) + both payment obligations
```

Two delivered rules make this an execution-order constraint, not a preference:

- **GRD-005** — `DIGITIZING` is reachable only from `QUOTE_ACCEPTED`, with no
  admin override.
- **TR-LC08-01** — a design version may be created only when the request is in
  `{DIGITIZING, DESIGN_REVIEW}`.

**Consequence: no design version can exist until a quotation has been sent and
accepted.** The candidate checkpoint list delivered design review first, which is
unreachable at runtime. The roadmap reorders it.

The agreement ceremony sits **inside** design approval (GRD-008,
`DB3_AGREEMENT_ACCEPTANCE_SPEC.md`, `06 §141`), not in a separate flow.

APP6's five owned Custom Request transitions, and how each must be implemented:

```text
TR-LC11-05  UNDER_REVIEW   → QUOTED           system  projected inside APP6-B03's tx
TR-LC11-06  QUOTED         → QUOTE_ACCEPTED   system  projected inside APP6-B05's tx
TR-LC11-07  QUOTE_ACCEPTED → DIGITIZING       admin   commanded, GRD-005 — the only one
TR-LC11-08  DIGITIZING     → DESIGN_REVIEW    system  projected inside APP6-B09's tx
TR-LC11-09  DESIGN_REVIEW  → APPROVED         system  projected inside APP6-B11's tx
```

Four of five are `system`. No APP6 checkpoint may expose them as an
admin-selectable transition target, and none may reach those states other than as
a projection of the owning aggregate's committed event. Arbitrary direct
state-setting is explicitly rejected as APP6 workflow design.

No source conflict was found, so no precedence rule had to be applied and no
source is superseded.

---

## 6. COP design-version contradiction

**Still present at HEAD**, verified in source rather than carried from the APP5
report. `packages/database/src/schema/design/design-versions.ts` declares
`product_id`, `product_variant_id`, `product_side_id` and `embroidery_area_id`
`NOT NULL` with `restrict` FKs into Catalog — and
`packages/database/src/schema/design/approval-snapshots.ts` declares **the same
four columns `NOT NULL` again**. A COP request holds none of them: TBL-038
carries *"no `sku_id`, no stock columns and no price authority"*, INV-13,
*"**Never a SKU**"*.

A formal design version **is** required for a COP request: `TR-LC11-09`
(`→ APPROVED`) is guarded by *"TR-LC08-04 done"*, and `TR-LC08-04` creates the
Approval Snapshot that authorizes the order, the production job and the machine
file. There is no approval path that bypasses a design version.

Current schema cannot express it honestly — the only ways to satisfy four
`NOT NULL` Catalog FKs are to fabricate a product/variant/side/area or to point
at an unrelated real one, both of which turn a customer's garment into a catalog
SKU.

**The minimal forward direction is already in the repository.**
`order_items` models this exact branch: nullable `sku_id`, nullable
`customer_owned_product_id`, and one exactly-one `CHECK`. Applying that delivered
shape to `design_versions` and `approval_snapshots` is the conservative fix.
`production_specifications` is unaffected — it carries only denormalised names
and no placement FK.

Three semantics must be ruled before the migration, which is why an authority
checkpoint precedes it: what bounds a COP design (`design-engine`'s
out-of-bounds invariant is stated against an `embroidery_area_id` a COP does not
have); what `product_name` / `side_name` / `area_name` mean on a COP approval
snapshot; and what the freeze source is for COP dimensions, which are themselves
nullable on TBL-038.

```text
APP6_SCHEMA_DISPOSITION = MIGRATION_REQUIRED
```

`APP6-G01` (ADR) and `APP6-DB01` (forward migration) are ordered ahead of every
checkpoint that creates a formal COP design version, review or approval:
`APP6-B08`, `B09`, `B10`, `B11` and `APP6-E01`'s COP branch.

R00 wrote no SQL and no ADR.

---

## 7. Follow-up routing

| Follow-up | APP6 disposition |
|---|---|
| `FU-APP5-B04-DESIGN-PREVIEW-01` | **`ACTIVATE_IN_APP6`** → `APP6-B07` |
| `FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` | `KEEP_ROUTED_LATER` (with a forward rule bound in `APP6-G01`) |
| Customer-initiated cancellation (APP5 `S1` deferral) | `KEEP_ROUTED_LATER` → APP9 |
| `FU-APP5-S01-STUDIO-ENTRY-01` | `KEEP_ROUTED_LATER` → APP3 maintenance |
| `FU-APP5-S02-CONFIRMATION-SUMMARY-01` | `KEEP_ROUTED_LATER` |
| `FU-APP5-S02-MASKED-CONTACT-01` | `KEEP_ROUTED_LATER` |
| `FU-APP5-A01-FILTER-SET-CONFIRM-01` | `MAINTENANCE_OUTSIDE_APP6` |
| `FU-APP5-A01-QUEUE-COUNT-01` | `KEEP_ROUTED_LATER` |
| `FU-APP5-E01-STUDIO-RANDOMUUID-01` | `KEEP_ROUTED_LATER` → APP3 maintenance |
| `FU-APP5-E01-HOST-COOKIE-DEV-01` | `KEEP_ROUTED_LATER` → dev-environment maintenance |
| `FU-APP5-B01-APP3-SURFACE-GATE-01` | `CLOSED_BY_EXISTING_CAPABILITY` (closed at `APP5-X01` §6) |
| 44 `HISTORICAL_SCOPED` APP3 gates | `MAINTENANCE_OUTSIDE_APP6` — not swept |
| External notification provider selection | `KEEP_ROUTED_LATER` |

```text
BLOCKS_APP6_ENTRY = 0
```

**`FU-APP5-B04-DESIGN-PREVIEW-01` — explicit decision.** APP6 resolves it, and
not by coincidence. The gap is that no authorised read exposes the submitted
Design Session's document to an operator; APP6 must publish exactly that read
anyway, because `TR-LC08-01` creates the first design version *from what the
customer designed*. `APP6-B07` owns it: an Admin-guarded, request-bound read of
the submitted session document. No session secret is fabricated, no APP3 private
preview is called through a fake customer context, `submitted_session_id` stays
provenance rather than authorization, and missing session data renders as absent
rather than as an error.

**Customer-initiated cancellation.** ADR-DB3-002 places `S2` (quotation sent,
not accepted) and `S3` (accepted, before approval) inside APP6's lifecycle
window, and neither involves money. But every stage runs through the **LC-21
compensation saga**, which no phase has built, and `S3` conditionally releases an
inventory soft hold owned by APP8. `APP9-C03` / `APP9-B04` already own the
cancellation contract and backend. Building the saga inside a design and
quotation phase would import the entire stage matrix. **Deferred**, and no
cancellation control is added to any APP6 screen.

**APP3 `crypto.randomUUID` and the dev `__Host-` cookie** are not APP6 blockers.
`APP6-E01` drives Admin and grant-scoped customer screens; should a journey open
the Studio, the `*.localhost` trustworthy-origin harness that `APP5-E01`
delivered already works, so a narrow proven path exists.

---

## 8. Original checkpoint reconciliation

| Original | Action |
|---|---|
| `APP6-C01` — Design review Admin contract | `REMOVE` |
| `APP6-B01` — Design review backend | `SPLIT` + `REORDER` → `B07`, `B08`, `B09` |
| `APP6-A01` — Admin design review workbench | `KEEP` + `REORDER` → `A02` |
| `APP6-C02` — Customer review contract | `REMOVE` |
| `APP6-B02` — Customer review backend | `SPLIT` → `B10`, `B11` |
| `APP6-S01` — Secure design review screen | `KEEP` + `REORDER` → `S02` |
| `APP6-C03` — Quotation draft/version contract | `REMOVE` |
| `APP6-B03` — Quotation backend | `SPLIT` + `REORDER` → `B01`, `B02`, `B03` |
| `APP6-A02` — Admin quotation editor/history | `KEEP` + `REORDER` → `A01` |
| `APP6-C04` — Quotation delivery/response contract | `REMOVE` |
| `APP6-B04` — Quotation send/response backend | `SPLIT` (+ partial `DEFER` of the expiry sweep) → `B03`, `B04`, `B05` |
| `APP6-S02` — Secure quotation screen | `KEEP` + `REORDER` → `S01` |
| `APP6-E01` — Review-to-quote E2E | `REDEFINE` |
| `APP6-X01` — Phase closure | `KEEP` |

All fourteen candidates are audited; none is omitted. The four `C0n`
contract-only slices are removed because this repository publishes OpenAPI from
NestJS decorators inside the checkpoint that owns the endpoint — APP5 shipped ten
operations with zero contract-only checkpoints. No `MERGE` was applied.

The original §6 list is preserved as history in the phase document.

---

## 9. Missing checkpoints added

| Added | Why |
|---|---|
| `APP6-G01` — Review, approval and quotation authority | Cross-context rules spanning DSN, QUO, ORD, CNT and PLT with no database enforcement; the COP ADR and the agreement/policy dataset. Precedent: `APP5-G01`, `APP4-G01`, `APP3-G01…G07` |
| `APP6-DB01` — COP design context | `08-DATABASE-CHANGE-CONTROL` requires a dedicated database-change checkpoint, and §6 makes it unavoidable |
| `APP6-D01` — Design package | Zero `APP_06` Figma references exist; every UI checkpoint would otherwise block on a missing registry entry |
| `APP6-B06` — Digitizing transition | The only admin-commanded APP6 transition, and the exact seam where an unguarded widening would let an operator force `DIGITIZING` without an accepted quotation |

No speculative checkpoint was created.

---

## 10. Design gate

```text
DESIGN_REQUIRED_BEFORE_UI_ONLY
```

`FIGMA_DESIGN_INDEX.md` holds 27 / 32 / 76 / 54 / 70 references for `APP_01`
through `APP_05` and **zero** for APP6. The gate binds UI only — contracts come
from backend decorators, and APP3/APP4/APP5 all shipped backend checkpoints
independent of their design packages.

`APP6-D01` covers the Admin quotation workbench, the Admin design-case
workbench, the customer secure quotation and secure review screens, and the
stale/expired/revoked, loading, error, empty and responsive states. It gates
`APP6-A01`, `APP6-A02`, `APP6-S01` and `APP6-S02`.

**R00 performed no Figma mutation.**

---

## 11. Revised authoritative roadmap

| Order | Checkpoint | Purpose | Depends on | Main affected area | Predicted HTTP ops | Acceptance focus |
|---:|---|---|---|---|---:|---|
| 1 | `APP6-G01` — Review, approval and quotation authority | COP design-context ADR; the LC-11 subset and the projected-vs-commanded rule; idempotency bindings; agreement type set, quotation validity, deposit percent as policy data; SE-004/SE-005 mapping; the render ruling | APP5 closure | Docs + seed data | 0 | Every value traced to a named ADR or spec |
| 2 | `APP6-DB01` — COP design context | Forward migration on `design_versions` and `approval_snapshots` | `APP6-G01` | `packages/database` | 0 | A COP reaches a version and a snapshot with no fabricated catalog row |
| 3 | `APP6-D01` — Design package | One complete APP6 Figma package | `APP6-G01` | Figma + registry | 0 | Exact node IDs; PO approval before any UI checkpoint |
| 4 | `APP6-B01` — Quotation drafting | `TR-LC12-01` create header + version; add a version | `APP6-G01` | `apps/api` quotation | 2 | Exact money; a sent version is never repriced |
| 5 | `APP6-B02` — Quotation read | Version history and version detail with line items | `APP6-B01` | `apps/api` quotation | 2 | Historical versions remain explainable |
| 6 | `APP6-B03` — Quotation send | `TR-LC12-02` freeze + validity + pointer + supersede; projects `TR-LC11-05`; `SE-004` | `APP6-B02` | `apps/api` quotation + order | 1 | `QUOTED` only as a projection of the committed send |
| 7 | `APP6-B04` — Customer secure quotation read | Grant-scoped read of the current sent version | `APP6-B03` | `apps/api` quotation | 1 | Token in the body; one uniform `404` |
| 8 | `APP6-B05` — Quotation acceptance and rejection | `TR-LC12-03`/`06` under GRD-002/003/006; evidence; `quotation.accept`; projects `TR-LC11-06` | `APP6-B04` | `apps/api` quotation + order | 2 | CC-05 and CC-06 fail in transaction; duplicate accept replays |
| 9 | `APP6-B06` — Digitizing transition | `TR-LC11-07` under `GRD-005` on the APP5-B05 allow-list | `APP6-B05` | `apps/api` order | 0 new | The four `system` targets stay unreachable by command |
| 10 | `APP6-B07` — Admin submitted-design read | Authorised request-bound read of the submitted session document | `APP6-B06` | `apps/api` design | 1 | No fabricated session secret; absence is an empty state |
| 11 | `APP6-B08` — Design version authoring | `TR-LC08-01` DRAFT version, catalog or COP; version list | `APP6-DB01`, `APP6-B07` | `apps/api` design | 2 | A COP version carries no catalog row |
| 12 | `APP6-B09` — Send version for review | `TR-LC08-02` canonicalize + hash + GRD-004 + supersede; projects `TR-LC11-08`; `SE-004` | `APP6-B08` | `apps/api` design + order | 1 | CC-03 arbitrated by the partial unique index |
| 13 | `APP6-B10` — Customer secure review read | Exact version under review + the effective agreement set | `APP6-B09` | `apps/api` design | 1 | Exact version only; no storage key leaks |
| 14 | `APP6-B11` — Approval and revision request | `TR-LC08-04`/`03` under GRD-002/003/007/008; snapshot; `design.approve`; projects `TR-LC11-09`; `SE-005` | `APP6-B10` | `apps/api` design + order | 2 | CC-02/CC-04 fail in transaction; hash mismatch refused |
| 15 | `APP6-A01` — Admin quotation workbench | One screen: breakdown, totals, validity, history, send | `APP6-D01`, `APP6-B03` | `apps/admin` | 0 | Registry rows cited; money never a JS number |
| 16 | `APP6-A02` — Admin design-case workbench | One screen: evidence, version list, create, send, history | `APP6-D01`, `APP6-B09` | `apps/admin` | 0 | A second send surfaces `REVIEW_ALREADY_ACTIVE` |
| 17 | `APP6-S01` — Customer secure quotation screen | One screen: breakdown, validity, accept, reject, stale, expired | `APP6-D01`, `APP6-B05` | `apps/storefront` | 0 | Fragment stripped; a stale accept forces a re-read |
| 18 | `APP6-S02` — Customer secure design review screen | One screen: watermarked exact version, terms, approve, request revision | `APP6-D01`, `APP6-B11` | `apps/storefront` | 0 | No export path; the terms shown are the ones recorded |
| 19 | `APP6-E01` — Cross-layer acceptance | Quote → accept → digitize → version → review → approve, catalog **and** COP, plus the negatives | all preceding | E2E | 0 | Approved design and accepted quotation stay immutable |
| 20 | `APP6-X01` — Phase closure | Freeze baselines, disposition follow-ups, close R3, hand off to APP7 | `APP6-E01` | Docs | 0 | Zero blocking follow-ups, or each one owned |

Predicted new APP6 HTTP operations: **15**. Every backend slice is 1–2
operations — inside the 1–3 normal band and well under the hard maximum of five.
Every frontend slice is one screen. Nothing in the order duplicates an APP4 or
APP5 capability, and no lifecycle state is reached by direct command except
`TR-LC11-07`.

---

## 12. Validation ledger

| Command / check | Audit question | Result | Reruns | Why sufficient |
|---|---|---|---|---|
| `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain` | Baseline | `production` @ `3d4c74e`; one unrelated deleted PDF | 0 | Direct repository state |
| `git merge-base --is-ancestor 4da8947 HEAD` | Is APP5's closure commit reachable? | yes | 0 | Definitive |
| `git log --oneline -20` | Any post-closure change to an APP6-relevant artifact? | Only the two APP5 closure doc commits | 0 | Definitive |
| `node -e` count + SHA-256 over the committed OpenAPI artifact | Current API surface and hash | 58 / 63 / 132, `ef5dc35…` | 0 | Reads the artifact; **no generation run** |
| `node -e` path/method enumeration of the same artifact | Does any APP6 operation already exist? | **Zero** | 0 | Same artifact already in hand |
| `ls packages/database/migrations/*.sql \| wc -l` | Migration count and latest | 35, `0035_add_app5_intake_provenance` | 0 | Committed directory |
| Source read: `design-versions.ts`, `approval-snapshots.ts`, `custom-requests.ts`, `customer-owned-products.ts`, `order-items.ts`, `production-specifications.ts` | Is the COP contradiction present, and how far does it reach? | Two tables affected; `order_items` carries the fix pattern; `production_specifications` unaffected | 0 | Schema source is the authority on nullability |
| Source read: the three APP6 repository ports | Delivered versus absent | Full persistence, zero application/HTTP | 0 | The ports are the contract |
| `find` / `grep` over the six relevant API modules and `apps/api/src/platform/policy` | Which application capabilities exist? | §4 | 0 | Directory truth |
| Read: `ADR-DB3-001/002/004`, `DB3_LIFECYCLE_SPECIFICATIONS.md` (LC-07/08/11/12), `DB3_TRANSITION_GUARD_CATALOG.md`, `DB3_CONCURRENCY_SPECIFICATION.md`, `DB3_IDEMPOTENCY_SPECIFICATION.md`, `DB3_SIDE_EFFECT_OUTBOX_CATALOG.md`, `DB3_AGREEMENT_ACCEPTANCE_SPEC.md` | Ordering, guards, actors, races, namespaces, side effects | §5, audit §12 | 0 | Locked authority |
| `grep -oE "APP_0[0-9]+" docs/design/FIGMA_DESIGN_INDEX.md \| sort \| uniq -c` | APP6 Figma coverage | Zero `APP_06` references | 0 | The registry is canonical |
| Read: `APP5-X01-COMPLETION-REPORT.md`, `APP5_PHASE_ENTRY_AUDIT.md`, `APP5-A02-COMPLETION-REPORT.md` §E | Closure verdict and follow-up set | §7 | 0 | Accepted evidence |

**Broad regression was not run.** Explicitly: no `pnpm quality`, no
`quality:e2e`, no Jest, no Vitest, no Playwright, no API/DB integration suite, no
Storefront/Admin/worker suite, no all-workspace typecheck, no build, no OpenAPI
generation, no generated-client generation, no freshness chain, no SonarQube, no
benchmark, no load test, no APP2–APP5 E2E, no APP3 historical gate sweep and no
repository-wide aggregate.

No focused runtime command was needed: every audit fact was determined from
committed source, committed artifacts and accepted evidence. No successful
command was rerun on unchanged inputs. No documentation checker governs the
three files this checkpoint touched.

---

## 13. Files changed

Documentation only.

```text
A  docs/implementation/audits/APP6_PHASE_ENTRY_AUDIT.md
M  docs/implementation/phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md
A  docs/implementation/reports/APP6-R00-COMPLETION-REPORT.md
```

`14-IMPLEMENTATION-DECISION-REGISTER.md` was **not** updated: R00 made no
durable authority ruling of its own. Every ruling this audit surfaced — the COP
design context, the required agreement type set, the render policy — is routed
to `APP6-G01`, which is the checkpoint that registers them. No ADR was created,
per the same reasoning.

No runtime source, schema, migration, generated artifact, Figma node or registry
row changed.

---

## 14. Phase roadmap update

Written to
[`../phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md`](../phases/APP6-DESIGN-REVIEW-AND-QUOTATION.md)
§11.1:

| Checkpoint | Status | Note |
|---|---|---|
| `APP6-R00` | `COMPLETE` | Phase-entry audit and roadmap reconciliation |
| `APP6-G01` | `INCOMPLETE` | **Next** — review, approval and quotation authority; COP design-context ADR and the APP6 policy/agreement dataset |
| `APP6-DB01` | `INCOMPLETE` | COP design context — forward migration |
| `APP6-D01` | `INCOMPLETE` | One APP6 Figma package |
| `APP6-B01` | `INCOMPLETE` | Quotation drafting — 2 operations |
| `APP6-B02` | `INCOMPLETE` | Quotation read — 2 operations |
| `APP6-B03` | `INCOMPLETE` | Quotation send — 1 operation |
| `APP6-B04` | `INCOMPLETE` | Customer secure quotation read — 1 operation |
| `APP6-B05` | `INCOMPLETE` | Quotation acceptance and rejection — 2 operations |
| `APP6-B06` | `INCOMPLETE` | Digitizing transition — 0 new operations |
| `APP6-B07` | `INCOMPLETE` | Admin submitted-design read — 1 operation |
| `APP6-B08` | `INCOMPLETE` | Design version authoring — 2 operations |
| `APP6-B09` | `INCOMPLETE` | Send version for review — 1 operation |
| `APP6-B10` | `INCOMPLETE` | Customer secure review read — 1 operation |
| `APP6-B11` | `INCOMPLETE` | Approval and revision request — 2 operations |
| `APP6-A01` | `INCOMPLETE` | Admin quotation workbench |
| `APP6-A02` | `INCOMPLETE` | Admin design-case workbench |
| `APP6-S01` | `INCOMPLETE` | Customer secure quotation screen |
| `APP6-S02` | `INCOMPLETE` | Customer secure design review screen |
| `APP6-E01` | `INCOMPLETE` | Focused cross-layer acceptance |
| `APP6-X01` | `INCOMPLETE` | Phase closure |

The phase document also records the removed and superseded checkpoints rather
than deleting the original planning list.

---

## 15. Risks and true unresolved decisions

| # | Risk | Impact | Handling |
|---|---|---|---|
| 1 | COP design context | COP digitizing, review and approval are unrepresentable | `BLOCKED_FUTURE_CHECKPOINT` → `APP6-G01` + `APP6-DB01`, ahead of every dependent slice |
| 2 | No published agreement content and no locked required-type set, while `GRD-008` is a hard approval guard | Approval either cannot run, or records consent to terms the customer never saw | `APP6-G01` ships the type set and content as a dataset on the delivered `PublishApp4PolicyUseCase` precedent; `APP6-B10` returns the effective set with the version |
| 3 | No server-side design→raster pipeline; `preview_derivative_id` stays NULL | The customer review screen must render from the document itself | `APP6-G01` rules for the delivered APP3 SVG renderer + `APP3-S09` watermark. Reversible |
| 4 | `submitted_session_id` has no FK; a submitted session is protected only by a sweep predicate | Digitizing could find no source document | `APP6-B07` treats absence as empty, never as an error |
| 5 | `design_sessions.product_variant_id` is nullable while `design_versions.product_variant_id` is `NOT NULL` on the catalog branch | A catalog request without a variant could not produce a version | Low — APP5-S01 requires an explicit choice and `APP5-E01-03` proved it persists. `APP6-B08` must still fail loudly rather than substitute one |
| 6 | The `TR-LC12-05` expiry sweep has no APP6 owner | A sent quotation never flips to `EXPIRED` in the background | Deferred deliberately; `GRD-006` rejects an expired acceptance in transaction, so only the displayed status lags |

```text
TRUE_PO_DECISION = none
```

Every question resolves against a named ADR, specification, delivered schema or
delivered code. Risks 1 and 2 are authority *work* for `APP6-G01`, not choices
only the Product Owner can make.

---

## 16. Commits

```text
docs(app6): audit the phase entry and lock the APP6 execution roadmap
```

Documentation only; nothing pushed. The commit hash is recorded here after the
commit is created, following the established convention.

```text
c7d0b9b  docs(app6): audit the phase entry and lock the APP6 execution roadmap
```

---

## 17. Next checkpoint

```text
NEXT CHECKPOINT: APP6-G01 — Design review, approval and quotation authority
```

Not executed. The Product Owner reviews this report before authorizing it.
