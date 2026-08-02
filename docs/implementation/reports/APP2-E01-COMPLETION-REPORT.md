# APP2-E01 — Publication Cross-Layer Journey — Completion Report

> **SUPERSEDED IN PART BY `APP2-E01-C1`.**
> The reviewer returned this checkpoint as `CORRECTION_REQUIRED`: §B and §J of
> this report describe a disposable database built from a `pg_dump --schema-only`
> snapshot of the developer's database, with two prerequisite tables copied out
> of it. That path can inherit local drift, can never fail when the migration
> runner is broken, and depends on developer state, so it cannot close a
> reproducible production journey. `APP2-E01-C1` replaces it with the canonical
> migration path — an empty disposable database migrated by
> `pnpm --filter @embroidery/database db:migrate` and verified against the
> committed DB6 checkers and the frozen fingerprint — and re-runs the whole
> journey. §M-1's masonry wording is also restated there.
> Everything else below still stands and was re-proved.
> Read [`APP2-E01-C1-CORRECTION-REPORT.md`](./APP2-E01-C1-CORRECTION-REPORT.md)
> for the current evidence.

- Checkpoint: `APP2-E01`
- Phase: APP2 — Assets and Catalog Publication
- Status: **COMPLETE**
- Date: 2026-08-02
- Branch: `production`
- Commits: exactly two (see §L)

---

## A. Preflight and accepted phase chain

`APP2-E01` is the phase's cross-layer acceptance checkpoint. It implements no
product behaviour; it proves that the behaviour already accepted in the
checkpoints below composes into one real publication journey.

| Checkpoint | Contribution consumed by E01 | Status |
| --- | --- | --- |
| `APP2-I02` / `APP2-I03` | worker runtime, private bucket bootstrap | accepted |
| `APP2-B01` | streaming multipart asset intake | accepted |
| `APP2-W01` | asset inspection, `THUMBNAIL` + `CATALOG_PREVIEW` | accepted |
| `APP2-B02` / `APP2-B02-G01` | Catalog draft backend, field taxonomy | accepted |
| `APP2-B03` / `APP2-B03-G01` | publish + `TR-LC04-05` unpublish lifecycle | accepted |
| `APP2-B04` / `APP2-B04-C1` | public catalog queries, keyset pagination | accepted |
| `APP2-T01` / `APP2-T01-C1` | public media delivery + production gateway | accepted |
| `APP2-A01`…`APP2-A04-C1` | Admin Assets, Product list, form, publication | accepted |
| `APP2-S01` / `APP2-S02` (+ `-C1`) | Discover feed, Product Detail | accepted |

Checkpoints declared `MUST_NOT_BE_CREATED` / `NOT_APPLICABLE` were not created:
`APP2-A03-C2`, `APP2-A04-C2`, `APP2-T01-C2`, `APP2-B04-C2`, `APP2-D04`,
`APP2-S01-C1`, `APP2-S02-C2`.

No product source file was changed by this checkpoint. The diff is a test
harness plus one `package.json` script plus this report.

---

## B. Environment and isolation

The journey runs against a **disposable production topology**, never the
developer's running stack and never the developer's data.

| Concern | How isolation is guaranteed |
| --- | --- |
| Applications | four images built from the canonical `runner` Dockerfile stages (API, Admin, worker, Storefront), run with `NODE_ENV: production` and `volumes: !reset []` — zero development mounts, asserted per container |
| Database | a disposable TLS-only PostgreSQL container; schema loaded from `pg_dump --schema-only` of development (read, never written) plus a data-only copy of the three migration-owned prerequisite tables (`categories`, `policy_configurations`, `policy_configuration_versions`) |
| Object storage | a disposable MinIO (`minio-e01`) with its own buckets; the development store is never touched |
| Gateway | the tracked gateway is recreated with **one added** temporary TLS listener, from a self-signed certificate generated into a temp directory; `--no-deps` prevents Compose from waking the development one-shots (`db-migrate`, `staff-bootstrap`) against the developer's database |
| Restore | a `finally` block restores every development service and asserts zero residual images, zero residual containers and removal of the temporary directory |

### Why TLS is present at all

