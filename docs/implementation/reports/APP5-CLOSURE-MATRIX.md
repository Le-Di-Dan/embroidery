# APP5 — Canonical Closure Matrix

Built by `APP5-X01` from repository truth: Git history, the committed OpenAPI
artifact, the migration directory, the Figma registry and the accepted
completion reports. Where this matrix and older planning prose disagree, **this
matrix is the current world**.

```text
APP5     = COMPLETE — PASS_WITH_FOLLOW_UPS
APP5-E01 = COMPLETE
APP5-X01 = COMPLETE
blocking follow-ups = 0
APP6 = NOT_STARTED
```

---

## 1. Canonical checkpoint count

```text
canonical delivered checkpoints = 16
closure checkpoint              = APP5-X01 (this one)
canonical total                 = 17
```

Two of the sixteen were **inserted during execution** by the checkpoint that
first needed them, and are recorded as additions rather than absorbed into the
original eight-operation budget: `APP5-B07` (inserted by `APP5-S01`) and
`APP5-B06` (inserted by `APP5-B05`).

**No `APP5-B08`. No `APP5-D02`. No `APP5-S03`.** All three were cancelled by the
Product Owner. `APP5-S03` appears in the phase plan §6 only as a superseded
planning slice that `APP5-R00` redefined into the delivered `APP5-S02`; `B08` and
`D02` were never created. The `APP5-C01…C04` contract slices in §6 were removed
by `APP5-R00` (OpenAPI is generated from the implementation), as were the
standalone customer-owned-product slices.

---

## 2. The 17 canonical checkpoints

