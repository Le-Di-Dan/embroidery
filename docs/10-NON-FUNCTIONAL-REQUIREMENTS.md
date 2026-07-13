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

## 5. Data integrity

- Monetary values use exact decimal representation.
- Historical quotation values are immutable.
- Approved design snapshot is immutable.
- State transitions are validated.
- Audit metadata is retained.
- Referential integrity is enforced.

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
