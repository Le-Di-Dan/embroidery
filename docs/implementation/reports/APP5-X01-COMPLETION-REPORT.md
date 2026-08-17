# APP5-X01 — Phase Closure — Completion Report

## Verdict

```text
APP5-X01 = COMPLETE
APP5 PHASE VERDICT = PASS_WITH_FOLLOW_UPS

blocking follow-ups = 0
```

The closure question — *can APP5 be accepted and closed without any known
blocking correctness, security, privacy, lifecycle or core-journey defect?* —
answers **YES**. `APP5-X01` looked for contradictory evidence and found none.

This checkpoint changed documentation and one command-index classification. No
runtime code, no API, no schema, no design artifact, no registry row and no test
was touched, and no suite was rerun.

---

## 1. Baseline

```text
branch          production
X01 entry HEAD  9f68d74  docs(app5): record the E01 commit hash in its completion report
APP5-E01        d098d67  feat(app5): accept the custom-request journeys across every delivered layer
entry tree      clean (git status --porcelain: empty)
```

---

## 2. Final roadmap

Every canonical APP5 checkpoint is `COMPLETE`:

```text
APP5-R00  = COMPLETE      APP5-B05  = COMPLETE
APP5-G01  = COMPLETE      APP5-B07  = COMPLETE
APP5-D01  = COMPLETE      APP5-S01  = COMPLETE
APP5-B01  = COMPLETE      APP5-S02  = COMPLETE
APP5-DB01 = COMPLETE      APP5-A01  = COMPLETE
APP5-B02  = COMPLETE      APP5-B06  = COMPLETE
APP5-B03  = COMPLETE      APP5-A02  = COMPLETE
APP5-B04  = COMPLETE      APP5-E01  = COMPLETE
                          APP5-X01  = COMPLETE
```

Sixteen delivered checkpoints plus this closure. **No `APP5-B08`, no `APP5-D02`,
no `APP5-S03`** — all three were cancelled by the Product Owner, and X01
confirmed by repository search that none exists as a checkpoint anywhere:

```text
APP5-B08  0 occurrences
APP5-D02  0 occurrences
APP5-S03  3 occurrences — all historical, none a checkpoint:
          phases/APP5-CUSTOM-REQUESTS.md §6      superseded planning slice
          audits/APP5_PHASE_ENTRY_AUDIT.md ×2    the REDEFINE that produced APP5-S02
```

No correction checkpoint was created anywhere in APP5. The two execution blocks
(`B02` on intake provenance, `S01` on the missing public variant read) were
resolved by **inserting** `DB01` and `B07` under Product Owner routing —
additions, not corrections — and `E01`'s single integration defect was corrected
inside `E01`.

---

## 3. Delivered capability summary

### Customer

```text
reachable Storefront request entry (shell nav → /yeu-cau/moi)
→ subject chooser
→ CATALOG xor CUSTOMER_OWNED
→ APP4 verification (embedded)
→ APP5 upload where applicable
→ request submission (duplicate-safe on the verified challenge id)
→ confirmation
→ grant-scoped request status
```

### Catalog

```text
public Product Variant read
→ explicit real variant selection (no default published, so none preselected)
→ APP3 Design Session context (consumed by the submission, not merely named)
→ submit
```

### Admin

```text
queue → detail → private request evidence → moderation notes
      → guarded APP5 transitions (TR-LC11-01/02/03/04/10/11 only)
```

### Privacy

```text
internal moderation reason and moderation note remain Admin-only
the customer sees only customerVisibleReason
```

---

## 4. Phase-level evidence

`APP5-E01` is the **final runtime acceptance evidence** for the phase and was not
rerun. Nothing below was re-proved by X01.

```text
6 serial acceptance tests · 4 journeys · 44 recorded proofs · all green
```