| # | ID | Type | Final status | Acceptance | Commit(s) | Primary outcome / evidence pointer | Blocking FU | Nonblocking FU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | APP5-R00 | phase entry | COMPLETE | accepted | `ffb43c9` | Phase-entry audit; §6 superseded, `C01…C04` and the standalone COP slices removed — [`APP5-R00-COMPLETION-REPORT.md`](./APP5-R00-COMPLETION-REPORT.md) | 0 | 0 |
| 2 | APP5-G01 | authority | COMPLETE | accepted | `c9d9a46` | 14 locked decisions: submit key = the verified challenge id, subject XOR, `TR-LC11-01/02/03/04/10/11` only, asset roles, IMP-D048 upload lane — [`APP5-G01-COMPLETION-REPORT.md`](./APP5-G01-COMPLETION-REPORT.md) | 0 | 0 |
| 3 | APP5-D01 | design | COMPLETE — PRODUCT_OWNER_APPROVED | PO-approved | `058d2f4`; approval recorded `e094065` | 65 nodes on `APP_05` `641:3`, `FIGMA_DESIGN_INDEX.md` §4.11, all `APPROVED_FOR_IMPLEMENTATION` under `FIG-APPROVAL-APP5-D01-PO-001` — [`APP5-D01-COMPLETION-REPORT.md`](./APP5-D01-COMPLETION-REPORT.md) | 0 | 0 |
| 4 | APP5-B01 | backend | COMPLETE | accepted | `a28c3cc`, `0adc7fc` | `publicCustomRequest_submit` — TR-LC11-01 in one transaction, idempotent on the challenge id — [`APP5-B01-COMPLETION-REPORT.md`](./APP5-B01-COMPLETION-REPORT.md) | 0 | 1 |
| 5 | APP5-DB01 | database change | COMPLETE | accepted | `f661da8`, `76d1f88`; block `2797294` | Migration `0035_add_app5_intake_provenance` — `assets.uploaded_via_challenge_id` + `assets.intake_expires_at`, CST-127/128 — [`APP5-DB01-COMPLETION-REPORT.md`](./APP5-DB01-COMPLETION-REPORT.md) | 0 | 0 |
| 6 | APP5-B02 | backend | COMPLETE | accepted | `99025f1` | `publicCustomRequestAsset_upload` / `_status` — challenge-scoped reservation quota, orphan sweep — [`APP5-B02-COMPLETION-REPORT.md`](./APP5-B02-COMPLETION-REPORT.md) | 0 | 0 |
| 7 | APP5-B03 | backend | COMPLETE | accepted | `bd3b20d` | `publicCustomRequest_status` — the request id comes from the APP4 grant, never the caller; the whole auth chain is internal — [`APP5-B03-COMPLETION-REPORT.md`](./APP5-B03-COMPLETION-REPORT.md) | 0 | 0 |
| 8 | APP5-B04 | backend | COMPLETE | accepted | `9c00713` | `adminCustomRequest_list` / `_detail` — read-only behind `AuthenticatedAdminGuard` — [`APP5-B04-COMPLETION-REPORT.md`](./APP5-B04-COMPLETION-REPORT.md) | 0 | 1 |
| 9 | APP5-B05 | backend | COMPLETE | accepted | `5f00098` | `adminCustomRequest_appendNote` / `_transition` — the APP5 subset, both reason texts, append-only notes, a real competing-transition race — [`APP5-B05-COMPLETION-REPORT.md`](./APP5-B05-COMPLETION-REPORT.md) | 0 | 0 |
| 10 | APP5-B07 | backend | COMPLETE | accepted | `0f0275d`; S01 block `2b438f4` | **Inserted by S01.** `publicProductVariant_list` — Catalog-owned, anonymous, selection-only, no default variant — [`APP5-B07-COMPLETION-REPORT.md`](./APP5-B07-COMPLETION-REPORT.md) | 0 | 0 |
| 11 | APP5-S01 | storefront | COMPLETE | accepted | `611440c` | `/yeu-cau/moi` — subject XOR chooser, both branches, embedded APP4 verification, B02 uploads gated on `bindable`, duplicate-safe submit — [`APP5-S01-COMPLETION-REPORT.md`](./APP5-S01-COMPLETION-REPORT.md) | 0 | 1 |
| 12 | APP5-S02 | storefront | COMPLETE | accepted | `f11be2b` | `/yeu-cau/da-gui` + `/truy-cap` — B03 as the **single** status call, `publicSecureLinkResolve` never chained in front; closes `FU-APP4-S01-SUCCESS-HANDOFF-01` — [`APP5-S02-COMPLETION-REPORT.md`](./APP5-S02-COMPLETION-REPORT.md) | 0 | 3 |
| 13 | APP5-A01 | admin | COMPLETE | accepted | `2bf849d` | `/requests` — server-stated default triage scope, URL-held filters, opaque keyset continuation — [`APP5-A01-COMPLETION-REPORT.md`](./APP5-A01-COMPLETION-REPORT.md) | 0 | 2 |
| 14 | APP5-B06 | backend | COMPLETE | accepted | `6b09c04` | **Inserted by B05.** `adminCustomRequestAsset_get` — request-bound `COP_IMAGE`/`REFERENCE`, inspection-approved source, descriptor-before-storage; closes `FU-APP5-B04-COP-ASSET-DELIVERY-01` — [`APP5-B06-COMPLETION-REPORT.md`](./APP5-B06-COMPLETION-REPORT.md) | 0 | 0 |
| 15 | APP5-A02 | admin | COMPLETE | accepted | `3f6b800`, `7fdb68f` | `/requests/{requestId}` — B04 as the single canonical read, B06 evidence through revoked object URLs, the B05 action matrix; both 409s require a new decision — [`APP5-A02-COMPLETION-REPORT.md`](./APP5-A02-COMPLETION-REPORT.md) | 0 | 0 |
| 16 | APP5-E01 | cross-layer | **COMPLETE_WITH_NONBLOCKING_FOLLOWUPS** | accepted | `d098d67`, `9f68d74` | 6 serial tests, 4 journeys, 44 proofs across the real stack; one integration defect found and corrected — [`APP5-E01-COMPLETION-REPORT.md`](./APP5-E01-COMPLETION-REPORT.md) | 0 | 2 opened |
| 17 | APP5-X01 | closure | **COMPLETE** | this document | see §8 | Phase closure — [`APP5-X01-COMPLETION-REPORT.md`](./APP5-X01-COMPLETION-REPORT.md) | 0 | 0 |

**No correction checkpoint was created anywhere in APP5.** The two execution
blocks (`APP5-B02` on intake provenance, `APP5-S01` on the missing public variant
read) were resolved by inserting `APP5-DB01` and `APP5-B07` under Product Owner
routing — additions, not corrections. `APP5-E01`'s single defect was corrected
inside the checkpoint.

---

## 3. Delivered capability

### Customer

```text
reachable Storefront request entry (shell nav → /yeu-cau/moi)
→ subject chooser
→ CATALOG xor CUSTOMER_OWNED
→ APP4 verification (embedded)
→ APP5 upload where applicable (customer-owned: >= 1 accepted COP_IMAGE)
→ request submission (duplicate-safe on the verified challenge id)
→ confirmation (/yeu-cau/da-gui, display code only, no lookup)
→ grant-scoped request status (/truy-cap, B03 only)
```

### Catalog

```text
public Product Variant read (publicProductVariant_list)
→ explicit real variant selection (no default is published, so none is preselected)
→ APP3 Design Session context (submitted_session_id consumed by the submission)
→ submit
```

### Admin