The API refuses to issue a staff session without a `Secure` cookie in
production, and the tracked gateway terminates plain HTTP only. Without TLS a
real production Admin login is impossible, so the journey could only have been
proven by weakening the cookie guard — which the checkpoint forbids. The
listener is additive, ephemeral, temp-directory-only, and removed on exit. The
`Secure`/`HttpOnly`/host-only cookie is **asserted**, never injected: the
harness contains no `addCookies`, no `document.cookie`, and no
`STAFF_SESSION_COOKIE_SECURE: false` (regression-tested).

### Credentials

Nothing was read from any repository `.env`. The staff identity is generated for
the run, reaches the container only through `docker exec --env`, and is never
placed on a command line, printed, logged, committed or recorded here. The
disposable database's password is generated per run; `embroidery_dev_password`
appears nowhere in the harness. No credential was rotated or re-seeded.

---

## C. Evidence model — baseline and delta, never deletion

The disposable copy inherits the development **schema**, and its evidence tables
carry the real append-only immutability triggers. An early design deleted
pre-existing rows to start from empty tables; PostgreSQL refused
(`immutability violation: DELETE on frozen row of table asset_inspections`), and
that refusal is correct — it is exactly the guard append-only evidence should
have.

The journey therefore **deletes nothing**. It captures a baseline of counts,
identifies its own Asset by set difference against the pre-existing ids, and
measures every Audit/Outbox claim as a delta. Measured baseline for the accepted
runs was all-zero for mutable catalog facts, `categories: 4`, `workerPolicy: 1`.

---

## D. The journey, stage by stage

All figures below are quoted from the final accepted run.

### D1. Authenticate (production Admin, over HTTPS)

- login form served at `https://admin.embroidery.local:8443/login`
- session cookie `__Host-adm_session` — `secure: true`, `httpOnly: true`,
  `sameSite: Strict`
- no credential in the resulting URL

`STAFF_ALLOWED_ORIGINS` is pointed at exactly the browser origin, because the
default allowlist correctly rejected the HTTPS origin as a CSRF mismatch.

### D2. Upload a real catalog image

A deterministic project-owned PNG (256×256, 91 022 bytes, real IHDR/IDAT/IEND)
is generated per run — nothing fetched from the network, no third-party image.
The Admin reports progress from real transferred bytes.

- exactly one Asset created (`existingBefore: 0`)
- `kind: CATALOG_MEDIA`, `classification: PRODUCTION_SENSITIVE`, stored privately

### D3. Worker inspection and derivatives

- Asset lifecycle reached `ACCEPTED` with a storage key
- exactly one `READY`, **unwatermarked** `THUMBNAIL`
- exactly one `READY`, **unwatermarked** `CATALOG_PREVIEW`
- no watermarked preview for a catalog asset
- worker attempt: `ASSET_PROCESSING` / `SUCCEEDED` / attempt 1
- `asset.inspection.requested` Outbox event `DISPATCHED: 1`

### D4. Draft, media, price

- one `DRAFT` Product with a **server-owned** slug (`tac-pham-e01-…`)
- redirect reached the real detail route `/products/{id}`
- no publication yet
- selected Asset became the first ordered media (`role: THUMBNAIL`, `order: 0` —
  `display_order` is 0-based)
- price saved through the UI as `numeric(14,2)` → `480000.00`
- optimistic-concurrency token advanced

### D5. Readiness and publish

- readiness reports every canonical requirement satisfied
- `DRAFT → PUBLISHED`
- one `product.published` Audit Event appended (dot-case action names, as the
  application actually writes them)
- one `product.published` Outbox Event appended, `PENDING`

### D6. Public visibility — Discover

- server-rendered `/kham-pha` HTML contains the Product
- card links to the canonical `/san-pham/{slug}`
- **no price or stock chrome** on the card
- real `THUMBNAIL` bytes render (`naturalWidth: 256`)
- appears under its own category filter (`thu-bong`)
- survives a hard refresh
- masonry column count never exceeds the approved 5 / 3 / 2 (see §N-1)

### D7. Public visibility — Product Detail

- pointer **and** keyboard activation both reach `/san-pham/{slug}`
- H1, category and story rendered
- real `CATALOG_PREVIEW` bytes render from the public media path
  (`natural: 256`)
- lightbox opens as a real dialog; Escape closes it and focus returns to the
  opener
- no commerce or deferred content
- mobile band held at 24 px / 342 px with no overflow (the `APP2-S02-C1`
  authority)
- every control meets the 44 px target (`undersized: 0`)

### D8. Unpublish and revocation