| Journey | Proved |
|---|---|
| A — customer-owned (`E01-01`, `E01-02`) | reachable `/yeu-cau/moi` from the shell; verification → B02 upload → real inspection worker → B01 submit → confirmation; provenance columns written from the locked challenge row; zero transition rows at creation |
| B — catalog (`E01-03`) | a real `APP3-B07` session opened from the browser, a real `APP5-B07` variant list with **none** preselected, the chosen variant persisted, the session `SUBMITTED` |
| C — secure-link status (`E01-05`) | the `#t=` fragment stripped before the request; **B03 only** — `secure-links/resolve` called zero times; the grant scoping exactly one request |
| D — Admin triage (`E01-04`) | real staff login, B04 queue and detail, the real B06 private binary stream, B05 transitions, B04 refetch |
| Composed (`E01-06`) | the invariants restated as assertions over the collected proofs, so a journey that silently stopped recording cannot pass |

Cross-layer reason privacy was proved directly, with three distinct strings, so
"the customer sees the right one" could not pass by coincidence.

---

## 5. Follow-up disposition

```text
blocking follow-ups = 0
```

X01 examined each carried item for direct evidence that it prevents acceptance.
None does. Nothing was fixed here to shorten the list, and nothing was
reclassified as blocking.

| Follow-up | Final classification | Future owner / routing | Why nonblocking |
|---|---|---|---|
| `FU-APP5-S01-STUDIO-ENTRY-01` | nonblocking · product seam / design | APP3 maintenance | The Storefront entry exists and `E01-01` proves it reachable from the shell. Only the APP3 Studio "request this design" control is missing, and it needs an approved frame |
| `FU-APP5-S02-NULLABLE-STRING-CONTRACT-01` | nonblocking · contract / codegen | future backend phase owning both the API and the generated client | 19 nullable strings publish as `type: object`. Runtime-safe — the projection guards with `typeof` and keeps the cast out of every component — and `E01` compiled and ran against the aliases with no integration failure |
| `FU-APP5-B04-DESIGN-PREVIEW-01` | nonblocking · backend read | **APP6** (design review owns the preview) | No authorized Catalog design-session preview exists. A02 says so plainly and shows `designSessionId` as provenance only; nothing is fabricated |
| `FU-APP5-S02-CONFIRMATION-SUMMARY-01` | nonblocking · design vs contract | future phase / product decision | The approved panel needs request data no unauthenticated route may return — the surface `G01 §5` forbids. The same information is one secure link away |
| `FU-APP5-S02-MASKED-CONTACT-01` | nonblocking · design vs contract | future backend phase (a B03 decision) | No authorized read publishes a contact. The confirmation names the verified contact in words instead |
| `FU-APP5-A01-FILTER-SET-CONFIRM-01` | nonblocking · design confirmation | maintenance, when live Figma access returns | Two filters shipped from the registry entry; the remaining three are implemented only if the live `662:3` frame carries them. Nothing was invented |
| `FU-APP5-A01-QUEUE-COUNT-01` | nonblocking · backend field or design amendment | future phase | The D01 topbar open-request count has no B04 field. No number is invented, so the surface stays truthful without it |
| `FU-APP5-E01-STUDIO-RANDOMUUID-01` | nonblocking · correctness, **APP3 surface** | **APP3 maintenance** | `use-studio-image.ts` repeats the `crypto.randomUUID` call APP5 corrected in its own file. It is an APP3 file; correcting it here would cross a phase boundary. **Not an APP5 deliverable and not an APP5 blocker** |
| `FU-APP5-E01-HOST-COOKIE-DEV-01` | nonblocking · dev-environment config | **dev-environment maintenance** (APP3 cookie policy + compose defaults) | A `__Host-` cookie without `Secure` is dropped on the plain-HTTP dev stack. **Production is unaffected** — `Secure` is required and set there. E01 ran on a trustworthy origin instead. **Not an APP5 blocker** |
| `FU-APP5-B01-APP3-SURFACE-GATE-01` | **CLOSED_BY_ROUTING / HISTORICAL_GATE_NOT_CURRENT** | APP3 / tooling maintenance | §6 |

Closed earlier in the phase: `FU-APP4-S01-SUCCESS-HANDOFF-01` (by `APP5-S02`) and
`FU-APP5-B04-COP-ASSET-DELIVERY-01` (by `APP5-B06`).

