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
