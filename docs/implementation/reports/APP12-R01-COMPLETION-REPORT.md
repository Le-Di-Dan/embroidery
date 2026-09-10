# APP12-R01 — Completion Report

Wave-1 Ready-Made release gate (2026-09-10). A production-readiness decision
only: nothing was deployed, nothing was pushed, and W01–W04 and R02 were not
started.

## A. Verdict

```text
APP12-R01 = COMPLETE — PO_REVIEW_REQUIRED
WAVE1_RELEASE_VERDICT = NO_GO
  reason class: NO_GO_PENDING_EXTERNAL_INPUT
                + NO_GO_PENDING_MANUAL_PREREQUISITE   (§D)
                + BLOCKED_DESIGN_RECONCILIATION_ENVIRONMENT (§E)

READY_MADE_RUNTIME_BLOCKERS = 0
PRODUCTION_DEPLOYED = false
PUSHED              = false
NEXT                = PO_REVIEW_REQUIRED
```

The implementation is healthy. Every mechanical gate that R01 owns and that
does not depend on an absent external value passes. The release candidate at
`5ad3495c` builds into four immutable images and passes a production-like
browser smoke at 16/16. The verdict is `NO_GO` because a GO needs things the
repository cannot supply and must not invent:

- production values: merchant bank account, SMTP relay, domain, object store,
  secrets and store facts;
- a human real-inbox proof;
- a live-Figma copy reconciliation;
- the ADR-reserved production topology and backup/restore authority.

Per §18, this `NO_GO` is a correct result of the gate. No product code was
changed to avoid it.

## B. E01 final reconciliation

```text
APP12-E01-C1 = COMPLETE — PO PASS        committed 5ad3495c
APP12-E01    = COMPLETE_AFTER_C1 — PO PASS
APP12-U01    = COMPLETE_AFTER_C1 — PO PASS
APP12-N01    = COMPLETE — PO CLOSED
APP12-N02    = COMPLETE — PO CLOSED
FU-APP12-E01-01 = CLOSED   FU-APP12-H02-01 = CLOSED
E01_CORRECTION_USED = 1/1  NO_E01_C2 = true
```

The E01-C1 working tree was committed as the first step of this checkpoint
(`5ad3495c fix(app12): the order link finally leaves as a link`). The
committed tree is byte-identical to the one C1 validated. The release
candidate is that commit.

## C. Runtime blocker count

```text
READY_MADE_RUNTIME_BLOCKERS = 0
```

Nothing in §2's closed list was contradicted. The release-candidate smoke
(§U) re-exercised the most recently changed path, the SMTP `ORDER_ACCESS`
delivery, on the release commit, and it passed.

## D. Real-inbox ORDER_ACCESS release proof

```text
ORDER_ACCESS_REAL_INBOX_MANUAL = NOT_EXECUTED
R01 sub-status = AWAITING_MANUAL_ORDER_ACCESS_REAL_INBOX
→ NO_GO_PENDING_MANUAL_PREREQUISITE
```

This proof needs the operator's real SMTP provider credentials and a human
reading a real inbox. `CLAUDE.md` §8a forbids using a secret-bearing variable
without asking for it, and no credential was requested or used. Capture-based
evidence (the loopback SMTP listener in §U) was **not** substituted for it.

The PO runs the nine-step check in the R01 prompt §3.1:

- subject `Liên kết theo dõi đơn hàng Nét Thêu`;
- heading `Theo dõi đơn hàng của bạn`;
- CTA `Mở đơn hàng`;
- expiry `72 giờ`;
- the correct order opens;
- the fragment is stripped;
- no token appears as a code;
- no PHONE/SMS path.

The OTP half of this proof is already PASS (`APP12-N01`, real inbox, 3/3).

## E. U01 Figma-copy reconciliation

```text
U01_FIGMA_COPY = BLOCKED_DESIGN_RECONCILIATION_ENVIRONMENT
FIG-APPROVAL-APP12-R01-U01-COPY-PO-001 = unused
FIGMA_DESIGN_INDEX.md = unchanged
```

No live Figma frame could be opened in this session:

- the `figma-desktop` MCP server reported `ConnectionRefused` at session start;
- the remote Figma plugin exposes only an interactive authentication call.

