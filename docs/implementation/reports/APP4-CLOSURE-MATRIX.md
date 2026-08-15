# APP4 — Canonical Closure Matrix

Built by `APP4-X01` from repository truth: Git history, the committed OpenAPI
artifact, the database manifest verifier, the Figma registry and the accepted
completion reports. Where this matrix and older planning prose disagree, **this
matrix is the current world**.

```text
APP4 = COMPLETE — PASS_WITH_FOLLOW_UPS — DELIVERED_FOR_REVIEW
APP4-X01 = COMPLETE — DELIVERED_FOR_REVIEW
APP5 = NOT_STARTED
```

---

## 1. Canonical checkpoint count

```text
canonical delivered checkpoints = 17
closure checkpoint              = APP4-X01 (this one)
```

`APP4-E01` is **one** canonical checkpoint. Its replan children — `E01-H01`,
`E01-H02`, `E01-R01`, `E01-R01-C1` — are constituent execution history under it,
not new roadmap checkpoints (§5).

The phase plan still names a planned `APP4-C01…C04` backend split that execution
replaced with `B02…B08`. That is stale planning prose; §7 records the
reconciliation.

---

## 2. The 17 canonical checkpoints

| # | ID | Type | Final status | Acceptance | Implementation commit(s) | Evidence commit(s) | Correction / unblock | Blocking FU | Nonblocking FU | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | APP4-P00 | phase entry | PASS — CLOSED_AFTER_MANDATORY_DIRECTIVE | accepted | `2044a31`, `096806c`, `445a936` | `108e488`, `a4ac4fd` | P00-C1 executed; mandatory closure directive executed | 0 | 0 | Closure added dead-letter replay + shared envelope authority |
| 2 | APP4-G01 | authority | PASS | accepted | `297d440` | `0e1b53b` | — | 0 | 0 | IMP-D049; policy shipped as data, published by B01 path |
| 3 | APP4-D01 | design | COMPLETE — PRODUCT_OWNER_APPROVED | PO-approved | `da55008` | `371c9ee`, `3dfede5` | A01 authority amendment (18 rows) | 0 | 0 | 48 registry rows on `APP_04` |
| 4 | APP4-P01 | package | PASS_AFTER_C1 | accepted | `2e09bf9`, `8ef463e` | `5fd0fad`, `78bb90c` | P01-C1 executed + accepted | 0 | 0 | Exact `libphonenumber-js` parsing replaced a heuristic |
| 5 | APP4-B01 | backend | PASS_AFTER_C1 | accepted | `e9bdbc3`, `eefdc82` | `31db2d9`, `bc468f0` | B01-C1 executed + accepted | 0 | 1 | `FU-APP4-B01-POLICY-GATE-STALE-01` |
| 6 | APP4-W01 | worker | PASS | accepted | (W01 feat) | `703f934` | — | 0 | 0 | Recording adapter only; no provider |
| 7 | APP4-B02 | backend | PASS | accepted | `f5bae1c` | `f5a927e` | — | 0 | 1 | `FU-APP4-B02-GATE-SCOPE-01` |
| 8 | APP4-B03 | backend | PASS | accepted | `1f38854` | `d8e3d96` | — | 0 | 0 | Issue + resend; cooldown from `created_at` |
| 9 | APP4-B04 | backend | PASS | accepted | `7edde3a` | `5e40eee` | — | 0 | 0 | Submit + status |
| 10 | APP4-B05 | backend | PASS | accepted | `e2c4b66` | `a7c3844` | — | 0 | 0 | `SecureGrantIssuer`, no HTTP endpoint |
| 11 | APP4-B06 | backend | PASS | accepted | `7ad1629` | `afec392` | — | 0 | 0 | Token-only resolve; server-owned target |
| 12 | APP4-B07 | backend | PASS | accepted | `3cd6351`, `96a7c8d` | `2780b03` | A01 authority unblock added `/customers/resolve` | 0 | 0 | 4 endpoints (cap 5) |
| 13 | APP4-B08 | backend | PASS | accepted | `ec9991a`, `96a7c8d` | `8552d86` | A01 authority unblock added `customerId` filter + outcome | 0 | 0 | `/replay`, `CREATED \| EXISTING` |
| 14 | APP4-S01 | storefront | PASS | accepted | `7cd3031` | `027bab3`, `c667c8c` | authority block → PO unblock | 0 | 4 | Masked-destination, attempt-count, handoff, error-granularity |
| 15 | APP4-S02 | storefront | PASS | accepted | `82ebe0c` | `e63d9c1` | — | 0 | 1 | `FU-APP4-S02-LIVE-REGION-COPY-01` |
| 16 | APP4-A01 | admin | PASS_AFTER_C1 | accepted | `97d11a9`, `257f17a`, `bc259c2` | `1b0e3e4`, `9893dcc`, `e1428cb` | authority block → PO unblock; A01-C1 executed | 0 | 2 | `FU-ADMIN-SHARED-DIALOG-01`, `FU-ADMIN-SHELL-NARROW-DESKTOP-01` |
| 17 | APP4-E01 | cross-layer | **PASS_AFTER_R01_C1** | accepted | see §3 | see §3 | replan H01/H02/R01 + R01-C1 | 0 | 0 | Constituent history in §3 |

