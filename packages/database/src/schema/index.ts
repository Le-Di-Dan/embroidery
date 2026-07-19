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

// G6 — Inventory core (CTX-INV)
export * from './inventory/sku-stocks';
export * from './inventory/inventory-ledger-entries';

// G7 — Design pre-request (CTX-DSN)
export * from './design/design-templates';
export * from './design/design-template-versions';
export * from './design/design-template-assets';
export * from './design/design-sessions';
export * from './design/design-session-assets';

// G8 — Contact verification (CTX-CUS)
export * from './customer/contact-verification-challenges';
export * from './customer/contact-verification-attempts';

// G9 — Request intake & design case (CTX-ORD / CTX-DSN)
export * from './ordering/custom-requests';
export * from './ordering/customer-owned-products';
export * from './ordering/custom-request-quantity-breakdowns';
export * from './ordering/custom-request-assets';
export * from './ordering/request-moderation-notes';
export * from './ordering/custom-request-transitions';
export * from './design/design-cases';

// G10 — Secure grants, inventory soft holds, customer merge (CTX-CUS / CTX-INV)
export * from './customer/secure-access-grants';
export * from './inventory/inventory-soft-holds';
export * from './customer/customer-merge-cases';
export * from './customer/customer-merge-events';

// G11 — Design formal (CTX-DSN)
export * from './design/design-versions';
export * from './design/design-version-assets';
export * from './design/design-reviews';

// G12 — Content, gallery, agreement (CTX-CNT / CTX-GAL)
export * from './gallery/gallery-entries';
export * from './gallery/gallery-entry-assets';
export * from './content/content-pages';
export * from './content/redirect-rules';
export * from './content/agreements';
export * from './content/agreement-versions';

// G13 — Approval (CTX-DSN)
export * from './design/approval-snapshots';
export * from './design/approval-snapshot-thread-colors';
export * from './design/approval-snapshot-agreement-acceptances';

// G14 — Quotation (CTX-QUO)
export * from './quotation/quotations';
export * from './quotation/quotation-versions';
export * from './quotation/quotation-line-items';
export * from './quotation/quotation-acceptances';

// G15 — Order, official inventory reservation & shipping (CTX-ORD)
export * from './ordering/orders';
export * from './ordering/order-items';
export * from './ordering/order-transitions';
export * from './ordering/order-cancellation-requests';
export * from './ordering/shipping-details';
export * from './ordering/shipping-snapshots';
export * from './ordering/shipping-fee-acknowledgements';
export * from './inventory/inventory-reservations';