No node was read, modified or superseded. The frames to reconcile are the same
ones `APP12-U01-C1` §O named, and all are `APPROVED_FOR_IMPLEMENTATION`:

| Area | Registry row | Node |
|---|---|---|
| Admin Ready-Made amount card (F1/F3) | `FIG-APP12-A03-ORDER-DETAIL-DESKTOP` | `913:337` |
| Admin fee/payment panels (F3) | `FIG-APP12-A03-WORKBENCH-PANELS` | `914:361` |
| Storefront secure-order amount states (F2) | `FIG-APP12-S03-ORDER-ACCESS-DESKTOP` / `-MOBILE` / `-STATES` | `910:258` · `911:366` · `911:305` |
| Secure-link unavailable (F4) | `FIG-SECURELINK-DESKTOP-UNAVAILABLE` / `-MOBILE-UNAVAILABLE` | `629:37` · `629:87` |

The scope is copy only: no layout, token or interaction change, and historical
nodes are preserved. Owner: the design owner, with the PO approving under the
id above. Per the R01 prompt §3.2 this is no longer an optional carry, so the
verdict is `NO_GO`.

## F. Store facts

```text
STORE_FACTS = MISSING   (PO-APP12-002)
```

The single seam is `apps/storefront/src/features/content-pages/model/store-facts.ts`,
where `CANONICAL_STORE_FACTS = []`. The Local page and the footer both render
exactly the rows this module returns, so an absent fact is **omitted**, not
shown as a placeholder. No other file carries a store fact, and no environment
variable does either. Adding the four facts is a single edit in a reviewed
commit, and it lights up both surfaces.

The storefront degrades truthfully today, so no action is visibly broken. The
facts are still a PO-locked Wave-1 prerequisite (`PO-APP12-002` makes all four
required), so this item is **blocking**. Owner: Product Owner.

## G. Merchant payment config

```text
MERCHANT_PAYMENT_CONFIG = MISSING
```

The release-config gate reports all four keys as `MISSING`:
`PAYMENT_MERCHANT_BANK_BIN`, `PAYMENT_MERCHANT_ACCOUNT_NUMBER`,
`PAYMENT_MERCHANT_ACCOUNT_NAME` and `PAYMENT_MERCHANT_BANK_DISPLAY_NAME`.

- The production overlay leaves all four empty.
- No UAT or staging value is copied into it.
- The transfer reference is generated by the payment module per payment
  obligation, so it needs no input.
- No real transfer was made.
- `RB-14` §4.3 adds a human QR scan against a real banking app after the
  values are supplied.

Status: **blocking**. Owner: Product Owner / merchant account holder.

## H. Social production links

```text
SOCIAL_LINKS = MISSING   (NEXT_PUBLIC_ZALO_CONTACT_URL, NEXT_PUBLIC_MESSENGER_CONTACT_URL)
visible broken action = NO
```

Both URLs are optional build arguments of the Storefront image. The release
contract accepts "empty or a well-formed URL". The contact-handoff resolver
omits a channel whose URL is empty or malformed, so the approved dock
(`FIG-APP11-CONTACT-DOCK-*`, including `-MISSING-CONFIG`) never renders a dead
button.

Classification: **NONBLOCKING for safety**. The shipped UI cannot expose a
broken action. It is still a PO decision whether Wave 1 launches with the dock
empty. Both URLs are inlined at build time, so supplying them later needs an
image rebuild.

## I. SMTP / notification production config

Presence only; no value was read.

| Key | Where | State |
|---|---|---|
| `NOTIFICATION_TRANSPORT` | overlay | **missing** — must be `SMTP`; `RECORDING` refused |
| `SMTP_HOST` | overlay | **missing** |
| `SMTP_PORT` / `SMTP_SECURE` / `SMTP_REQUIRE_TLS` | base | present (`587` / `false` / `true` defaults) |
| `EMAIL_FROM_ADDRESS` | overlay | **missing** |
| `EMAIL_FROM_NAME` | base | present |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | Secret `embroidery-secrets` | operator-created; contract requires them; reference non-optional |
| `NOTIFICATION_DELIVERY_ENVELOPE_KEY` | Secret `embroidery-secrets` | operator-created; contract requires it; reference non-optional |