```text
queue (/requests)
→ detail (/requests/{requestId})
→ private request evidence (B06, request-bound, blob: object URL, no storage address)
→ moderation notes (append-only)
→ guarded APP5 transitions (TR-LC11-01/02/03/04/10/11 only)
```

### Privacy

```text
internal moderation reason and moderation note remain Admin-only
the customer sees only customerVisibleReason
```

`APP5-E01` §6 proves this directly, with three distinct strings, rather than by
inference.

---

## 4. Phase-level runtime evidence

`APP5-E01` is the final runtime acceptance evidence for the phase. It was **not**
rerun by `APP5-X01`, and no checkpoint suite was rerun.

```text
6 serial acceptance tests · 4 journeys · 44 recorded proofs
```

| Journey | Proved |
| --- | --- |
| A — customer-owned (`E01-01`, `E01-02`) | shell nav → `/yeu-cau/moi` → verification → B02 upload → real inspection worker → B01 submit → confirmation; provenance columns written from the locked challenge row; zero transition rows at creation |
| B — catalog (`E01-03`) | a real `APP3-B07` session opened from the browser, a real `APP5-B07` variant list with none preselected, the selected variant persisted, the session `SUBMITTED` |
| C — secure-link status (`E01-05`) | `#t=` stripped before the request, **B03 only** (`secure-links/resolve` called zero times), the grant scoping exactly one request |
| D — Admin triage (`E01-04`) | real staff login, B04 queue/detail, the real B06 binary stream, B05 transitions, B04 refetch |
| Composed (`E01-06`) | the invariants restated as assertions over the collected proofs, so a journey that silently stopped recording cannot pass |

---

## 5. Frozen artifact baseline

Read from the committed artifacts. **Nothing was regenerated by `APP5-X01`.**

```text
OpenAPI (packages/contracts/openapi/openapi.generated.json)
  paths      = 58
  operations = 63
  schemas    = 132
  sha256     = ef5dc35884d4f38f7adac5164b6401971bceeda326f11cb27a35bf655cb1f243

APP5 operations = 10
  POST /api/public/custom-requests                                              publicCustomRequest_submit
  POST /api/public/custom-requests/status                                       publicCustomRequest_status
  POST /api/public/custom-request-intake/challenges/{challengeId}/assets        publicCustomRequestAsset_upload
  GET  /api/public/custom-request-intake/challenges/{challengeId}/assets/{id}   publicCustomRequestAsset_status
  GET  /api/public/products/{slug}/variants                                     publicProductVariant_list
  GET  /api/admin/custom-requests                                               adminCustomRequest_list
  GET  /api/admin/custom-requests/{requestId}                                   adminCustomRequest_detail
  POST /api/admin/custom-requests/{requestId}/moderation-notes                  adminCustomRequest_appendNote
  POST /api/admin/custom-requests/{requestId}/transitions                       adminCustomRequest_transition
  GET  /api/admin/custom-requests/{requestId}/assets/{assetId}/content          adminCustomRequestAsset_get

Database
  migrations       = 35
  APP5-owned       = 1 — 0035_add_app5_intake_provenance (APP5-DB01)

Figma (docs/design/FIGMA_DESIGN_INDEX.md §4.11)
  APP5 rows                          = 65, all APPROVED_FOR_IMPLEMENTATION
  FIG-APPROVAL-APP5-D01-PO-001       = 65

Delivered surfaces
  Storefront  /yeu-cau/moi · /yeu-cau/da-gui · /truy-cap
  Admin       /requests · /requests/{requestId}
```

Eight operations were planned (`APP5-R00`); ten were delivered. The two extra are
`B07` and `B06`, both recorded as additions in the phase plan §10.3/§10.6 rather
than retrofitted into the original estimate.

---

## 6. Follow-up inventory

### Closed during APP5

| ID | Disposition | Evidence |
| --- | --- | --- |
| `FU-APP4-S01-SUCCESS-HANDOFF-01` | **CLOSED** | `APP5-S02` — APP4 verification success now hands off to the APP5 confirmation |
| `FU-APP5-B04-COP-ASSET-DELIVERY-01` | **CLOSED** | `APP5-B06` — the Admin detail can now open a request-bound attachment |
| `FU-APP5-B01-APP3-SURFACE-GATE-01` | **CLOSED_BY_ROUTING / HISTORICAL_GATE_NOT_CURRENT** | `APP5-X01` §7 |

### Open — nonblocking, all owned

