# APP3-B08-C1 — Completion report

**Correction:** `APP3-B08-C1` — publish the canonical Design Document in the contract
**Corrects:** `APP3-B08` (`docs/implementation/reports/APP3-B08-COMPLETION-REPORT.md`)
**Branch:** `production`
**Status:** `COMPLETE — REVIEW_DELIVERED`
**Implementation commit (C1-A):** `842eddc5ad729bca02623e14fc432dd60bbce8be`
**Evidence commit (C1-B):** this commit

---

## 1. What was wrong

`APP3-B08` published the autosave body's `document` field as an open object:

```json
{ "type": "object", "additionalProperties": {} }
```

The reasoning behind it was sound and is unchanged — mirroring
`@embroidery/design-document` in Zod at the HTTP edge would create a second
definition of the Design Document that drifts from `APP3-P01`, and P01 is the
acceptance authority. But the conclusion drawn from it was wrong. An open object
is not a contract:

- the generated client typed the snapshot as `{ [key: string]: unknown }`, so
  every caller — `APP3-S11` above all — got no shape, no completion and no
  compile-time safety on the one payload that matters;
- and it forced a **weakening of `APP3-P03`**. P03 refuses any request body that
  publishes as an empty object, which is the `createZodDto` defect `APP3-B01-C1`
  found. B08 relaxed that rule to tolerate `additionalProperties`. The rule was
  correct; the body was the problem.

## 2. What was done

The structural JSON Schema is **generated from P01's own TypeScript types** and
registered as OpenAPI components. There are now three sources and each states
exactly one thing:

| Concern | Owner |
| --- | --- |
| What a Design Document *is*, structurally | P01's TypeScript types → generated schema |
| What a Design Document must *satisfy* to be accepted | P01's imperative validators |
| How that structure is *published* | the API augmentation, mechanically |

Nothing hand-writes a field name, a variant or a property. The augmentation is
purely representational and works by walking the tree, so it never learns what a
Design Document contains:

- `#/definitions/X` → `#/components/schemas/X`, because OpenAPI keeps component
  schemas elsewhere;
- `const: v` → `enum: [v]`, because the document is OpenAPI **3.0.0** and `const`
  is a draft-07 keyword 3.0 does not define. Dropping it instead would have
  erased the discriminator that makes the five-member element union readable.

If P01 gains an element kind tomorrow it appears in the contract with **no edit
to any of this**.

**What is deliberately not translated** is P01's runtime semantics — NFC
normalization, non-empty strings, non-zero scale factors, the `fontSizePx` range,
integer `fontWeight`, the 2–5000 freehand point bound. TypeScript does not
express them, so the generator cannot derive them, and writing them in by hand is
precisely the duplication this design exists to avoid. **The published schema is
the structural contract; P01 remains the acceptance authority.** A consumer that
treated the published schema as a complete acceptance test would accept documents
the API rejects, and the generated package says so in its own header.

### The opt-in marker

A body opts in by setting a vendor extension on the field
(`x-embroidery-published-schema`), which the augmentation resolves to a `$ref`.
So the augmentation never learns which endpoints carry a Design Document, and a
future body needs no change to it. The marker is internal and is asserted absent
from the published artifact.

The field resolves to `allOf: [$ref]` rather than a bare `$ref` so its
description survives — OpenAPI 3.0 ignores siblings of `$ref`, and the
single-member `allOf` is the idiom the envelope augmentation already uses.

### P03 restored

`tools/check-app3-p03-contract.mjs` is byte-identical to its pre-B08 form again.
The correction removed the reason it was weakened, so the weakening is gone.

## 3. Runtime behaviour is unchanged

This is a **publication-only** correction. No controller, use case, repository,
validator, DTO validation rule, transaction or migration changed. Concretely:

- the Zod schema for `document` is still permissive, because P01 is still the
  judge;
- `AutosaveDesignSessionUseCase`, `SessionPlacementResolver`,
  `SessionDocumentMediaAuthority` and `DesignDocumentAuthority` are untouched;