Fail-closed: the preflight refuses an empty or `RECORDING` transport. A
missing Secret key means the pod cannot start. It cannot start with the key
absent. Status: **blocking** (external input). Owner: operator.

## J. Production topology ownership

| Area | Classification | Evidence |
|---|---|---|
| GatewayClass / controller | `EXTERNAL_PREREQUISITE` — **blocking** | Gateway API locked (D-036); controller ADR-open; preflight `ROUTING: declares no gatewayClassName` |
| PostgreSQL | `EXTERNAL_PREREQUISITE` — **blocking** | §K |
| Object storage | `EXTERNAL_PREREQUISITE` — **blocking** | §L |
| Persistent storage policy | `EXTERNAL_PREREQUISITE` — **blocking** | depends on the two above; `monitoring_persistence` depends on it too |
| Backup / restore | **BLOCKING** | §M |
| TLS / edge | `EXTERNAL_PREREQUISITE` — **blocking** | §N |
| Secret injection | `SATISFIED` (mechanism) / `EXTERNAL_PREREQUISITE` (values) | named Secrets, non-optional references, preflight `checkSecrets` |
| Worker deployment / readiness / metrics | `SATISFIED` | §O |

`FU-APP12-H02-05` and `FU-APP12-H07-04` remain open. Both are owned by the
production-architecture ADR, which the repository has deliberately not taken.

## K. PostgreSQL persistence

```text
PRODUCTION_POSTGRES_OWNER = UNKNOWN (ADR-reserved)   → BLOCKING
```

The applications reach the database only through `DATABASE_URL`, and
`DATABASE_SSL_MODE=require` is set, with `disable` refused in production. The
base manifests own no PostgreSQL. The only in-cluster PostgreSQL is
`staging-scaffolding/`, which is labelled disposable and is not referenced by
the production kustomization (`resources: ../../base` only).

## L. Object storage

```text
PRODUCTION_OBJECT_STORAGE_OWNER = UNKNOWN (ADR-reserved)   → BLOCKING
```

The storage product is undecided. All three production keys are `MISSING`:
`OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_ORIGINALS_BUCKET` and
`OBJECT_STORAGE_DERIVATIVES_BUCKET`. MinIO exists only in compose and staging
scaffolding.

## M. Backup / restore

```text
BACKUP_RESTORE = BLOCKING
```

What exists and was re-validated here:

- `tools/db-backup.mjs` and `tools/db-restore.mjs`;
- a verified restore with sha256 and row-count/journal parity, which refuses to
  restore over a live database;
- `node --test tools/backup-runtime.test.mjs`: **8/8**.

What does not exist is listed in `RB-13` §2: the eight pre-R01 items. There is
no production topology to back up, no mechanism for it, no encryption at rest
(`DP-BAK-05`), no off-site copy (`DP-BAK-07`), no cadence (`DP-BAK-01`), no RPO
or RTO, and no operator restore rehearsal against a production-shaped database.

Object-storage bytes are not backed up at all. A database restore recovers
asset references only. The tooling reaches PostgreSQL through `docker exec`,
which does not apply to a Kubernetes or managed database (`FU-APP12-H07-04`).

No cloud or provider backup capability is claimed.

## N. Ingress / TLS

```text
EDGE = Gateway API (locked; no Ingress, no ingress-nginx)
CONTROLLER / gatewayClassName = MISSING   → BLOCKING
HOSTNAMES = MISSING (Gateway http/https listeners, 3 HTTPRoutes)
TLS = HTTPS listener references Secret embroidery-tls (operator-created)
```

The preflight reports 6 `ROUTING` findings. It would also refuse an HTTPS
listener that has no certificate reference. The chosen controller must also
re-prove graceful drain, and align its body limit with the API's 10 MiB
ceiling (`FU-APP12-H04-C1-01`; `RB-14` §4.1).

## O. Worker readiness / metrics / alerts

