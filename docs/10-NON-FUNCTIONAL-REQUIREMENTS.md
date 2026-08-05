# 10 — Non-Functional Requirements

**Status:** Product quality baseline  
**Version:** 0.1.0

## 1. Quality stance

The application is production-grade, not a prototype.

## 2. Availability

Because the website is intended as the primary online channel:

- External uptime monitoring is required.
- Critical downtime must trigger alert.
- Self-hosting must account for power and network failure.
- Public site and payment callbacks must be reachable reliably.

Exact SLA is deferred.

## 3. Performance

At expected scale:

- 20–100 products.
- Under 100 orders/month.
- Under 10 concurrent editor users.

The system should still deliver:

- Fast initial storefront rendering.
- Optimized images.
- Lazy loading for heavy editor assets.
- Responsive editor operations.
- Non-blocking autosave.
- Reasonable upload progress.
- No full-page reload for editor interactions.

Exact performance budgets will be defined later.

The provisional editor budgets in IMP-D026 assume a bounded scene. `APP3-G04`
(IMP-D044 PO-08/PO-09) makes that bound explicit and enforceable: one Design
document may not exceed 512 KiB serialized, 100 elements, 20 image elements, 20
unique referenced assets or 33,554,432 decoded pixels across those assets, and a
single uploaded raster may not exceed 10 MiB, 4096 × 4096 px or 16,777,216
decoded pixels. These are correctness and abuse limits enforced server-side, not
performance targets — but they are what makes the 50-element budgets meaningful,
so a later budget revision must not raise them silently.

## 4. Reliability

Required patterns or equivalent outcomes:

- Idempotent payment handling.
- Safe retry.
- Transactional state changes.
- No duplicate order creation.
- No duplicate payment application.
- No lost design version.
- No overwrite of approved design.
- Safe inventory reservation and release.
- Recoverable background jobs.
- Asynchronous work that depends on an earlier stage completing must **wait and
  converge**, never record a terminal verdict on a stage that has not finished
  yet. Where two jobs for one asset can become visible together — as an
  anonymous Session upload's inspection and normalization do — the dependent job
  treats the not-yet-ready state as retryable under the existing lease, backoff
  and dead-letter policy, and stays terminal only for outcomes that cannot
  change (`IMP-D048` PO-08). Ordering is never inferred from insertion time.

## 5. Data integrity

- Monetary values use exact decimal representation.
- Historical quotation values are immutable.
- Approved design snapshot is immutable.
- State transitions are validated.
- Audit metadata is retained.
- Referential integrity is enforced.
- A Studio-eligible derivative carries its own canonical `width_px`,
  `height_px`, `media_type` and `byte_size` (`APP3-G04` / IMP-D044 PO-07/PO-12),
  written atomically with its transition to READY, all-or-none. Source-asset
  metadata and append-only inspection evidence are never substituted for it, and
  missing values make a derivative ineligible rather than inferred.
- Editor-safe normalization is **association-bound and idempotent**
  (`APP3-G06` / IMP-D046). It is dispatched by one event appended in the same
  transaction as the Product Side, Template or Session association write, on the
  existing Outbox and worker claim mechanism — no second queue, scheduler or
  sweep. The message names the association, never the processing profile, which
  the worker re-derives at claim time; logical identity is the Asset plus the
  normalization policy version, so duplicate delivery, several eligible
  associations and concurrent claims converge on **one** authoritative READY
  derivative, and an association that has since moved or retired completes as a
  bounded non-retryable rejection rather than an infrastructure retry.
