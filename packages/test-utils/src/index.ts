/**
 * `@embroidery/test-utils` — package-neutral integration-test helpers.
 *
 * Deliberately tool- and framework-agnostic: no database lifecycle (that is
 * owned by `@embroidery/database/testing`), no Nest bootstrap, no business
 * rules, no credentials. It holds only shared teardown orchestration.
 */
export { CleanupStack } from './cleanup-stack';
export type { CleanupStep } from './cleanup-stack';