| Item | State |
|---|---|
| Worker deployment, readiness, metrics | `SATISFIED` — `METRICS_ENABLED=true`, port `9464`; H03 metric catalogue + 15 alert rules; H07-03 bootstrap half-start closed at E01 |
| `worker.runtime` policy | operator one-shot `operator/staff-bootstrap-job.yaml` (`RB-04`); a worker without it is fail-closed and claims nothing |
| **Alert receiver** | **`EXTERNAL_PREREQUISITE` — blocking.** `alertmanager.yml` routes all three receivers to the staging recording webhook `embroidery-alert-recorder`, which cannot reach a person (`production_alert_receiver`) |
| Grafana credential, monitoring persistence, retention | external (`RB-14` §4.6) |

## P. Release-config gate

`node tools/check-release-config.mjs production` → **FAIL (24)**, exit 1:

```text
MISSING (13): NOTIFICATION_TRANSPORT, SMTP_HOST, EMAIL_FROM_ADDRESS,
  STOREFRONT_PUBLIC_ORIGIN, STAFF_ALLOWED_ORIGINS, DESIGN_SESSION_ALLOWED_ORIGINS,
  OBJECT_STORAGE_ENDPOINT, OBJECT_STORAGE_ORIGINALS_BUCKET,
  OBJECT_STORAGE_DERIVATIVES_BUCKET, PAYMENT_MERCHANT_BANK_BIN,
  PAYMENT_MERCHANT_ACCOUNT_NUMBER, PAYMENT_MERCHANT_ACCOUNT_NAME,
  PAYMENT_MERCHANT_BANK_DISPLAY_NAME
IMAGE (5):   admin, api, storefront, worker Deployments + migrate Job
             — repository placeholder tag
ROUTING (6): Gateway gatewayClassName; http/https listener hostnames;
             HTTPRoutes admin, https-redirect, storefront — no hostname
```

`staging` → FAIL (9): the same SMTP/transport/sender keys and six placeholder
image tags, all externally supplied per run.

Every finding is an externally owned value. There is **no** `MALFORMED` or
`PRODUCTION` finding: the values the repository owns (`API_DOCS_ENABLED=false`,
`*_COOKIE_SECURE=true`, `DATABASE_SSL_MODE=require`,
`CUSTOM_EMBROIDERY_RELEASE_ENABLED=false`) are all correct. The checker was not
modified. `node --test tools/check-release-config.test.mjs`: **13/13**.

```text
RELEASE_CONFIG_GATE = FAIL → NO_GO_PENDING_EXTERNAL_INPUT
```

## Q. Production builds / artifacts

Source commit: `5ad3495cb80888b31abf6d51608159dce6e1f172`.

The four production `runner` stages were built from that tree with the
committed Dockerfiles. The images are local only: none was pushed, and the
tags are not release identities.

| Image (local tag) | Dockerfile | Result | Image ID |
|---|---|---|---|
| `embroidery-r01/api:5ad3495c` | `api.Dockerfile` | exit 0 | `sha256:7810b01ba801…` (435 MB) |
| `embroidery-r01/worker:5ad3495c` | `worker.Dockerfile` | exit 0 | `sha256:e3aec6c3455f…` (428 MB) |
| `embroidery-r01/admin:5ad3495c` | `admin.Dockerfile` | exit 0 | `sha256:0e50bd844b4f…` (283 MB) |
| `embroidery-r01/storefront:5ad3495c` | `storefront.Dockerfile` | exit 0 | `sha256:a850367abe82…` (286 MB) |

The builds took 22–50 s, which means Docker reused its layer cache for the
dependency-install stages. Each `build` stage starts with `COPY . .` from the
current tree, so the compile step reflects `5ad3495c`. Local image IDs are not
registry digests. A registry push would produce those, and pushing was out of
scope.

Identity mechanism: the production overlay pins every image through
`images[].newTag`. The preflight refuses a placeholder, `latest`, a bare tag or
a sequence tag, and accepts a git-SHA tag or a `@sha256:` digest. `RB-01`
requires digests at deploy time. `REPLACE_WITH_IMMUTABLE_RELEASE_REF` stays
until a registry exists, which is an external input.