- the CAS, the 409 mapping, the media allowlist and the P01/P02 pipeline are
  untouched.

The B08 suites are therefore **reused, not re-run**: unit 33/33 and live 23/23
(including the ten-iteration race) proved the runtime path, and nothing on that
path moved.

## 4. Surface

| Fact | Before (B08) | After (B08-C1) |
| --- | --- | --- |
| paths | 23 | **23** |
| operations | 27 | **27** |
| schemas | 50 | **63** (+13 generated) |
| OpenAPI SHA-256 | `4fa09b27…ab06` | `698ef2e5eed11fcd3d04a6eb059bb9a4e3a10122563f3017a0d4f3f64b7626b5` |
| client tree SHA-256 | `4bf8dd9d…86f5` | `af1fe9e510f91b8e0a7426a26e9865aa548303fcde36cbb4a90fc99faaa433c7` |

No path and no operation was added. The thirteen components are
`DesignDocument`, `DesignPlacementSnapshot`, `DesignElement`, `TextElement`,
`DesignElementTransform`, `FontStyle`, `TextAlign`, `ImageElement`,
`ShapeElement`, `ShapeKind`, `FreehandElement`, `FreehandPoint`, `GroupElement`.

The published body and the generated client:

```jsonc
"document": { "allOf": [{ "$ref": "#/components/schemas/DesignDocument" }], "description": "…" }
```

```ts
export interface DesignDocument {
  elements: DesignElement[];
  placement: DesignPlacementSnapshot;
  schemaVersion: number;
}
export interface AutosaveDesignSessionBody { document: DesignDocument; expectedRevision: number; }
```

## 5. The authorized dependency

`ts-json-schema-generator@^2.9.0`, **dev-only**, in `@embroidery/design-document`
alone, under the operator authorization
`ALLOW_ONE_DEV_ONLY_TYPESCRIPT_TO_JSON_SCHEMA_GENERATOR`.

It runs at author time and produces a committed artifact; it is never imported by
runtime code, never reaches `dist` as a dependency, and never ships. The
generator is spawned as a child process by its own test suite rather than
imported, so a tooling package never comes one import away from the browser-safe
runtime root — the `architecture.spec.ts` boundary proof still passes.

The artifact lives under `src/schema/generated/` specifically because the API
consumes the built package (IMP-D018); an artifact outside `src/` would never
reach `dist` and the augmentation could not import it.

## 6. Defects found and fixed during the correction

Three, all found by running things rather than reading them:

1. **The marker had no consumer.** `PUBLISHED_SCHEMA_MARKER` was defined in the
   augmentation and set on the DTO field, but nothing resolved it. The components
   would have been registered and the field would still have published as an open
   object — carrying a stray vendor extension into the client. Resolution is now
   written, and both trees (`paths` and `components.schemas`) are walked, because
   a rule that only looked where today's single caller happens to be is a rule
   that breaks silently.
2. **The generated-schema suite had never run.** The in-flight state file recorded
   "P01 tests 15/15", but the spec resolved the artifact at
   `<pkg>/schema/…` while the generator writes `<pkg>/src/schema/generated/…`, so
   Jest reported *1 suite failed, 0 tests failed* — a load error, not an
   assertion. The recorded 15/15 was never true. Path corrected to the
   generator's own; the package now runs **177/177 across 10 suites** (was 162
   with the suite dead).
3. **Prettier reformatted a generated artifact.** A `--write` sweep over
   `packages/design-document/**/*.json` rewrote the generated schema and broke
   `schema:check`, which compares bytes. Regenerated, and
   `.prettierignore` now excludes all three digest-compared artifacts (the
   Design Document schema, the OpenAPI document and the generated client) so it
   cannot recur. The OpenAPI hash was verified unchanged across the incident, so
   the reformatting never reached the published contract.

