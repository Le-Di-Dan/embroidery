# @embroidery/typescript-config

Shared strict TypeScript configurations for every workspace.

## Purpose

Single source of truth for compiler strictness across the monorepo
(D-031, CLAUDE.md §4). All required strict flags are enabled in `base.json`:
`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`,
`forceConsistentCasingInFileNames`, `useUnknownInCatchVariables`.

## Variants

- `base.json` — strict foundation, no emit.
- `nextjs.json` — Next.js App Router applications (DOM libs, `jsx: preserve`).
- `nestjs.json` — NestJS applications (CommonJS, decorator metadata, emits to `dist`).
- `library.json` — workspace packages consumed as TypeScript source
  (just-in-time packages, no build step).

## Boundary

Configuration only. No runtime code belongs here.