The Storefront image was built with the synthetic origin
`https://rc.embroidery.invalid`, because its policy routes prerender. It is a
build-verification artifact, not a deployable one. A production Storefront
image must be rebuilt with the real `STOREFRONT_PUBLIC_ORIGIN` and the two
contact URLs, all of which are build-time values.

The release-candidate smoke (§U) also built Storefront and Admin fresh from
this source (`BUILD_ID` `d0bVzNmtr_lFa6pJl_C7r` / `bM4udQmctPbSbGkYcm1bE`);
no stale `.next` was used. `openapi:check` rebuilt the API with `nest build`.

## R. Migration gate

```text
migration files       39   (last 0039_add_app12_product_media_invariants.sql)
0040                  absent
checksum manifest     node packages/database/tools/db-migration-checksum-check.mjs
                      → "all 39 migration files match the frozen manifest"
shared dev journal    39 applied, 79 base tables (read only)
disposable apply      1..39 applied by the §U orchestrator to a fresh embroidery_db7_e2e_* database
```

Schema changes happen only through the migrate Job (`base/workloads/migrate-job.yaml`,
`RB-02`). No application boots a migration.

## S. Security release gate

| Control | Result | Evidence |
|---|---|---|
| CSP enabled | PASS | §U public project: 0 executable-inline violations on Product Detail, checkout and secure-order entry |
| checkout / order-access `noindex` | PASS | §U "the two private surfaces stay out of the index" |
| Admin cookie production flags | PASS | `STAFF_SESSION_COOKIE_SECURE=true`, `DESIGN_SESSION_COOKIE_SECURE=true`; the preflight enforces `true` in production |
| No debug/dev auth bypass | PASS | no bypass/disable-auth flag in `apps/*/src`; `API_DOCS_ENABLED=false`, enforced |
| No Recording transport in production | PASS (fail-closed) | the preflight accepts only `SMTP` |
| No test merchant values | PASS | production merchant keys are empty; none copied from UAT |
| No synthetic customer config | PASS | the overlay carries none; `RB-14` §8 data hygiene applies at deploy |
| No exposed MinIO credentials | PASS | MinIO only in compose/staging scaffolding; production credentials are Secret-only |
| No default insecure app secrets | PASS | no Secret value in Git; peppers and the envelope key are operator-created and non-optional |
| Framework/server version not disclosed | PASS | §U |
| Report secrets | PASS | `node tools/check-report-secrets.mjs` (§AC) |

## T. Wave-1 / Wave-2 isolation

```text
WAVE1_READY_MADE     = releasable independently
WAVE2_CUSTOM_EDITOR  = withheld
```

- `CUSTOM_EMBROIDERY_RELEASE_ENABLED=false` is stated in both the base and the
  production overlay. The API logged
  `event=release.gate.configured enabled=false` at boot during
  `openapi:check`.
- `release-gate.contract.spec.ts`: **15/15**.
- Storefront `wave2-cta-source` + `wave2-cta-suppression`: **56/56**.
- Storefront route authority gate: PASS.
- No release configuration enables any Wave-2 operation.

## U. Release-candidate smoke

`CMD-E2E-APP12-E01` on `5ad3495c`, in a disposable production-like world. The
world had:

- the real API;
- an in-process worker on `NOTIFICATION_TRANSPORT=SMTP` with a loopback SMTP
  capture;
- freshly built Storefront and Admin;
- a real Nginx gateway;
- disposable PostgreSQL and MinIO.

**16 passed (52.0 s).**

| Surface (§14) | Covered by |
|---|---|
| Storefront Product Detail, 200 + Offer, real 404 | public 14–16 |
| checkout entry, CSP | public 10 |
| EMAIL verification request path | commerce 3 (OTP read from the SMTP message) |
| ORDER_ACCESS email generation + claim | commerce 3–7, `channelAdapter=SmtpNotificationChannelAdapter`, `crossOrderIsolation=true` |
| Admin login + Ready-Made order detail | review 8 (step-up, `PAYMENT_UNDER_REVIEW`, axe 0 at 390/1440) |
| fresh build | commerce 2 (served `BUILD_ID` = built) |
| teardown | `cleanup verified: all E2E ports closed, disposable database dropped` |

Not covered by this run:

- **Storefront home/Discover.** The Storefront route-authority gate passed.
  H05/H06 lab evidence covers these surfaces.
