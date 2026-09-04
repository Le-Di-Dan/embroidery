# RB-14 — Go-live checklist

The sign-off for the Wave-1 (ready-made direct commerce) production release.

**This checklist is not satisfiable today, and says so.** Section 4 lists inputs
that are externally owned and absent. None of them may be marked complete by
anyone who cannot name the actual value that was supplied. A checklist that
tolerates an optimistic tick is worse than none.

Production deployment is **separately authorized** — passing this checklist does
not authorize it.

## 1. Wave-1 scope

```text
WAVE                                = 1  (ready-made direct commerce)
CUSTOM_EMBROIDERY_RELEASE_ENABLED   = false, explicitly, in every environment
```

- [ ] The base ConfigMap and the production overlay both state `false`
      explicitly. The runtime is fail-closed when absent; that is not the point —
      a deployment that does not say which wave it is releasing is one nobody
      can review.
- [ ] `event=release.gate.configured enabled=false` observed in the API log at
      boot.
- [ ] All seven withheld Storefront routes answer `404` and `/truy-cap` answers
      `200` ([RB-01](RB-01-DEPLOYMENT.md) smoke).

## 2. Accepted checkpoint evidence

Each row is complete only when that checkpoint's completion report is accepted.
The report is the evidence; this table is the index.

| Area | Checkpoint | Evidence |
| --- | --- | --- |
| Security | `APP12-H01` (+ H02 sections Q–V) | Nonce CSP with neither `unsafe-inline` nor `unsafe-eval`, 0 Chromium violations across 8 pages; HTTP→HTTPS 301; HSTS at the HTTPS edge; redaction policy |
| Production configuration | `APP12-H02` | Immutable digest references; release-config preflight; fail-closed secret contract; rollback A→B→A; bad-config and failed-rollout evidence |
| Observability | `APP12-H03` (+ C1) | Metric catalogue; 15 alert rules in 7 groups with `promtool test rules` passing; Loki label contract; provisioned Grafana; live alert fire/resolve; canonical `worker.runtime` publication |
| Resilience | `APP12-H04` (+ C1) | Exactly-once invariants; poison job; DB and storage faults; late-policy adoption with credentials intact; 20s storage deadline; graceful drain |
| Performance | `APP12-H05` (+ C1) | Core Web Vitals; intrinsic media dimensions; CLS 0.0008 with zero variance |
| SEO and public readiness | `APP12-H06` | Soft-404 closed on both entity routes; canonicals; Product structured data; robots and sitemap on the real origin |
| Runbooks | `APP12-H07` | This directory, plus the two runbook-only operator rehearsals |

- [ ] Every row above is accepted, with no open correction.

## 3. Frozen baseline

Re-measure; do not copy from a previous report.

```text
OpenAPI              125 paths / 138 operations / 278 schemas
public operations    49
release matrix       28 DENY / 18 ALLOW / 3 SCOPE_GATED
migrations           38
DB base tables       79
Admin routes         26
Storefront routes    20
Figma               unchanged
```

- [ ] `pnpm --filter @embroidery/api openapi:check` reports no drift.
- [ ] `SELECT count(*) FROM drizzle.__drizzle_migrations` = 38.
- [ ] `information_schema.tables` public base tables = 79.
- [ ] `node tools/check-storefront-route-authority.mjs` passes.

## 4. Unresolved external inputs

**Nothing in this section may be ticked until a real value has been supplied by
its owner.** Every one is externally owned by design; the repository is ready
for each and invents none.

### 4.1 Architecture, ADR-reserved — `FU-APP12-H02-05`

```text
REQUIRED_BEFORE_R01, ADR REQUIRED
```

- [ ] Production **Gateway API controller** chosen and `gatewayClassName` set.
      The repository locks the edge to the Gateway API and Kubernetes Services
      and states that `ingress-nginx` will not be used; the concrete controller
      is an open decision.
- [ ] Production **PostgreSQL topology** resolved (managed service, StatefulSet,
      or otherwise). Moving persistence in either direction without the ADR is
      forbidden.
- [ ] Production **object-storage topology** resolved. The product is undecided.
- [ ] **Edge endpoint-reconfiguration behaviour** established for the chosen
      controller. Graceful drain was proved to be blocked in the rehearsal
      environment by an NGINX Gateway Fabric keep-alive reload, so the drain
      behaviour is controller-specific and must be re-proved on the production
      controller.
