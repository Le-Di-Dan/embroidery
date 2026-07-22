# APP11 — Gallery, Content, SEO and Store Presentation

## 1. Outcome

Complete the public discovery and store presentation experience with managed gallery/content, SEO metadata, responsive pages and Admin content operations.

## 2. Dependencies

APP2 asset/catalog publication and core commerce journey stable.

## 3. Design policy

Substantial public design already exists and should be audited for `REUSE/SUPPLEMENT`. Admin content management likely requires a package. Complete all APP11 design gaps together; do not redesign approved public identity during implementation.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Homepage and public store introduction.
- Discovery/gallery list and work detail.
- SEO metadata, structured data, sitemap/robots/canonical behavior.
- Admin gallery/content authoring and publication.
- Public asset derivatives and revalidation.
- Search/filter only to approved scope.
- Performance/accessibility for public pages.

## 5. Out of scope

- New business features.
- Reopening Design Studio lifecycle.
- Large analytics platform.
- Unapproved CMS generalization.
- Customer design download.

## 6. Candidate engineering checkpoints

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP11-C01 — Gallery/content draft contract:** Define Admin list/detail/create/update/archive operations for the bounded content model.
- **APP11-B01 — Gallery/content backend:** Implement drafts, assets, validation, authorization and repository tests.
- **APP11-A01 — Admin content list:** Implement status/filter/pagination and navigation.
- **APP11-A02 — Admin content editor/detail:** Implement content/asset editing and validation.
- **APP11-C02 — Publication contract:** Define publish/unpublish/readiness operations.
- **APP11-B02 — Content publication backend:** Implement lifecycle, SEO readiness, audit and revalidation consequence.
- **APP11-A03 — Admin publication interaction:** Implement readiness/preview/publish/unpublish.
- **APP11-C03 — Public discovery contract:** Define public feed/list and detail operations with filters/pagination.
- **APP11-B03 — Public discovery queries:** Implement published-only read models and SEO fields.
- **APP11-S01 — Homepage/store introduction:** Implement approved high-fidelity page with server-rendered core content.
- **APP11-S02 — Discovery/gallery feed:** Implement approved responsive discovery experience.
- **APP11-S03 — Gallery/work detail:** Implement approved detail, related content, metadata and states.
- **APP11-S04 — SEO infrastructure:** Implement sitemap, robots, canonical, structured data and noindex rules.
- **APP11-W01 — Content asset/revalidation worker:** Implement any derivative/revalidation jobs required by publication.
- **APP11-E01 — Content publication E2E:** Admin authors/publishes content → public SSR page/feed visible with correct metadata → unpublish removes visibility and revalidates.
- **APP11-X01 — Phase closure:** Close R5 Operational Beta and hand the complete product to APP12.

## 7. Critical end-to-end journey

Admin publishes gallery/content with valid assets and SEO metadata; Storefront server-renders it in approved homepage/discovery/detail experiences; unpublish removes public visibility and cache content safely.

## 8. Exit gate

- Existing approved design continuity preserved.
- Public content is SSR/SEO-valid and accessible.
- Draft/private content remains hidden.
- Performance budget evidence recorded.
- E2E passes.

## 9. Handoff

APP12 receives a feature-complete candidate for security, resilience, performance, UAT and go-live readiness.