```text
open nonblocking = 9      closed by X01 = 1      ownerless = 0
```

---

## 6. Historical tooling reconciliation

```text
FU-APP5-B01-APP3-SURFACE-GATE-01 = CLOSED_BY_ROUTING / HISTORICAL_GATE_NOT_CURRENT
```

**Source and documentation reconciliation only. No APP3 gate was run, no gate
logic was changed, and APP3 was not reopened.**

### 6.1 What the debt actually is

Every APP3 checkpoint gate asserts, alongside its own rules, that three
*repository-global* artifacts are unchanged since its checkpoint shipped:

| Frozen assertion | Source | Frozen value | Current value |
|---|---|---|---|
| Accepted API surface | `tools/app3-accepted-surface.mjs`, last entry `APP3-S06` | 37 paths / 42 operations / 84 schemas | **58 / 63 / 132** |
| Migration count | `EXPECTED_MIGRATIONS` (17 declarations across `tools/check-app3-*.mjs`) | 34 | **35** (`0035_add_app5_intake_provenance`, `APP5-DB01`) |
| Root script count | `ROOT_SCRIPTS` | 30 | 30 — still correct |

The surface table has **no entry after `APP3-S06`**, so it cannot describe any
world APP4 or APP5 left behind. Those two assertions therefore fail *by
construction* on the current tree, on any branch, whatever the change under
review. This is not an inference: `APP5`'s pre-E01 audit ran
`node tools/check-app3-s01.mjs` against a **stashed, pristine** tree and got the
identical five failures — OpenAPI counts, migration count and two APP3 file
sizes, with no navigation rule firing.

### 6.2 Disposition

Resolved by dependency analysis of every APP3 gate command in
`SCOPED_COMMAND_INDEX.md` §3/§3.1, following each entry point through its
transitive local imports:

```text
APP3 gate commands indexed                                    = 54
reach a frozen global-artifact assertion                      = 44  → HISTORICAL_SCOPED
do not                                                        = 10  → ACTIVE_SCOPED (unchanged)
```

The ten that keep `ACTIVE_SCOPED`: `CMD-CHECK-APP3-A01`, `-A02`, `-A03`, `-S04`,
`-S08`, `-S09`, `-CLOSURE`, `-F01-FONT-ASSETS`, `-W01A-OUTPUT`,
`-W01B-GRAMMAR`.

`HISTORICAL_SCOPED` is the index's own existing status and its published meaning
already fits — "owned by a delivered checkpoint; still authoritative over its own
inputs, but run **only** when the current change touches those inputs". APP3 is
closed, so this is simply the truthful classification. A new §1.1 in the index
records the reasoning and three binding consequences: a frozen-count failure is
not evidence of a defect in the change under review; these gates are not current
acceptance evidence for any non-APP3 phase; and repairing the baseline is APP3 /
tooling maintenance.

### 6.3 What was deliberately not done

- **No gate was run.** Running 44 checkers that fail by construction produces no
  information.
- **No gate logic was rewritten and no frozen count was edited.** Making old
  counts green would destroy exactly the evidence those gates exist to carry, and
  is explicitly out of scope.
- **`tools/check-app3-p03.mjs` was not repaired.** It has been red since APP4 for
  this same reason; it is in the 44 and is now classified accordingly.
