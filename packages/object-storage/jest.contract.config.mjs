/**
 * Disposable-MinIO contract suite (APP2-I01 §14). Requires a reachable Docker
 * daemon; it starts a pinned MinIO container on a random loopback port, runs
 * every case against it, and removes the container, network and objects.
 *
 * Never part of `pnpm test` / `pnpm quality`: those must stay Docker-free.
 * Run it explicitly with `pnpm test:object-storage:contract`.
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/test/contract'],
  // Pulling and starting the pinned image plus 20 cases far exceeds the 5s
  // default; the timeout must cover container setup, not just an assertion.
  testTimeout: 240_000,
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: { module: 'CommonJS', moduleResolution: 'Node' } }],
  },
};
