# APP5 — Pre-E01 Debt Audit

**Not a checkpoint.** No checkpoint was created, and `B08` / `D02` / `S03` are
not in the roadmap. One minimal correction was made under existing approved
authority; everything else is carried.

Date: 2026-08-17 · Branch: `production` · Scope: the seven open APP5 follow-ups.

---

## Classification

| Follow-up | Classification | Evidence | Action |
|---|---|---|---|
| `FU-APP5-S01-STUDIO-ENTRY-01` | `BLOCKING` (corrected here) | `grep -rn "yeu-cau" apps/storefront/src` returns only the two route files and the S01→S02 hand-off constant: **no surface anywhere linked to `/yeu-cau/moi`**, so the whole APP5 submission journey was reachable only by typing the URL. The approved header already carries the *Đặt thêu* (`commission`) IA item, held at `route: null` by `storefront-navigation.ts` with the explicit rule that "real routes and `href`s are added by the phases that own each area". APP5 owns that area. | **Corrected minimally**: routed the existing approved `commission` item to `/yeu-cau/moi`. No new CTA, no new frame, no new route. Residual — the Studio's *catalog-branch* entry (a "request this design" control on an APP3 surface with no approved frame) — stays open under the same id. |
| `FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` | `NONBLOCKING_CARRY` | Confirmed real: `embroidery-api.schemas.ts:1199` publishes `CatalogRequestSubjectResponseVariantColorName = { [key: string]: unknown } \| null`, `:1483` the same for `customerVisibleReason`. **19** such aliases exist in the generated schemas and **25** `nullable: true` decorators in `apps/api/src` are candidates. Runtime is correct — the server sends strings; the S02 boundary narrows with `typeof value === 'string'`, which is also the honest check for a field the server may omit. | Carry. A correction spanning 19 generated aliases plus regeneration of `openapi.generated.json` and the client is a repo-wide schema cleanup, explicitly forbidden as "minimal" (§4). It does not prevent E01: consumers compile and guard today. |
| `FU-APP5-B04-DESIGN-PREVIEW-01` | `NONBLOCKING_CARRY` | `request-subject-panel.tsx:25,72–77` renders `designSessionId` as labelled provenance and states plainly that no authorized Catalog design preview exists for this surface. No invented image, no dead control. | Carry. A preview needs a new authorized Admin port — a new endpoint, forbidden as minimal, and an APP6-era decision. |
| `FU-APP5-S02-CONFIRMATION-SUMMARY-01` | `NONBLOCKING_CARRY` | `/yeu-cau/da-gui` holds a display-only code and nothing else. Rendering the approved *"Bạn đã gửi gì"* panel needs a lookup keyed on that code — the exact unauthenticated surface `APP5-G01 §5` forbids. The customer reads the same data through the secure link, grant-scoped, via `APP5-B03`. | Carry. Adding it would violate a locked authority, not fill a gap. |
| `FU-APP5-S02-MASKED-CONTACT-01` | `NONBLOCKING_CARRY` | No authorized public read publishes a contact. The confirmation names the verified contact without reproducing it (`custom-request-confirmation-copy.ts:62` — *"tới liên hệ bạn đã xác minh"*), and the status bar keeps the half of `661:8` that B03 does publish (`accessExpiresAt`). | Carry. A masked contact would require a new backend field on a public read; the fallback is truthful and privacy-preserving as it stands. |
| `FU-APP5-A01-FILTER-SET-CONFIRM-01` | `NONBLOCKING_CARRY` | `custom-request-queue-filters.ts` implements status (with the server-echoed triage default) and subject-kind, both URL-bound and operational. No repository evidence shows a required filter missing; the item exists only because Figma `662:3` could not be opened. | Carry. Lack of live Figma access is not a defect (directive §5). |
| `FU-APP5-A01-QUEUE-COUNT-01` | `NONBLOCKING_CARRY` | `adminCustomRequestList` publishes no total (keyset pagination by design, `APP5-B04`), and the queue invents no number. | Carry. Needs a backend count or a design amendment — both outside "minimal". |

Not in scope of this audit but noted as already tracked: `FU-APP5-B01-APP3-SURFACE-GATE-01` (the APP3-era source gates frozen at `APP3-S06`), routed to `APP5-X01`.

---

## Minimal corrections performed

One correction, four files.