- Usage-scope cells that quote the frozen numbers in prose (for example
  `CMD-CHECK-APP3-S10`/`-S11`, "an unchanged OpenAPI artifact of 37 paths / 42
  operations / 84 schemas") are left as written. They accurately describe what
  the gate asserts; §1.1 is what says the assertion is historical.

---

## 7. Final inventory

Read from the committed artifacts. **Nothing was regenerated.**

```text
OpenAPI (packages/contracts/openapi/openapi.generated.json)
  paths = 58 · operations = 63 · schemas = 132
  sha256 = ef5dc35884d4f38f7adac5164b6401971bceeda326f11cb27a35bf655cb1f243

APP5 operations = 10 (8 planned + B06 + B07, both recorded as additions)
migrations      = 35 total, 1 APP5-owned (0035_add_app5_intake_provenance)
Figma           = 65 APP5 rows, all APPROVED_FOR_IMPLEMENTATION
                  under FIG-APPROVAL-APP5-D01-PO-001
```

### Public / customer

```text
POST /api/public/custom-requests                                            request submit
POST /api/public/custom-request-intake/challenges/{challengeId}/assets      intake upload
GET  /api/public/custom-request-intake/challenges/{challengeId}/assets/{id} intake status
POST /api/public/custom-requests/status                                     grant-scoped status
GET  /api/public/products/{slug}/variants                                   public product variants
```

### Admin

```text
GET  /api/admin/custom-requests                                        request queue
GET  /api/admin/custom-requests/{requestId}                            request detail
POST /api/admin/custom-requests/{requestId}/moderation-notes           moderation note
POST /api/admin/custom-requests/{requestId}/transitions                guarded transition
GET  /api/admin/custom-requests/{requestId}/assets/{assetId}/content   private request-asset content
```

### Frontend

```text
Storefront  /yeu-cau/moi        reachable request creation (catalog xor customer-owned)
            /yeu-cau/da-gui     confirmation
            /truy-cap           grant-scoped status
Admin       /requests               request queue
            /requests/{requestId}   request detail and moderation
```

---

## 8. Validation ledger

Closure changes documentation and one command-index classification, so the
justified validation is whitespace, format applicability and consistency — not
runtime.

| Command | Reason | Result |
|---|---|---|
| `git diff --check` | whitespace errors in the closure diff | **clean** |
| `git status --porcelain` (entry and exit) | record the working tree truthfully | entry **empty**; exit **clean** |
| `grep -n "docs/" .prettierignore` | establish whether the global Prettier control applies to this diff | `docs/` is Prettier-ignored ("Product documentation is a locked baseline"), so `format:check` is **not applicable** to any file changed here |
| targeted `grep` for `APP5-B08` / `APP5-D02` / `APP5-S03` across `docs/` and `tools/` | criterion 2 — no cancelled checkpoint appears | 0 / 0 / 3, the three all historical `S03` planning references (§2) |
| `node -e` count over `packages/contracts/openapi/openapi.generated.json` | §9 requires reading counts from the current artifact rather than regenerating | 58 paths / 63 operations / 132 schemas; APP5 operations enumerated = 10 |
| `ls packages/database/migrations/*.sql \| wc -l` | migration count for the frozen-baseline comparison | 35 |
| `grep -c "^| FIG-APP5-"` and the approval-id count in `FIGMA_DESIGN_INDEX.md` | Figma inventory | 65 rows, 65 approvals, 0 not `APPROVED_FOR_IMPLEMENTATION` |
| Node dependency walk over the 54 indexed APP3 gate commands | §6 disposition, computed rather than asserted | 44 reach a frozen assertion, 10 do not; all 44 were `ACTIVE_SCOPED` before the edit and exactly 44 rows changed |

**ESLint** — not applicable: no JavaScript, TypeScript or tooling source file was
changed. **SonarQube** — not applicable for the same reason. No global quality
chain was run.

**Deliberately not run** (§11 of the closure brief): `APP5-E01` again,
`pnpm quality`, full Jest, the full Playwright/E2E matrix, all Admin/Storefront
tests, API integration, the `B01`–`B07` suites, `S01`/`S02`, `A01`/`A02`, APP3 /
APP4 / DB regression, the worker suite, OpenAPI or api-client generation and
their drift checks, the Figma checker, and any all-workspace build or typecheck.

---

## 9. Files changed

**Added**

```text
docs/implementation/reports/APP5-X01-COMPLETION-REPORT.md
docs/implementation/reports/APP5-CLOSURE-MATRIX.md
```

**Modified**

```text
docs/implementation/phases/APP5-CUSTOM-REQUESTS.md   §10.1 X01 → COMPLETE + the canonical-set
                                                     statement; new §11 phase closure (exit
                                                     gate + APP6 handoff)
docs/implementation/10-MASTER-APPLICATION-ROADMAP.md §6 — APP5 row added as
                                                     COMPLETE — PASS_WITH_FOLLOW_UPS;
                                                     the NOT_STARTED span narrowed to APP6–APP12
docs/implementation/SCOPED_COMMAND_INDEX.md          new §1.1 (frozen APP3-era baseline);
                                                     44 APP3 gate rows ACTIVE_SCOPED →
                                                     HISTORICAL_SCOPED
```

`11-TRACEABILITY-AND-STATUS-MATRIX.md` was **not** edited: its §3 states that
current phase-status values are recorded once, in the master roadmap §6, and are
not duplicated there.

No runtime source, test, migration, OpenAPI artifact, generated client, Figma
node or registry row was touched.

---

## 10. Repository state

```text
branch              production
X01 entry HEAD      9f68d74
APP5-E01 commit     d098d67
entry working tree  clean
final X01 commit    docs(app5): close the phase and route its historical tooling debt
                    (hash recorded by the follow-up docs commit, as APP5 has done
                     for every checkpoint)
final working tree  clean
pushed              no
```

No unrelated user changes existed at entry (`git status --porcelain` was empty),
so none needed preserving or disclosing.

---

## 11. Closure matrix

```text
docs/implementation/reports/APP5-CLOSURE-MATRIX.md
```

Checkpoint-by-checkpoint: id, type, final status, acceptance, commits, primary
outcome/evidence pointer, blocking and nonblocking follow-up counts — plus the
delivered capability summary, the E01 evidence pointer, the frozen artifact
baseline, the full follow-up inventory with owners, the APP3 surface-gate
disposition, repository state and the APP6 handoff. It states explicitly:

```text
blocking follow-ups = 0
APP5-E01 = COMPLETE
APP5-X01 = COMPLETE
```

---

## 12. Residual risks

Real, and none of them blocking:

1. **No external notification provider exists** (`IMP-O006`, APP4-owned). APP5's
   customer confirmation rides the APP4 grant link, and APP4 ships the recording
   adapter only. Until a provider is chosen, a submitted request's secure link
   does not reach a real customer inbox in production. APP5 adds no new intent,
   so this is inherited, not created.
2. **The `crypto.randomUUID` class of defect is corrected in APP5's file only.**
   The identical call remains in the APP3 Studio image upload
   (`FU-APP5-E01-STUDIO-RANDOMUUID-01`). Off a secure origin it will fail the same
   silent way. Production is HTTPS, so the exposure is development and any
   internal HTTP host.
3. **The development stack cannot open a Design Session**
   (`FU-APP5-E01-HOST-COOKIE-DEV-01`). Anyone exercising the catalog branch on
   `http://embroidery.local` will see `SESSION_NOT_AUTHORIZED` and may mistake a
   configuration default for a product defect. Production is unaffected.
4. **44 APP3 gates cannot pass on the current tree.** Now classified
   `HISTORICAL_SCOPED` and documented, but a future checkpoint that reads only the
   old prose could still waste a cycle on them, or worse, "fix" a count. §1.1 of
   the command index exists to prevent both.
5. **Three approved design elements are absent by contract, not by omission** —
   the confirmation summary panel, the masked contact and the Admin queue count.
   A reviewer comparing the shipped screens against Figma will see gaps; each is
   recorded with the reason no honest implementation exists yet.
6. **`design_versions` cannot hold a customer-owned-product design.** Four
   catalog placement columns are `NOT NULL`. APP6 must resolve this before it can
   version a COP request's design.

---

## 13. Next phase

The canonical roadmap defines the next phase as:

```text
APP6 — Design Review, Approval and Quotation
```

APP5 hands it the request states, the audit history, the request-bound
customer-owned product and assets, the quantity lines, the already-issued
`REQUEST_ACCESS` grant and the Admin surface to extend. See the closure matrix §9
and the phase plan §11.2.

```text
APP5 CLOSED — READY FOR NEXT PLANNED PHASE
```

Not started here.
