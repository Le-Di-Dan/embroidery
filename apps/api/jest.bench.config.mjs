/**
 * DB9 benchmark runner (DEC-DB9-005).
 *
 * Separate from `jest.config.mjs` on purpose: benchmarks take minutes and
 * must never become the tail latency of the correctness gate. `pnpm test`
 * stays fast; `pnpm bench:db9` is the measurement entry point. Benchmarks
 * still compile the real Nest modules and call the real repositories — the
 * split is about *when* they run, not about measuring something synthetic.
 *
 * `--runInBand` is not optional here: two Jest workers would contend for the
 * same machine and every timing in the report would be noise.
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.bench.ts'],
  // Dataset generation applies 31 migrations and loads hundreds of thousands
  // of rows before the first measurement.
  testTimeout: 1_800_000,
  maxWorkers: 1,
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
  },
};