```text
apps/storefront/src/features/storefront-shell/model/storefront-navigation.ts
  + STOREFRONT_CUSTOM_REQUEST_ROUTE = '/yeu-cau/moi'
  ~ { id: 'commission', … route: STOREFRONT_CUSTOM_REQUEST_ROUTE }   (was null)
  ~ model doc comment (two routed areas, not one)

apps/storefront/src/features/storefront-shell/components/storefront-primary-nav.tsx
  ~ doc comment only

apps/storefront/test/components/storefront-shell-render.test.tsx
  ~ the nav assertion now expects two real links, names the second one and its
    href, and drops 'Đặt thêu' from the unavailable list

apps/storefront/test/components/storefront-shell-drawer.test.tsx
  ~ the focus trap has one more stop; the request link is now the last one, so
    the forward/backward wrap is asserted against it
```

Why this stays inside authority:

- the `commission` nav item is **already approved** in the shell design; only its
  `route` changed, from `null` to a route `APP5-D01` locked and `APP5-S01` built;
- no new visual CTA was invented, no Figma artifact touched, no registry row
  changed, no endpoint, no migration, no generated file;
- a bare `/yeu-cau/moi` visit renders the subject chooser and the
  customer-owned branch is complete without any query string
  (`custom-request-screen.tsx:56–61`, `catalog-entry-context.ts` — `ABSENT` is a
  state, not a failure), so the link is truthful for an unparameterised visit;
- `tools/check-app3-s01.mjs` freezes only `id: 'studio', … route: null`, which is
  untouched.

**Not fixed and deliberately so:** the catalog branch still requires arriving
from a Studio placement with `?san-pham=…&mat=…&vung=…`. Wiring that needs a
"request this design" control on an APP3 Studio surface for which no approved
frame exists — a design decision, not a route change.

---

## Focused validation

| Command | Why | Result |
|---|---|---|
| `npx jest test/components/storefront-shell-render.test.tsx test/components/storefront-shell-drawer.test.tsx` (in `apps/storefront`) | the only tests covering the changed nav model and the shell that renders it | **PASS** — 2 suites, 14 tests (first run correctly failed the drawer focus-trap assertion, proving the tests actually observe the new link) |
| `pnpm --filter storefront typecheck` | the changed source files and their tests | **PASS** |
| `node tools/check-app3-s01.mjs` | the gate that freezes `storefront-navigation.ts` | **5 failures — pre-existing and unrelated.** Verified identical output on a stashed (pristine) tree: OpenAPI counts, migration count and two APP3 file sizes. No navigation rule fired. This is `FU-APP5-B01-APP3-SURFACE-GATE-01`, already routed to `APP5-X01`. |
| `git diff --check` | whitespace hygiene on the diff | **PASS** (clean) |

Not run, deliberately: full Jest, Playwright, APP5 regression, backend/worker/DB
suites, SonarQube, all-workspace build. Nothing in the change touches them
(`VALIDATION_GOVERNANCE.md` §3).

---

## Remaining nonblocking follow-ups

```text
FU-APP5-S01-STUDIO-ENTRY-01             — narrowed: the storefront entry point now
                                          exists; only the APP3 Studio "request this
                                          design" control for the catalog branch
                                          remains, and it needs an approved frame
FU-APP5-S02-NULLABLE-STRING-CONTRACT-01 — 19 generated aliases; backend-owned,
                                          needs a checkpoint owning API + client
FU-APP5-B04-DESIGN-PREVIEW-01           — no authorized Admin design preview port
FU-APP5-S02-CONFIRMATION-SUMMARY-01     — needs data no unauthenticated route may serve
FU-APP5-S02-MASKED-CONTACT-01           — published by no authorized read
FU-APP5-A01-FILTER-SET-CONFIRM-01       — confirm against live 662:3 when Figma opens
FU-APP5-A01-QUEUE-COUNT-01              — needs a backend count or a design amendment
FU-APP5-B01-APP3-SURFACE-GATE-01        — APP3-era gates frozen at APP3-S06 (X01)
```

## Blocking items

```text
None
```

The single item that met the blocking bar — no reachable entry into the APP5
journey — was corrected minimally within existing approved authority and is
verified green.

## Roadmap

```text
APP5-A02 = COMPLETE
APP5-E01 = NEXT
APP5-X01 = INCOMPLETE
```

No checkpoint was added.

```text
NEXT: APP5-E01 — Cross-layer acceptance
```