- the confirmation dialog (`role="alertdialog"`) states it is not a delete
- `PUBLISHED → DRAFT`; one `product.unpublished` Audit Event
- authoring facts survived (`media: 1`, `price: 480000.00`)
- Discover no longer contains the Product, filtered or not
- the detail route becomes `SAFE_STREAMED_NOT_FOUND`
- **both** previously live media paths now return a real HTTP **404**
- unknown and malformed slugs use the same safe surface
- anonymous Admin access is still refused

### D9. Republish, then final unpublish

- readiness satisfied again; `DRAFT → PUBLISHED`; Audit 1 → 2; Outbox `PENDING: 2`
- republish **reused** the existing Asset, media and derivatives
  (`media: 1`, `derivatives: 2` — unchanged)
- the server-owned slug is unchanged; the same route serves the Product again
- final unpublish returns it to `DRAFT` with authoring facts intact

### D10. Balance, boundaries and non-disclosure

- Audit added by E01 balances: `published 2` / `unpublished 2`
- Outbox added by E01 balances: `published 2` / `unpublished 2`
- publication events remain `PENDING` — no APP2 consumer owns them
- the worker claimed only registered `ASSET_PROCESSING` work
- no storage key, bucket or provider endpoint on any public surface
- no raw domain code, request id, stack or SQL on any public surface
- the private object store is not reachable through the gateway (404)

---

## E. Two green runs

The checkpoint requires the complete journey to pass twice. It did, identically:

| Run | Result | Restore |
| --- | --- | --- |
| penultimate accepted run | `== summary: 105/105 passed ==`, exit 0 | all four development services restored; `residualImages: 0`, `residualContainers: 0`, temp directory removed |
| final accepted run | `== summary: 105/105 passed ==`, exit 0 | identical |

The preceding run reported `97/105`; those eight failures were harness defects
(see §K), each fixed before the two accepted runs. No assertion was weakened or
removed to reach green — the corrections changed how the harness drives and
reads the application, never what it demands of it.

---

## F. Files added

| File | Lines | Responsibility |
| --- | --- | --- |
| `tools/smoke-app2-e01-tls.mjs` | 193 | ephemeral certificate, TLS listener template, gateway override |
| `tools/smoke-app2-e01-topology.mjs` | 201 | disposable object store, production Admin/worker images and swaps |
| `tools/smoke-app2-e01-fixtures.mjs` | 293 | disposable-database SQL, baseline/delta evidence, PNG generator, staff bootstrap |
| `tools/smoke-app2-e01-admin-browser.mjs` | 367 | Admin journeys driven through real application copy |
| `tools/smoke-app2-e01-storefront-browser.mjs` | 357 | anonymous Discover / Detail / revocation journeys |
| `tools/smoke-app2-e01-journey.mjs` | 334 | the ordered journey and its cross-layer assertions |
| `tools/smoke-app2-e01-publication-production.mjs` | 358 | orchestrator: build, isolate, run, restore |
| `tools/smoke-app2-e01-publication-production.test.mjs` | 327 | 32 Docker-free regressions on the harness shape |

Modified: `package.json` — one script,
`smoke:app2-e01-publication:production`.

Every file is inside the 400-line source / 600-line test limits.

---

## G. Docker-free regressions

The journey needs Docker and several minutes. The 32 regressions run in
milliseconds and guard what would otherwise silently rot: a service reverting to
development, the TLS gateway being skipped, the Secure-cookie guard being
disabled, a credential reaching a command line, development data being restored
into the disposable copy, or the stages being reordered so that public
visibility is asserted before anything is published.

```
node --test tools/smoke-app2-e01-publication-production.test.mjs
# pass 32
# fail 0
```

---

## H. Validation matrix

| Gate | Result |
| --- | --- |
| `pnpm quality` (format, lint, typecheck, unit/integration tests, `check:styles`, `check:frontend-boundaries`, `check:frontend-build-boundary`, `check:e2e`, `check:openapi`, `check:api-client`, `check:figma-design-index`, all authority checkers, `db:check:manifest`, `check:secrets`, `check-file-size`) | **exit 0**, `# pass 344 / # fail 0` |
| `pnpm quality:e2e` | **exit 0**, `15 passed (16.1s)`; teardown verified all E2E ports closed and the disposable database dropped |
| `node --test tools/smoke-app2-e01-publication-production.test.mjs` | **exit 0**, 32/32 |
| `pnpm smoke:app2-e01-publication:production` | **exit 0**, `105/105`, twice |
| `check-file-size` | passed (36 files above the review threshold, none over the hard limit) |
| `git diff --check` | clean |