- **Worker metrics endpoint.** Closed by the H03/H04 evidence and the E01
  bootstrap proof. Those prerequisites have not changed since E01.

Full order-to-completion was not repeated, because the release artifact does
not differ from the E01-C1 candidate.

## V. Performance reconciliation

Lab-only. There is no production p75 field data, and none is claimed.

```text
APP12-H05-C1 worst customer-critical medians:
  LCP 364 ms (≤ 2 500)   CLS 0.0008 (≤ 0.10)   INP 24 ms (≤ 200)   TTFB 17.4 ms (≤ 800)
```

| Follow-up | Disposition |
|---|---|
| `FU-APP12-H05-02` above-the-fold lazy / `fetchpriority` | `CARRIED_NONBLOCKING` — an optimisation; customer-critical LCP passes the budget with a wide margin |
| `FU-APP12-H05-03` Product Detail thumbnail-strip weight | `CARRIED_NONBLOCKING` — same reason |
| `FU-APP12-H05-04` Admin order-detail CLS 0.1316 | `CARRIED_NONBLOCKING` — operator surface only. V02 corrected the layout but did not re-measure CWV. The operator can still use the page |

No customer-critical Wave-1 page has a known lab failure. Field budgets must be
measured after launch.

## W. Figma / design gates

| Gate | Result |
|---|---|
| `node tools/check-figma-design-index.mjs` | **PASS** — 613 registry IDs, 613 node rows, 28 tables |
| `node tools/check-storefront-product-detail-authority.mjs` | **PASS** — 10 reconciled roots carry current authority, 4 UI03 roots historical |
| U01 copy reconciliation | **not discharged** — §E |

`REVIEW_REQUIRED` audit, high-fidelity rows only; annotations are excluded
because they authorise no screen:

| Rows | Assessment |
|---|---|
| `FIG-APP10-I01-FOOTER-DESKTOP/-MOBILE/-CTA-STATES` | historical. Demoted at `APP10-E01`. The shipped dock's authority is `FIG-APP11-CONTACT-DOCK-*`, all `APPROVED_FOR_IMPLEMENTATION` |
| `FIG-ADMIN-PUBLICATION-DESKTOP-READY/-BLOCKED/-CONFIRM-UNPUBLISH`, `FIG-ADMIN-PUBLICATION-MOBILE` (APP2-D01) | stale. The `/products/{productId}` publication and readiness surface ships from the 21 `FIG-APP12-N02-D01-*` rows, all approved under `FIG-APPROVAL-APP12-N02-D01-PO-001`. The APP2 rows were never marked superseded. This is a registry-hygiene gap, not an unapproved active frame. Filed `FU-APP12-R01-01`, **nonblocking**, owned by the next design checkpoint. R01 is not a design checkpoint and did not edit the registry |

No active Wave-1 implementation frame is `REVIEW_REQUIRED`. No Wave-2 design
was approved.

## X. Low-stock threshold disposition

```text
FU-APP12-U01-LOW-STOCK-AUTHORITY = CARRIED_NONBLOCKING
```

- The Admin stock view flags low stock only when
  `low_stock_threshold IS NOT NULL AND quantity_on_hand <= low_stock_threshold`
  (`sku-stock.view.ts`). An unset threshold therefore yields "not flagged", not
  a wrong flag.
- Publication readiness is forbidden from reading it
  (`PUBLICATION_STOCK_EXCLUSION` in `product-publication.policy.ts`).
- Order correctness uses reservations and quantity on hand, never the
  threshold.

Day-1 operations do not depend on changing it. No API or UI was added.

## Y. E01-02 schema debt disposition

```text
FU-APP12-E01-02 = CARRIED_NONBLOCKING
```

Mechanical inventory of `packages/contracts/openapi/openapi.generated.json`.
The criterion is a property with `type: object`, `nullable: true`, and no
`$ref` / `properties` / `allOf` / `oneOf` / `additionalProperties`, with each
schema traced transitively to the operations that reach it. It finds **19
properties in 7 schemas**:

