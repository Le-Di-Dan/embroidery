# APP2 — Assets and Catalog Publication

## 1. Outcome

Deliver the first full business vertical slice: Admin uploads/processes assets, creates and publishes catalog products, and Storefront server-renders only published products.

## 2. Dependencies

APP1 complete; object-storage and worker adapter choices must be available or selected in this phase through approved ADR/checkpoint.

## 3. Design policy

Audit current homepage/discovery/detail designs and Admin coverage. Public screens may be `REUSE` or `SUPPLEMENT`; Admin asset/catalog screens are likely `NEW/SUPPLEMENT`. Any required design is completed as one APP2 package before frontend coding.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Asset upload authorization, metadata, inspection, derivatives, failure/retry visibility.
- Admin product draft creation, editing, list/detail, archive where allowed.
- Product publication/unpublication and validation.
- Public catalog list and product detail.
- SEO metadata, canonical URL, public/private asset access.
- Publication visibility and cache/revalidation behavior.

## 5. Out of scope

- Design template authoring.
- Design Studio.
- Inventory reservation.
- Requests, quotation, payment, order.
- General-purpose DAM beyond product/catalog needs.

## 6. Candidate engineering checkpoints

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP2-C01 — Asset contract:** Define upload-intent/authorization, completion, detail/list, and retry operations; no more than five endpoints.
- **APP2-B01 — Asset intake:** Implement asset metadata and authorized upload flow with signature/MIME/size validation boundaries.
- **APP2-W01 — Asset inspection and derivatives:** Implement one idempotent worker job family with attempt records, bounded retry, terminal failure, and object-storage safety.
- **APP2-A01 — Admin asset library:** Implement asset list/upload/status/retry capability using the real contract.
- **APP2-C02 — Catalog draft contract:** Define product list, detail, create, update, and archive operations as one bounded draft-management slice.
- **APP2-B02 — Catalog draft backend:** Implement product draft commands/queries, ownership, validation, repository tests, and safe errors.
- **APP2-A02 — Admin product list:** Implement list, filters/pagination, loading/empty/error and permission-aware actions.
- **APP2-A03 — Admin product form/detail:** Implement create/edit/detail with asset selection and server conflict handling.
- **APP2-C03 — Publication contract:** Define publish, unpublish, and publication-preview/readiness operations.
- **APP2-B03 — Publication backend:** Implement lifecycle checks, visibility, audit, cache/revalidation consequence and tests.
- **APP2-A04 — Admin publication interaction:** Implement publish readiness, confirmation, errors, status and unpublish behavior.
- **APP2-C04 — Public catalog contract:** Define public list and detail endpoints/read models.
- **APP2-B04 — Public catalog queries:** Implement published-only queries, SEO fields, pagination/filter semantics, and asset access mapping.
- **APP2-S01 — Storefront product list:** Implement server-first public catalog/discovery screen using approved design.
- **APP2-S02 — Storefront product detail:** Implement server-rendered product detail, gallery, metadata and not-found behavior.
- **APP2-E01 — Publication E2E:** Upload asset → process → create draft → publish → public list/detail visible → unpublish → public visibility removed.
- **APP2-X01 — Phase closure:** Close R1 Catalog Alpha and hand off catalog/template compatibility to APP3.

## 7. Critical end-to-end journey

Admin staff uploads a valid product image, sees processing complete, creates a product draft, publishes it, verifies it on Storefront HTML and UI, unpublishes it, and verifies public access is removed. Invalid/private assets never become public.

## 8. Exit gate

- Asset and catalog APIs documented in OpenAPI/client.
- Worker failure and retry are observable.
- Draft content is never public.
- Storefront is SSR/SEO-valid.
- E2E passes with real persistence/object-storage test adapters.

## 9. Handoff

APP3 receives published products, validated assets, and publication/read-model patterns for templates and studio bootstrapping.