---

## I. Security posture

- no write of any kind to `.env`; no repository credential read
- no credential rotated or re-seeded
- no credential on a command line, in a log, in the report, or in a tracked file
- the production `Secure`/`HttpOnly`/`__Host-` cookie guard was proven, not
  bypassed
- append-only Audit/Outbox evidence was never deleted — the immutability
  triggers were left to do their job and drove the design
- the user-owned ignored `evidences/` directory was not created, deleted, staged
  or claimed

---

## J. Deviations

1. **A temporary TLS listener is added to the gateway.** Authorized by the
   checkpoint. Without it a real production Admin login cannot happen at all.
   Additive, ephemeral, temp-directory-only, removed on exit, regression-guarded
   against being skipped.
2. **The disposable database is restored from a development schema dump**, not
   from a second migration path. Schema only, plus the three migration-owned
   prerequisite tables. A full dump was tried first and rejected: it carried the
   developer's admin account (which correctly triggered
   `FAILED_EXISTING_ADMIN_MISMATCH` from the one-active-admin guard) and the
   developer's own products, which would have let the journey pass on data it
   did not create.

---

## K. Harness defects found and fixed (not application defects)

Recorded because each one, left in place, would have produced a *green* run that
proved less than it claimed:

- Compose `up` without `--no-deps` started the development one-shots against the
  developer's database.
- A duplicate YAML `api` key; a read-only mount into `/etc/nginx/templates`.
- Deleting evidence rows — refused by the immutability triggers; redesigned to
  baseline-and-delta.
- The worker declares no healthcheck, so `.State.Health.Status` rendered the
  whole inspect template empty.
- The default CSRF allowlist rejected the HTTPS origin.
- Selecting a file only *stages* an upload; the real flow needs
  `Bắt đầu tải lên`. The media picker is a per-asset checkbox plus
  `Dùng ảnh đã chọn`. `display_order` is 0-based. The unpublish dialog is
  `role="alertdialog"`.
- Audit actions are dot-case (`product.published`), not `PRODUCT_PUBLISHED` —
  surfaced by a deliberately added `observedActions` diagnostic that is still in
  the assertion payload.
- Commerce assertions initially read raw HTML, where the RSC payload
  legitimately carries the public API's `price`; they now assert **rendered
  text**.

---

## L. Commits

Exactly two, in order:

1. `test(app2): add publication cross-layer journey` — the eight harness files
   and the `package.json` script.
2. `docs(app2): record publication journey evidence` — this report.

Not pushed.

---

## M. Limitations and follow-ups

1. **Masonry column counts were measured at 1**, not 5 / 3 / 2. The assertion is
   an upper bound ("never exceeds the approved column count") and it holds, but
   the disposable database contains exactly one published Product, so the
   measurement cannot exercise the full grid. Column behaviour at population is
   already measured live by the accepted `APP2-S01` evidence; E01 does not
   re-prove it.
2. **`SAFE_STREAMED_NOT_FOUND` answers HTTP 200.** This is Next 16.2.10
   framework behaviour for `notFound()` from a dynamic segment, reconciled and
   accepted in `APP2-S02-C1`. E01 measures the surface (`noindex`, no product
   canonical, no product metadata, no product data, no raw cause) rather than
   the status code, and records the measured status honestly.
3. **Publication Outbox events stay `PENDING`.** Correct for APP2 — no consumer
   is in scope. When one arrives, this assertion must change with it.
4. The `DRAFT → ARCHIVED` transition gap noted in `APP2-B03-G01` is unchanged
   and out of scope here.

---

## N. Acceptance

| Criterion | Status |
| --- | --- |
| complete production publication journey proven end to end | met |
| every layer exercised: Admin UI, API, worker, database, object storage, Storefront, gateway | met |
| journey passes twice, identically | met (105/105, 105/105) |
| no development stack or development data mutated | met |
| no credential read, rotated, printed or committed | met |
| no append-only evidence deleted | met |
| development environment fully restored, zero residue | met |
| all quality gates pass | met |
| exactly two commits, not pushed | met |

**No acceptance criterion is unmet.**

---

## O. Scope confirmation

`APP2-E01` is complete. `APP2-X01` (phase closure) and APP3 were not started.