| Schema | Reached only by |
|---|---|
| `AdminPlacementAreaResponse`, `AdminPlacementSideResponse` | `GET/PUT /api/admin/products/{productId}/placement` (Design Studio placement) |
| `PublicPlacementAreaResponse` | `GET /api/public/products/{slug}/placement` (Design Studio) |
| `CatalogRequestSubjectResponse`, `CustomRequestStatusResponse`, `CustomerOwnedRequestSubjectResponse`, `RequestQuantityLineResponse` | `POST /api/public/custom-requests/status` (Wave-2 custom request) |

**None is on a Wave-1 Ready-Made runtime operation.** The E01 report counted
"eleven" schemas under a looser criterion that included lost `$ref` object
references. The strict count is recorded here so the owner starts from a
measured list. The generated-client effect is
`{ [key: string]: unknown } | null` in place of `string | null` on Wave-2 and
Studio reads. That is no Wave-1 release risk.

## Z. N01/U01 operational debt disposition

| Finding | Production truth | Classification |
|---|---|---|
| `FU-APP12-N01-OPS-01` dev worker image stale after a workspace dependency | The production `runner` image installs from the frozen lockfile (`prod-deps`, `pnpm install --frozen-lockfile`) and is rebuilt per release. §Q built it from current source | `PRODUCTION_SAFE` (dev: `DEV_ONLY_NONBLOCKING`) |
| `FU-APP12-N01-OPS-02` dev stack may omit `NOTIFICATION_DELIVERY_ENVELOPE_KEY` | The production Secret contract requires the key, and the reference is non-optional, so the pod cannot start without it | `PRODUCTION_SAFE` (dev: `DEV_ONLY_NONBLOCKING`) |
| `FU-APP12-N01-OPS-03` gateway retains a stale API upstream after recreate | This is the dev Nginx container caching a container IP. Production routes through Gateway API to Kubernetes Services with stable virtual IPs. The controller-specific endpoint-reconfiguration behaviour is already in `FU-APP12-H02-05` | `PRODUCTION_SAFE` (dev: `DEV_ONLY_NONBLOCKING`) |

No local-development convenience was changed.

## AA. Shared-dev integrity

```text
shared_dev_mutations = 0
shared dev (read-only census): 79 tables · 39 migrations · orders 0 ·
                               payment_attempts 0 · products 37
```

The census matches E01-C1 (79 tables, orders 0). The G03 persistent catalog
was not touched. The only write world was the §U disposable
`embroidery_db7_e2e_190881b65c0_19088`, which was dropped with verified
teardown. No `.env` write, no secret-bearing variable used, no credential
rotated.

## AB. Files changed

```text
5ad3495c  (E01-C1 commit, prerequisite; see its report)
docs/implementation/reports/APP12-R01-COMPLETION-REPORT.md          new
docs/implementation/evidences/APP12-R01-EXTERNAL-INPUTS-REQUIRED.md new
docs/implementation/phases/APP12-HARDENING-UAT-PRODUCTION-READINESS.md
    status header; rows 30·C1, 31 (PO PASS) and 32 (R01)
```

No runtime, infrastructure, tool, migration, OpenAPI or registry change.

## AC. Validation

| Command | Result |
|---|---|
| `node tools/check-release-config.mjs production` | FAIL (24) — all external (§P) |
| `node tools/check-release-config.mjs staging` | FAIL (9) — all external |
| `node --test tools/check-release-config.test.mjs` | 13/13 |
| `node --test tools/backup-runtime.test.mjs` | 8/8 |
| `node packages/database/tools/db-migration-checksum-check.mjs` | 39/39 match |
| `pnpm --filter @embroidery/api openapi:check` | up to date |
| `node tools/check-figma-design-index.mjs` | PASS |
| `node tools/check-storefront-product-detail-authority.mjs` | PASS |
| `node tools/check-storefront-route-authority.mjs` | PASS |
| `node tools/check-runbook-references.mjs` | PASS |
| `pnpm --filter @embroidery/api exec jest src/platform/release-gate/release-gate.contract.spec.ts` | 15/15 |
| `pnpm --filter @embroidery/storefront exec jest test/boundary/wave2-cta-source.test.ts test/components/wave2-cta-suppression.test.tsx` | 56/56 |
| `pnpm --filter @embroidery/e2e-testing e2e:app12:e01` | 16/16 (52.0 s), teardown verified |
| `docker build --target runner` × 4 | §Q |
| OpenAPI nullable inventory (scratch script, read-only) | 19 properties / 7 schemas, all non-Wave-1 |
| `node tools/check-report-secrets.mjs` | PASS |
| `git diff --check` | clean |