- [ ] **Edge body-limit alignment.** The Gateway's `client_max_body_size`
      defaults to 1 MiB while the API's own ceiling is 10 MiB, so 900 KiB is
      currently the largest upload that can reach the API
      (`FU-APP12-H04-C1-01`). Align them deliberately.

### 4.2 Release values

```text
REPOSITORY_READY, EXTERNAL_RELEASE_VALUE_REQUIRED
```

- [ ] `STOREFRONT_PUBLIC_ORIGIN` — the real canonical customer origin
- [ ] `STAFF_ALLOWED_ORIGINS` — the real Admin origin
- [ ] `DESIGN_SESSION_ALLOWED_ORIGINS` — the real customer origin
- [ ] `OBJECT_STORAGE_ENDPOINT` / `REGION` / bucket names
- [ ] `NEXT_PUBLIC_ZALO_CONTACT_URL`, `NEXT_PUBLIC_MESSENGER_CONTACT_URL` — real
      social URLs (`FU-APP10-I01-02`). **Build-time**: changing one requires an
      image rebuild, not a config change. Absence is legitimate and omits that
      one CTA; a *wrong* value is not
- [ ] `gatewayClassName`, Gateway and HTTPRoute hostnames — the real domain

### 4.3 Merchant configuration — validate, do not assume

The four `PAYMENT_MERCHANT_*` keys are deliberately **not secrets**: every one is
printed on the customer's own payment screen and encoded into the transfer QR
they scan.

- [ ] `PAYMENT_MERCHANT_BANK_BIN` — the real NAPAS acquirer id (exactly six
      digits; the preflight checks the shape, not the correctness)
- [ ] `PAYMENT_MERCHANT_ACCOUNT_NUMBER` — the real receiving account
- [ ] `PAYMENT_MERCHANT_ACCOUNT_NAME` — the real account holder
- [ ] `PAYMENT_MERCHANT_BANK_DISPLAY_NAME` — the real bank name
- [ ] **A human has scanned a generated QR with a real banking app** and
      confirmed it resolves to the correct account. The preflight validates
      shapes; only a scan validates the account. A wrong BIN sends a customer's
      money to a stranger.

### 4.4 Secrets

- [ ] `DATABASE_URL`
- [ ] `OBJECT_STORAGE_ACCESS_KEY_ID` and `OBJECT_STORAGE_SECRET_ACCESS_KEY`
      (both, or neither)
- [ ] `DESIGN_SESSION_SECRET_PEPPER` (≥ 32 chars)
- [ ] `VERIFICATION_CODE_SECRET_PEPPER` (≥ 32 chars, distinct)
- [ ] `SECURE_LINK_TOKEN_SECRET_PEPPER` (≥ 32 chars, distinct)
- [ ] `NOTIFICATION_DELIVERY_ENVELOPE_KEY` (base64 → exactly 32 bytes)
- [ ] `embroidery-tls` `tls.crt` and `tls.key`
- [ ] `STAFF_BOOTSTRAP_*` (optional in production)
- [ ] No value appears in Git, in a report, or in any log.
      `node tools/check-report-secrets.mjs` passes.

### 4.5 Notification provider — the hard Wave-1 blocker

```text
NOTIFICATION_PROVIDER = NOT_INTEGRATED
```

The only channel adapter bound in every deployment is the recording development
adapter: it appends the message to an in-memory array and reaches nothing
outside the process. **No customer has ever received anything from this system**,
and a notification reaching `DISPATCHED` only means the bound channel accepted
it.

Wave 1 cannot function without this. A Ready-Made customer's `ORDER_ACCESS`
link is their only credential for the order they just paid for, and a
verification code is the only way to start a checkout at all. Verified live in
the `APP12-H07` rehearsal: both codes and the order-access token were produced
correctly, sealed correctly, and delivered into process memory.

- [ ] A real notification provider is chosen (an ADR — this is the open
      "Authentication and OTP provider" decision), integrated, and configured
- [ ] A real code and a real order-access link have been received by a human on
      a real address

Do not tick section 7's "customer received the `ORDER_ACCESS` link" until this
is done; it cannot pass before then.

### 4.6 Monitoring

- [ ] `production_alert_receiver` — a real destination. Until it is supplied,
      **alerts fire into a recording webhook that cannot contact a person.**
      Substituting it is a value, not a redesign
- [ ] `grafana_operator_credential`
- [ ] `monitoring_persistence` — a storage class. Depends on 4.1
- [ ] `monitoring_retention` — an operator decision (staging uses 15d metrics /
      14d logs)