**No `APP4-A01-C2`. No `APP4-E01-R01-C2`.**

---

## 3. APP4-E01 constituent history

One canonical checkpoint, five recorded stages. Intermediate blocked states are
history, **not** final checkpoint failures.

| Stage | Outcome | Commits | What it contributed |
| --- | --- | --- | --- |
| Initial E01 attempt | NOT COMPLETE — stopped honestly before any acceptance item | `b419073`, `f249363` | Repaired the live topology; closed `FU-APP4-DEV-API-IMAGE-01`; proved the worker seam feasible |
| `APP4-E01-H01` | **PASS** | `97fee5d`, `caeac8d`, `1491ece` | `--app4` mode, ephemeral APP4 config, two real in-process Nest contexts, `SecureGrantIssuer`, held poll gate |
| `APP4-E01-H02` | blocked → dependency-unblocked → **PASS** | `431bca2`, `62a6d5d`, `b059184`, `6deaea3` | Fixture/evidence/browser helper layer; blocked by a silent `staff-bootstrap` exit, unblocked under PO authority (`abortOnError`) |
| `APP4-E01-R01` | original canonical run | `88e4b4f`, `bd373ed` | 13 proofs across the real stack; three transport contracts proven distinct |
| `APP4-E01-R01-C1` | **PASS** | `396b498`, `80d9bd3` | Replay claimed/opened/delivered by real W01; expired-grant rejection; replay-path runtime-output scan |

```text
APP4-E01-R01 = PASS_AFTER_C1   (correction count = 1)
APP4-E01     = PASS_AFTER_R01_C1
```

---

## 4. Correction / manual-unblock reconciliation

| Event | Classification |
| --- | --- |
| `APP4-P00-C1` | executed + accepted |
| P00 mandatory closure directive | mandatory directive, executed + accepted |
| `APP4-P01-C1` | executed + accepted |
| `APP4-B01-C1` | executed + accepted |
| `APP4-S01` masked-destination block | **manual authority unblock** (not a correction) |
| `APP4-A01` authority block | **manual authority unblock** (not a correction) |
| `APP4-A01-C1` | executed + accepted — final A01 correction |
| `APP4-E01` H01/H02/R01 | **replan sub-checkpoints** (not corrections) |
| H02 `staff-bootstrap` dependency unblock | **manual dependency unblock** (not a correction) |
| `APP4-E01-R01-C1` | executed + accepted — final R01 correction |
| `APP4-A01-C2` | **never created — forbidden** |
| `APP4-E01-R01-C2` | **never created — forbidden** |

---

## 5. Exit-gate closure

All five gates close from **accepted evidence**. No runtime suite was rerun.

