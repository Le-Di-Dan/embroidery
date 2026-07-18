/**
 * Physical schema entrypoint — the single source of truth drizzle-kit reads
 * when generating migrations (ADR-DB1-005: one `public` schema).
 *
 * Tables are grouped by bounded context, in the dependency order DB4 defined
 * for fresh installs (`DB4_DB6_HANDOFF.md` §1, groups G1–G19). Adding a table
 * without exporting it here makes it invisible to migration generation, so the
 * fresh-install gate cross-checks this list against `DB6_SCHEMA_IMPLEMENTATION_MANIFEST.md`.
 */

// G1 — Identity (CTX-IDN)
export * from './identity/admin-accounts';
export * from './identity/admin-credentials';
export * from './identity/admin-sessions';

// G2 — Platform base (CTX-PLT)
export * from './platform/policy-configurations';
export * from './platform/policy-configuration-versions';
export * from './platform/idempotency-records';
export * from './platform/outbox-events';
export * from './platform/background-job-attempts';

// G3 — Customer (CTX-CUS)
export * from './customer/customers';
export * from './customer/business-profiles';
export * from './customer/customer-contact-points';

// G4 — Asset (CTX-AST)
export * from './asset/assets';
export * from './asset/asset-inspections';
export * from './asset/asset-derivatives';

// G5 — Catalog (CTX-CAT)
export * from './catalog/categories';
export * from './catalog/products';
export * from './catalog/product-variants';
export * from './catalog/skus';
export * from './catalog/product-sides';
export * from './catalog/embroidery-areas';
export * from './catalog/product-media';