### 4.7 Backup and restore

- [ ] Every one of the eight items in
      [RB-13 section 2](RB-13-BACKUP-AND-RESTORE.md#2-the-production-gap--read-this-before-planning-a-go-live).
      Encryption at rest, an off-site copy, a cadence, an RPO and an RTO all do
      not exist yet, and **restoring the database does not restore a single
      uploaded object**

### 4.8 Public store facts

The Local page and the footer publish **only** facts the Product Owner has made
canonical, and omit the rest entirely rather than shipping a placeholder — an
invented plausible address is the option that fails silently, which makes it the
most dangerous.

```text
CANONICAL_STORE_ADDRESS  = NOT_AVAILABLE
CANONICAL_OPENING_HOURS  = NOT_AVAILABLE
CANONICAL_PHONE          = NOT_AVAILABLE
CANONICAL_EMAIL          = NOT_AVAILABLE
```

- [ ] Supplied, or consciously accepted as absent for launch. These are business
      copy in a reviewable commit, never environment configuration.

## 5. Pre-deployment gates

- [ ] `node tools/check-release-config.mjs production` → **PASS**
- [ ] `pnpm --filter @embroidery/api openapi:check` → no drift
- [ ] `node tools/check-runbook-references.mjs` → PASS (every command and path
      these runbooks name exists)
- [ ] `node tools/check-report-secrets.mjs` → PASS
- [ ] The monitoring configuration validators in
      [RB-11](RB-11-LOGS-AND-METRICS.md) all pass, offline
- [ ] A verified backup exists ([RB-13](RB-13-BACKUP-AND-RESTORE.md)) — "verified"
      means restored

## 6. Deployment

- [ ] [RB-02](RB-02-MIGRATION.md) — the migration Job reached `Complete`, and
      the post-check counts match
- [ ] [RB-01](RB-01-DEPLOYMENT.md) — all four Deployments rolled out; every image
      pinned by **digest**
- [ ] [RB-04](RB-04-STAFF-BOOTSTRAP.md) — the bootstrap one-shot ran;
      `result=CREATED` or `REUSED_EXISTING`; `worker.runtime` published
- [ ] The worker is **claiming**: backlog reaches zero, not merely falls
- [ ] The [RB-01](RB-01-DEPLOYMENT.md) smoke passes, including Wave-2 isolation

## 7. Post-deployment verification

- [ ] Grafana reachable by port-forward; the dashboard renders with real data
- [ ] Alerts reach the configured receiver — **test one deliberately**
- [ ] One complete Ready-Made journey, end to end, by a human: browse → order →
      shipping fee → payment link → transfer → verify → dispatch → complete
- [ ] The five invariants hold on that order: obligation `SATISFIED` once,
      attempt `SUCCEEDED` once, reservation `CONSUMED` once, stock decremented
      once, order `READY_FOR_DELIVERY`
- [ ] The customer received the `ORDER_ACCESS` link and it opens
- [ ] `/robots.txt` and `/sitemap.xml` carry the real origin
- [ ] The favicon and page titles are the production brand

## 8. Data hygiene

- [ ] **No test or `G03` data is present in production.** No seeded fixture, no
      synthetic order, no disposable customer
- [ ] `G03 data created = false`
- [ ] No disposable database exists on the production server
      (`node tools/db-disposable-inventory.mjs`, dry-run first)

## 9. Operational readiness

- [ ] The operator who will run production has **read this directory**
- [ ] The operator has performed a payment reconciliation, including a
      `REQUIRES_REVIEW` resolution, in staging
      ([RB-06](RB-06-PAYMENT-RECONCILIATION.md))
- [ ] The operator knows the four rules in
      [the index, section 0](README.md#0-the-one-rule) — above all, that no
      recovery uses SQL
- [ ] An owner is named for each of: the cluster, the database, the object store,
      the domain and TLS, and the bank account
- [ ] The incident record location exists and is writable
      ([RB-12](RB-12-INCIDENT-RESPONSE.md))

## 10. Sign-off

```text
R01 GO                       = required, and is a separate decision
production deployment        = separately authorized
```

- [ ] Every unresolved input in section 4 is either supplied **or** explicitly
      accepted, in writing, by the person who owns the consequence
- [ ] R01 `GO` recorded

**Never mark an item in section 4 complete because the mechanism is ready.**
"Repository-ready" and "value supplied" are different states, and conflating
them is how a shop goes live with a payment account that belongs to nobody.