| Gate | Evidence | Source |
| --- | --- | --- |
| Gate 1 — secrets opaque, never logged | plaintext absent from persistence (6 tables) and browser surfaces; absent from API **and** worker replay-path output; worker opens a real encrypted envelope, sink is process memory only | R01 §D/§E/§I/§Q; R01-C1 §E/§I |
| Gate 2 — rate and expiry | resend eligibility from `created_at` cooldown, new secret on resend; expired grant → canonical unavailable | R01 §G; R01-C1 §H |
| Gate 3 — retries observable and idempotent | retry keeps intent/outbox/envelope/secret; terminal `FAILED` + `DEAD_LETTER`; manual replay mints new intent/outbox; **real W01 claims/opens/delivers the replay**; concurrent replay collapses to one | R01 §F/§L/§M/§N; R01-C1 §E |
| Gate 4 — grants enforce target/purpose/scope | target read from the stored grant, never accepted from the caller; `REQUEST_ACCESS` server-written; wrong target/purpose/scope structurally unrepresentable; revoked and expired both unavailable | R01 §H/§J/§K; R01-C1 §H |
| Gate 5 — E2E passes | `APP4-E01 = PASS_AFTER_R01_C1` | R01 + R01-C1 |

---

## 6. Security invariant closure — high-risk items

| Invariant | Disposition | Evidence |
| --- | --- | --- |
| Encrypted transient delivery envelope | PROVEN | R01 §M; R01-C1 §F |
| Worker-only plaintext lifetime | PROVEN | R01 §Q; R01-C1 §I |
| Fragment-only secure-link carrier | PROVEN | R01 §H/§I |
| Strip before app-controlled network activity | PROVEN | R01 §I (`stripBeforeRequest`) |
| Retry vs business resend separation | PROVEN | R01 §F/§G/§P |
| `DEAD_LETTER` immutability | PROVEN | R01 §M; R01-C1 §G |
| Manual replay copies without API decryption | PROVEN | R01-C1 §F |
| Stable non-secret intent↔outbox linkage | PROVEN | R01 §M; R01-C1 §D |
| Duplicate/concurrent replay safety | PROVEN | R01 §N |
| Lifecycle-aware `REISSUE_REQUIRED` | PROVEN | R01 §O |
| One shared envelope codec | PROVEN | B01 + W01 reports; `@embroidery/notification-delivery` |
| Production Customer Contact Point binding | PROVEN | R01 §H; R01-C1 §E |

**APP4 ships the recording adapter only. No external provider delivery is
claimed, and no production-readiness claim is made.**

---

## 7. Current-world authority reconciliation

| Fact | Stale value | **Current world** |
| --- | --- | --- |
| APP4 feature endpoints | 10 (P00 plan) | **11** |
| B07 endpoints | 3 | **4** (cap 5) |
| Admin manual transport operation | `/retry` | **`/replay`** |
| Backend checkpoint split | `C01…C04` | **`B02…B08`** |
| Notification→Customer binding | none | **B05 → B01 `recipientContactPointId` → `notification_intents.recipient_contact_point_id`** |

Current B07 surface:

```text
POST /api/admin/customers/resolve
GET  /api/admin/customers/{customerId}
GET  /api/admin/customers/{customerId}/grants
POST /api/admin/secure-grants/{grantId}/revoke
```

Current B08 surface:

```text
GET  /api/admin/notification-intents          (optional customerId filter)
POST /api/admin/notification-intents/{intentId}/replay   (CREATED | EXISTING)
```

---

## 8. Frozen artifact baseline

```text
OpenAPI
  paths      = 48
  operations = 53
  schemas    = 101
  sha256     = 02bd969c17aa3899209ed563d51c0add30142874fb64ee96294b1009528e8d7b
  freshness  = PASS (not regenerated)

Generated API client
  status    = up to date (not regenerated)
  tree hash = ee7ea2af2eb79f2ffc00b6a477167628f32d7995b50ab4e415bffc7bb9c2f90f

Database (node tools/db-manifest-check.mjs → PASS)
  tables            = 78
  physical columns  = 843
  IDX register rows = 84
  FK edges          = 164
  migrations        = 34
  latest migration  = 0034_add_app3_placement_and_derivative_authority.sql (APP3-owned)
  NO_APP4_MIGRATION = true

Figma (docs/design/FIGMA_DESIGN_INDEX.md)
  APP4 rows                              = 48
  FIG-APPROVAL-APP4-D01-PO-001           = 30
  FIG-APPROVAL-APP4-A01-UNBLOCK-PO-001   = 18
```

Delivered surfaces:

