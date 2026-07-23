/** @type {import('jest').Config} */
// This framework-agnostic support package imports no Next assets (no SCSS,
// next/image or next/font), so it does not need — and cannot use — next/jest,
// which requires an app/pages directory. Its own unit tests therefore use
// ts-jest + jsdom. The locked next/jest transform (IMP-D024) still governs the
// *apps'* component tests, where Next asset handling is required. See the
// APP0-T02A completion report (D-1).
export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          module: 'CommonJS',
          moduleResolution: 'Node',
          esModuleInterop: true,
          verbatimModuleSyntax: false,
        },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/index.ts', '!src/**/*.test.{ts,tsx}'],
  coverageReporters: ['text', 'lcov'],
};