Also fixed while wiring: the package needed its IMP-D018 `dist` build before the
API could import the new runtime value, and its ESLint config needed the Node
globals block `@embroidery/api-client` already uses for its generation scripts —
the same shape, not a new one.

## 7. Gate

`tools/check-app3-b08.mjs` gains four rules and its success message no longer
claims "no dependency change", which C1 makes false:

- the snapshot **references `DesignDocument`**; a regression to `type: 'object'`
  fails rather than passing as "an object was published";
- the referenced component is actually registered;
- the internal marker never reaches the artifact;
- no draft-07 `const` survives into the 3.0 document.

The client check additionally requires `export interface DesignDocument` and
`document: DesignDocument`, so a client that types the snapshot as a map again
fails.

Two new indexed commands: `CMD-GENERATE-DESIGN-DOCUMENT-SCHEMA` and
`CMD-CHECK-DESIGN-DOCUMENT-SCHEMA`.

## 8. Evidence

| Command | Result |
| --- | --- |
| `node tools/check-app3-b08.mjs` | **exit 0**, full predecessor chain |
| `node --test tools/check-app3-b08.test.mjs` | **62/62** (57 → 62; five new mutation cases) |
| `pnpm --filter @embroidery/design-document test` | **177/177**, 10 suites |
| `pnpm --filter @embroidery/design-document schema:check` | up to date |
| `pnpm --filter @embroidery/api openapi:check` | artifact up to date |
| `pnpm --filter @embroidery/api-client check:generated` | up to date, tree `af1fe9e5…` |
| `node tools/check-app3-p01.mjs` | exit 0 |
| `pnpm --filter @embroidery/api typecheck` / `lint` | exit 0 / exit 0 |
| `pnpm --filter @embroidery/design-document typecheck` / `lint` | exit 0 / exit 0 |
| `pnpm format:check` | clean |
| `git diff --check` | clean |

Reused without re-running, because the runtime path did not change: B08 unit
**33/33**, B08 live integration **23/23** including the ten-iteration
single-winner race.

## 9. Changed files (24)

**New (5)** — the augmentation, the generator script, the generated artifact and
its typed export, and the generator's test suite.

**Modified (19)** — the autosave request DTO (marker only), the OpenAPI document
builder, the design-document package manifest / index / ESLint config,
`.prettierignore`, both generated artifacts, the surface authority, the B01N
frozen digests, the B08 gate and its two halves and tests, the restored P03
contract gate, and five documentation files.

The status token moved to `COMPLETE — REVIEW_DELIVERED_AFTER_C1`, following the
`APP3-B06B-C1` precedent so a reviewer sees the correction in the status itself.
As there, the literal is asserted once in the surface authority
(`B08_DELIVERED_STATUS`) rather than copied into each gate — the two gates that
merely need to know B08 *shipped* keep their prefix test and needed no edit.

## 10. Limitations

1. **The autosave response still publishes no schema**, so the generated client
   types it `void`. This pre-dates C1 and is inherited from `APP3-B07` — its two
   Session operations publish none either. Fixing it for autosave alone would
   type one operation and leave the identical snapshot untyped on the other two,
   so it is left whole for a follow-up covering all three. This is the most
   valuable next step for `APP3-S11`.
2. **The published schema is structural only.** Every semantic rule TypeScript
   cannot express is enforced by P01 at runtime and is invisible in the contract.
   A client that validates against the published schema alone will believe
   documents are acceptable that the API will reject with 422. Stated in the
   augmentation header, the generated package header and here.
3. **`ShapeKind`, `FontStyle` and `TextAlign` publish as enums** derived from the
   TypeScript unions; if P01 ever widens one to a branded string the published
   enum silently narrows the contract. `schema:check` catches the drift, but only
   if it is run — it is indexed, not automatic.

## 11. Status

```text
APP3-B08-C1 = COMPLETE — REVIEW_DELIVERED
APP3-B08 = COMPLETE — REVIEW_DELIVERED_AFTER_C1
```

Human review decides acceptance.