| ID | Class | Owner / routing | Why nonblocking |
| --- | --- | --- | --- |
| `FU-APP5-S01-STUDIO-ENTRY-01` | product seam · design | APP3 maintenance (needs an approved frame) | The Storefront entry exists and is proven reachable by `E01-01`; only the APP3 Studio "request this design" control is missing, and it cannot be drawn without an approved frame |
| `FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` | contract / codegen | future backend phase owning both the API and the generated client | 19 nullable strings publish as `type: object`; the runtime projection guards with `typeof`, and `E01` compiled and ran against the aliases with no integration failure |
| `FU-APP5-B04-DESIGN-PREVIEW-01` | backend read | APP6 (design review owns the preview) | No authorized Catalog design-session preview exists; A02 states that plainly and shows `designSessionId` as provenance only. Nothing is fabricated |
| `FU-APP5-S02-CONFIRMATION-SUMMARY-01` | design vs contract | future phase / product decision | The approved panel needs request data no unauthenticated route may return; the same information is one secure link away |
| `FU-APP5-S02-MASKED-CONTACT-01` | design vs contract | future backend phase (a B03 decision) | No authorized read publishes a contact; the confirmation names the verified contact in words instead |
| `FU-APP5-A01-FILTER-SET-CONFIRM-01` | design confirmation | maintenance, when live Figma access returns | Two filters shipped from the registry entry; the remaining three are implemented only if the live `662:3` frame carries them. Nothing was invented |
| `FU-APP5-A01-QUEUE-COUNT-01` | backend field or design amendment | future phase | The D01 topbar open-request count has no B04 field; **no number is invented**, so the surface is truthful without it |
| `FU-APP5-E01-STUDIO-RANDOMUUID-01` | correctness · APP3 surface | **APP3 maintenance** | `use-studio-image.ts` repeats the `crypto.randomUUID` call APP5 corrected. It is an APP3 file; widening the E01 diff would cross a phase boundary. Not an APP5 deliverable |
| `FU-APP5-E01-HOST-COOKIE-DEV-01` | dev-environment config | **dev-environment maintenance** (APP3 cookie policy + compose defaults) | A `__Host-` cookie without `Secure` is dropped on the plain-HTTP dev stack. **Production is unaffected** — `Secure` is required and set there |
| `FU-APP5-B01-APP3-SURFACE-GATE-01` | tooling debt | **CLOSED by `APP5-X01`** — routed to APP3 / tooling maintenance | See §7 |

```text
blocking follow-ups    = 0
nonblocking follow-ups = 10 (9 open + 1 closed by routing)
ownerless follow-ups   = 0
```

---

## 7. Historical APP3 surface-gate disposition

```text
FU-APP5-B01-APP3-SURFACE-GATE-01 = CLOSED_BY_ROUTING / HISTORICAL_GATE_NOT_CURRENT
```

Every APP3 checkpoint gate asserts three repository-global artifacts unchanged
since its checkpoint shipped. The surface authority
(`tools/app3-accepted-surface.mjs`) has no entry after `APP3-S06`
(37 paths / 42 operations / 84 schemas) and `EXPECTED_MIGRATIONS = 34`, while the
current tree is 58 / 63 / 132 with 35 migrations. Those assertions therefore fail
**by construction** on any post-APP3 tree, independently of the change under
review — as `APP5`'s pre-E01 audit verified directly by reproducing the identical
five `check-app3-s01` failures on a **pristine** tree.

`APP5-X01` reclassified the **44 of 54** APP3 gate commands that reach one of
those assertions from `ACTIVE_SCOPED` to `HISTORICAL_SCOPED` in
`SCOPED_COMMAND_INDEX.md`, and recorded the reasoning in its new §1.1. No gate
was run and no gate logic was changed: rewriting 44 checkers to make old counts
green would destroy the evidence they exist to carry. Repair is APP3 / tooling
maintenance.

---

## 8. Repository state

```text
branch            production
X01 entry HEAD    9f68d74  docs(app5): record the E01 commit hash in its completion report
APP5-E01 commit   d098d67
entry tree        clean
X01 commit        see APP5-X01-COMPLETION-REPORT.md §Repository state
pushed            no
```

---

## 9. APP6 handoff

APP5 hands **APP6 — Design Review, Approval and Quotation** these accepted
capabilities:

```text
custom_requests in the APP5-owned LC-11 states; TR-LC11-05…09 unclaimed
custom_request_transitions as the audit history, carrying both reason texts
customer_owned_products as a request-bound child (no standalone lifecycle)
custom_request_assets — COP_IMAGE / REFERENCE, inspection-approved sources only
quantity lines (TBL-039) as a pricing input
one APP4 REQUEST_ACCESS grant already issued per submitted request
the Admin queue/detail/moderation surface to extend rather than replace
```

Carried constraint, unchanged since `APP5-D01`: `design_versions` requires four
catalog placement columns `NOT NULL`, so a customer-owned-product request cannot
hold a design version under the current schema.

```text
APP6 = NOT_STARTED
```