- Template SVG normalization is **deterministic and reject-whole-file**
  (`APP3-G07` / IMP-D047). Sanitization is DOMPurify on server-side Node with
  jsdom, both pinned exactly, running in the SVG namespace with HTML and MathML
  disabled and XML parsing retained; `DOMPurify.removed` is diagnostic only. Any
  unsupported element, attribute or value rejects the **complete** file as
  `UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG` rather than being silently removed,
  because a Template that renders differently from what an Admin approved is a
  worse outcome than a refused upload — nobody is told. Output is canonicalized
  and then reparsed, revalidated, sanitized and reserialized, and the second
  bytes must equal the first: identical accepted source bytes plus the exact
  policy and dependency versions produce byte-identical output, and
  `width_px`/`height_px` are the `viewBox` width and height with no rounding,
  no DPI and no root-attribute fallback. No optimizer, and nothing at all, may
  modify the bytes after the final pass. `TEMPLATE_SVG_SANITIZATION_POLICY_VERSION`
  is worker policy, not a database column; changing the dependencies,
  allowlists, value grammar, limits or serializer requires security review, a
  corpus rerun and a version increase when behaviour changes.
- Design Document geometry semantics are part of the meaning of
  `schemaVersion = 1` (`APP3-G05` / IMP-D045). A v1 document stores `x`, `y`,
  `rotationDeg`, `scaleX` and `scaleY` with **no pivot or composition marker**,
  so changing the rotation pivot, rotation direction, scale origin, group frame,
  composition order, bounds strategy, containment strategy or `pxPerMm` source
  would relocate every stored design while its SHA-256 stayed valid — the hash
  is taken over the bytes, not over their interpretation. Such a change is a
  schema-semantic event requiring a new decision, a schema-version increase and
  an explicit document migration; it can never ship as an internal refactor.
  Approval, rendering and production systems must run a geometry-engine version
  compatible with the decision, and that compatibility must be recorded in
  approval and rendering evidence.
- The v1 stroke envelope is part of those semantics (`APP3-G05-C1`). Every kind
  storing `strokeWidthPx` expands its local geometry by `strokeWidthPx / 2` on
  all four sides **before** the envelope is transformed, and that envelope is
  what bounds, containment and physical-size validation use — a shape whose fill
  fits while its stroke overhangs is out of bounds. The fixed `lineJoin`/
  `miterLimit` for rectangle and `lineCap`/`lineJoin` for line and freehand, and
  the locked v1 line path `(0,0)` → `(width,height)`, are **version-level
  constants** rather than document fields; changing one changes painted bounds
  and is therefore a schema-semantic change, never a renderer refactor.

## 6. Accessibility

Public and customer flows should target accessible interaction:

- Keyboard support.
- Visible focus.
- Sufficient contrast.
- Form labels.
- Error announcements.
- Touch target size.
- Alternative text.
- Avoid color-only status communication.

Canvas-specific accessibility should provide meaningful non-canvas controls where feasible.

## 7. Responsive design

- Mobile-first storefront.
- Mobile-capable customizer.
- Desktop-enhanced precision tools.
- No horizontal overflow in normal customer flows.
- Important actions remain reachable on small screens.

## 8. Observability

System should provide:

- Structured logs.
- Error tracking.
- Health checks.
- Metrics for critical flows.
- Payment failure visibility.
- Backup failure alert.
- Disk usage alert.
- External uptime check.
- Audit logs for Admin actions.

Tooling is deferred.

## 9. Backup and disaster recovery

Minimum outcomes:

- Automated database backup.
- Off-site backup.
- Asset backup or replication.
- Documented restore process.
- Periodic restore test.
- Recovery procedure for complete server loss.

Exact RPO and RTO are deferred.

## 10. Maintainability

- Clear module boundaries.
- Explicit contracts.
- Database migrations.
- Automated tests.
- Code reviewable in small slices.
- Documentation kept versioned with code.
- No generated code dump without test evidence.
- Technical debt must be recorded explicitly.

## 11. Browser support

Final browser matrix is deferred.

At minimum, target modern versions of:

- Chrome.
- Edge.
- Safari.
- Mobile Chrome.
- Mobile Safari.

## 12. Privacy

- Collect only necessary customer data.
- Do not expose customer identifiers in public assets.
- Mask identifiers in watermark when used.
- Define deletion and retention policy.
- Protect payment references and contact details.
