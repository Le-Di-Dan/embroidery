/**
 * The ESM-only packages in jsdom 29.1.1's dependency closure.
 *
 * Named explicitly rather than opening `node_modules` wholesale, so a future
 * dependency cannot start being transpiled without this list saying so. Matched
 * on the *installed directory* rather than the pnpm store key, because pnpm
 * places a peer dependency under its dependant's own `node_modules` where the
 * store key never appears.
 */
const ESM_ONLY_PACKAGES = [
  '@asamuzakjp/css-color',
  '@asamuzakjp/dom-selector',
  '@asamuzakjp/generational-cache',
  '@bramus/specificity',
  '@csstools/color-helpers',
  '@csstools/css-calc',
  '@csstools/css-color-parser',
  '@csstools/css-parser-algorithms',
  '@csstools/css-tokenizer',
  '@exodus/bytes',
  'css-tree',
  'entities',
  'lru-cache',
  'parse5',
  'tough-cookie',
];

const SEPARATOR = '[\\\\/]';

const ESM_ONLY_DIRECTORIES = ESM_ONLY_PACKAGES.map(
  (name) => `${SEPARATOR}${name.split('/').join(SEPARATOR)}${SEPARATOR}`,
);

/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  // Integration suites create a database and apply 31 migrations before the
  // first assertion; the 5s default would fail on setup, not on behaviour.
  testTimeout: 300_000,
  // Suites that need something built before they can run: `worker-smoke` needs
  // `dist/`, while `worker-signal-smoke` and the FD1 `.process.spec` build
  // Docker images. `turbo run test` builds dependencies but not the package
  // under test, so leaving any of them here would make them pass or fail
  // depending on what happened to be on disk. Each runs from its own script,
  // which sets up what it needs first.
  // The APP2-I03 storage-bootstrap suites join the list for the same reason:
  // they start a MinIO container and a built process, so they run from their
  // own scripts (`test:storage-bootstrap:worker`, `:composition`), never from
  // the Docker-free `pnpm test`.
  // The APP2-W01 asset-processing integration suites join for the same reason:
  // each one starts a MinIO container and a disposable PostgreSQL, so they run
  // from `test:asset-processing:integration`, never from the Docker-free
  // `pnpm test`. Their Docker-free unit siblings sit next to the code and do
  // run here.
  testPathIgnorePatterns: [
    '\\\\node_modules\\\\',
    '/node_modules/',
    'worker-smoke',
    'worker-signal-smoke',
    'storage-bootstrap-worker',
    'storage-bootstrap-composition',
    'asset-inspection-.*\\.integration',
    // The APP3-W01A normalization suites join for the same reason: each starts a
    // MinIO container and a disposable PostgreSQL, so they run from the indexed
    // `CMD-TEST-APP3-W01A-INTEGRATION`, never from the Docker-free `pnpm test`.
    // Their Docker-free unit siblings sit next to the code and do run here.
    'asset-normalization.*\\.integration',
    // `APP3-W01B` joins for the same reason: the Template SVG live-stack suite
    // starts MinIO and a disposable PostgreSQL, so it runs from the indexed
    // `CMD-TEST-APP3-W01B-INTEGRATION`. Its sanitizer unit siblings are
    // Docker-free and do run here, against the real jsdom and DOMPurify.
    'template-svg-normalization\\.integration',
    'asset-processing-worker\\.smoke',
    '\\.process\\.spec\\.ts$',
  ],
  // jsdom 29 reaches several ESM-only packages, and Jest runs this suite as
  // CommonJS. Transpiling those few packages is what lets the APP3-W01B
  // sanitizer be exercised against the *real* jsdom and the real DOMPurify —
  // the alternative would be a mock of the parser whose behaviour is the whole
  // thing under test. Production is unaffected: the worker runs on Node, which
  // loads them natively.
  // Anchored at the start of the whole path rather than at a `/node_modules/`
  // segment: a pnpm store path contains that segment twice, so a lookahead
  // placed after it is satisfied by the inner one and the exception never
  // applies.
  transformIgnorePatterns: [
    `^(?!.*(?:${ESM_ONLY_DIRECTORIES.join('|')})).*${SEPARATOR}node_modules${SEPARATOR}`,
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
    '^.+\\.[cm]?js$': ['ts-jest', { tsconfig: { allowJs: true, module: 'commonjs' } }],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  coverageReporters: ['text', 'lcov'],
};