```text
Storefront  /xac-minh-lien-he · /truy-cap
Admin       /support/customer-access
```

---

## 9. Follow-up inventory

### Closed by APP4

| ID | Disposition | Evidence |
| --- | --- | --- |
| `FU-APP4-A01-INTENT-BINDING-COVERAGE-01` | **CLOSED** | A01-C1; production binding observed live in R01 §H |
| `FU-APP4-DEV-API-IMAGE-01` | **CLOSED** | Dockerfile workspace visibility fix; API healthy (`b419073`) |
| `FU-APP4-S02-LIVE-JOURNEY-01` | **CLOSED** | R01 §I — live fragment bootstrap against real B06 |
| `FU-APP4-B08-WORKER-JOURNEY-01` | **CLOSED_BY_R01_C1** | R01-C1 §E — replay claimed, opened, delivered, `SATISFIED` |
| A01 live B07/B08 lifecycle | **CLOSED** | R01 §K/§M — live revoke and replay |
| `FU-APP4-S01-MASKED-DESTINATION-01` | **CLOSED** | S01 delivered the server-published masked destination |

### Open — nonblocking, all concretely owned

| ID | Class | Owner | Activation condition | Disposition |
| --- | --- | --- | --- | --- |
| `FU-APP4-S01-ATTEMPT-COUNT-COPY-01` | nonblocking · copy | **APP12 — Hardening, UAT and Production Readiness** | UAT copy review | B04 deliberately withholds the remaining-attempt count (anti-oracle); revisit only if UAT rules the copy insufficient |
| `FU-APP4-S01-SUCCESS-HANDOFF-01` | nonblocking · product seam | **APP5 — Custom Requests and Customer-Owned Products** | APP5 owns post-verification request submission | APP4 success intentionally ends at verification; APP5 supplies the next step |
| `FU-APP4-S01-ERROR-CODE-GRANULARITY-01` | nonblocking · copy/UX | **APP12** | UAT copy review | Coarser error classes are a deliberate non-enumeration choice |
| `FU-APP4-S02-LIVE-REGION-COPY-01` | nonblocking · a11y copy | **APP12** | UAT accessibility review | Live-region wording only; the unavailable state itself is proven canonical |
| `FU-ADMIN-SHARED-DIALOG-01` | nonblocking · UI reuse | **APP6 — Admin Operations** (earliest phase owning shared Admin UI) | Next Admin surface needing the same dialog | Extract the confirm-dialog pattern when a second consumer exists |
| `FU-ADMIN-SHELL-NARROW-DESKTOP-01` | nonblocking · shell layout | **APP1 shell owner, scheduled in APP12** | Shell responsive pass | 240→200px sidebar rule at 1280 belongs to the APP1 shell, not APP4 |
| `FU-APP4-B01-POLICY-GATE-STALE-01` | nonblocking · tooling debt | **APP12** | Tooling/hardening sweep | Stale checker only; runtime evidence is current and independent |
| `FU-APP4-B02-GATE-SCOPE-01` | nonblocking · tooling debt | **APP12** | Tooling/hardening sweep | Stale checker only; not an APP4 correctness signal |
| `IMP-O006` | nonblocking · open decision | **APP12** | **Before production notification delivery** | APP4 ships `NotificationChannelPort` + recording adapter by design. **No provider selected, and none is claimed.** |

```text
blocking follow-ups    = 0
nonblocking follow-ups = 9
ownerless follow-ups   = 0
```

---

## 10. APP5 handoff

APP4 hands APP5 these accepted capabilities:

```text
verified Customer + primary verified Contact Point
exact contact normalization and masking authority
SecureGrantIssuer (internal application capability, no HTTP surface)
REQUEST_ACCESS grant lifecycle (issue / reissue / revoke)
StepUpWindow
public secure-link resolution
customer-safe Storefront secure-link shell
notification intake / outbox / worker port / manual replay
Admin Customer, grant and notification support
```

Boundary:

```text
custom_requests is APP5-owned.
APP4 never creates one in production — every APP4 test row is scaffolding.
APP5 calls SecureGrantIssuer once it owns an authorized Customer + Custom Request.
```

```text
APP5 = NOT_STARTED
```