No repository-wide aggregate was run.

## AD. External-input handoff

[`evidences/APP12-R01-EXTERNAL-INPUTS-REQUIRED.md`](../evidences/APP12-R01-EXTERNAL-INPUTS-REQUIRED.md)
lists names, reasons, locations and safe formats only, with no values. It
covers:

- release configuration;
- merchant bank keys;
- the Secret keys;
- store facts;
- social URLs;
- ADR decisions;
- monitoring;
- release identity;
- the two human proofs.

## AE. Final blocking matrix

| # | Item | Class | Owner |
|---|---|---|---|
| 1 | `ORDER_ACCESS_REAL_INBOX_MANUAL` | BLOCKING — manual | Product Owner |
| 2 | U01 Figma copy (`FIG-APPROVAL-APP12-R01-U01-COPY-PO-001`) | BLOCKING — environment/design | design owner + PO |
| 3 | Store facts (`PO-APP12-002`) | BLOCKING — external input | Product Owner |
| 4 | Merchant bank config + QR scan | BLOCKING — external input | Product Owner / account holder |
| 5 | SMTP relay, sender, SMTP credentials, envelope key | BLOCKING — external input | operator |
| 6 | Domain, origins, `gatewayClassName`, TLS | BLOCKING — ADR + external input | architecture owner / operator |
| 7 | Production PostgreSQL topology | BLOCKING — ADR (`FU-APP12-H02-05`) | architecture owner |
| 8 | Production object storage | BLOCKING — ADR (`FU-APP12-H02-05`) | architecture owner |
| 9 | Backup/restore authority (RB-13 §2, 8 items) | BLOCKING — ADR + operator (`FU-APP12-H07-04`) | architecture owner / operator |
| 10 | Production alert receiver | BLOCKING — external input | operator |
| 11 | Immutable release image references | BLOCKING — external (registry) | release operator |
| 12 | Social URLs | NONBLOCKING (no broken action); PO launch decision | Product Owner |
| 13 | `FU-APP12-H05-02/-03/-04` | CARRIED_NONBLOCKING | performance follow-up owner |
| 14 | `FU-APP12-U01-LOW-STOCK-AUTHORITY` | CARRIED_NONBLOCKING | Product Owner (future authoring) |
| 15 | `FU-APP12-E01-02` | CARRIED_NONBLOCKING | API contract owner (Wave-2) |
| 16 | `FU-APP12-N01-OPS-01..03` | PRODUCTION_SAFE / DEV_ONLY_NONBLOCKING | dev environment owner |
| 17 | `FU-APP12-R01-01` stale APP2-D01 publication rows not marked superseded | NONBLOCKING — registry hygiene | next design checkpoint |
| 18 | E01 intermittent harness timing (review pre-hydration fill; one missing CSP header) | NONBLOCKING watch item — not observed in the R01 smoke | e2e harness owner |

## AF. Release verdict

```text
APP12-R01 = COMPLETE — PO_REVIEW_REQUIRED
WAVE1_RELEASE_VERDICT = NO_GO   (NO_GO_PENDING_EXTERNAL_INPUT)

READY_MADE_RUNTIME_BLOCKERS = 0
PRODUCTION_DEPLOYED = false
PUSHED = false
```

Once items 1–11 are supplied and re-run through this gate, and nothing else
changes, the expected outcome is `GO` or `GO_WITH_NONBLOCKING_FOLLOWUPS` (items
12–18). The re-run consists of:

- the preflight PASS;
- the real-inbox proof;
- the Figma approval;
- the QR scan;
- a verified restore on the chosen topology.

## AG. Next authority

```text
NEXT = PO_REVIEW_REQUIRED
```

W01, W02, W03, W04 and R02 were not executed. Production deployment remains
separately authorized (`RB-14` §10).
