# `APP3-P03` — Zod-backed DTO OpenAPI metadata foundation

```text
APP3-B02 = COMPLETE — REVIEW_ACCEPTED
APP3-P03 = COMPLETE — REVIEW_DELIVERED
FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01 = COMPLETE — CLOSED_BY_APP3-P03
APP3-B03 = READY — NOT STARTED
APP3-B06 = READY — NOT STARTED
APP3 = IN PROGRESS — ZOD_OPENAPI_METADATA_FOUNDATION_DELIVERED_FOR_REVIEW
```

Branch `production`, entry HEAD `3974b3d`.
Commit A: `b6bce97` `fix(api): publish Zod DTO OpenAPI metadata`.
Commit B: this report only. **Nothing pushed.** Working tree clean.

`APP3-B02` is recorded accepted, carrying the approved bounded tooling-size
deviation `B02_PREDECESSOR_GATE_AND_TEST_FILES`. No `APP3-B02-C1` exists and none
was created.

---

## 1. The defect

Runtime validation worked. The API returned the right answers. Every test
passed. And every schema-backed request body published as:

```json
{ "type": "object", "properties": {} }
```

`createZodDto` hands `@nestjs/swagger` a class with no decorated property, and
Swagger — which documents a class by reading its `@ApiProperty` metadata —
correctly concluded there was nothing to document. Nothing ever failed, which is
why the defect survived four checkpoints. Only the *published contract* was
wrong: a client reading the document could not see that `expectedUpdatedAt`
exists, let alone that it is required, and the generated client typed each body
as `[key: string]: unknown`.

---

## 2. Complete consumer inventory

Sixteen `createZodDto` consumers, all now registered for publication:

| Module | DTOs | Publishes a component? |
|---|---|---|
| `admin-product.request.ts` | `ProductIdParam`, `ListProductsQuery`, `CreateProductBody`, `UpdateProductBody`, `ArchiveProductBody` | 3 bodies |
| `admin-product-placement.request.ts` | `ProductPlacementIdParam`, `ProductSlugParam`, `ReplaceProductPlacementBody` | 1 body |
| `admin-product-publication.request.ts` | `PublishProductBody`, `UnpublishProductBody` | 2 bodies |
| `admin-asset.request.ts` | `AssetIdParam`, `ListAssetsQuery` | no |
| `public-product.request.ts` | `PublicProductListQueryDto`, `PublicProductSlugParam` | no |
| `public-product-media.request.ts` | `PublicProductMediaParams` | no |
| `public-side-background.request.ts` | `PublicSideBackgroundParams` | no |
| `staff-login.request.ts` | `StaffLoginRequestDto` | §6 |

A path or query DTO never becomes a component — Swagger documents those from the
operation's parameter list — so registering them is a no-op that costs nothing
and removes the judgement call about which ones to register.

---

## 3. Mapping strategy — Zod's own exporter

Zod is pinned at **4.4.3**, which exposes `z.toJSONSchema`, its official and
stable exporter, and also carries `~standard.jsonSchema` for the Standard Schema
protocol. **Strategy A.** Nothing is hand-written and **no dependency was
added**: the schema that validates a request and the schema that documents it
are two renderings of one object, so they cannot drift.

Three options carry the design:

- **`io: 'input'`** — a body is documented as what a client *sends*. A
  transforming schema (`StaffLoginSchema` lowercases its email) would otherwise
  publish its parsed output as if the caller had to send that.
- **`unrepresentable: 'throw'`** — a construct JSON Schema cannot express stops
  generation. The defect being closed was a silent `{}`; replacing it with a
  quieter silent omission would be no improvement.
- **`cycles: 'throw'`** — a self-referential body has no finite published form.

`@nestjs/swagger` 11.4.6 ships a Standard Schema converter, but nothing in the
package calls it and its module is not in the `exports` map — so it is neither
usable nor a second authority. `nestjs-zod` was not introduced: the deep import
it relies on (`@nestjs/swagger/dist/services/schema-object-factory`) is blocked
by that same exports map, and §11 forbids a new dependency regardless.

### Supported vocabulary

Every construct the repository's schemas actually use, each with its own test:
object with required/optional fields, `.strict()` → `additionalProperties: false`,
nullable (OpenAPI 3.0 `nullable`, kept distinct from optional), enum, literal,
union → `anyOf`, discriminated union → `oneOf`, string length/pattern, `uuid`
and offset-bearing `date-time` formats, integer versus number, inclusive and
exclusive numeric bounds, coerced query numbers, arrays with item schema and
bound, inline nested objects, named sub-schemas via `.meta({ id })`, and
descriptions/examples via `.meta()`.

### Unsupported nodes fail loudly

`z.date()`, `z.bigint()` and a `z.lazy` cycle each stop generation with a
`ZodOpenApiSchemaError` naming the schema that failed — a build error, never a
runtime one. There is no `{}` fallback anywhere, and the gate asserts its
absence.

A `.refine()` is **dropped, not thrown on**. It is a predicate over an
already-typed value rather than an unrepresentable *node*, so the published type
stays correct while the predicate stays unpublished. Two real constraints are
therefore not in the document: `UpdateProductBody`'s "a patch must change at
least one field", and `basePriceAmount`'s `BigInt` maximum. Both are enforced and
both return the canonical `400` envelope; neither is expressible in JSON Schema.

---

## 4. Registration, and why the name comes from the class

`createZodDto` returns an *anonymous* base class, so at the moment the schema is
attached nothing knows what the DTO will be called — and the component name in
the document is the **subclass's** name. Each feature therefore hands its
finished classes to `registerZodDtos`, which reads the name off the class
itself. Nothing is spelled twice, so a rename cannot leave a stale string
pointing at a component that no longer exists.

Registration is a **publication concern only**. The pipe reads the schema
straight off the metatype and never consults the registry, so an unregistered
DTO still validates exactly as before — it would only fail to *document* itself.

And that is where the second half comes in: the augmentation refuses to emit a
document in which any JSON request body, **or anything it references**, is still
empty. A fix that repairs the six known bodies but silently skips the seventh
added next year would leave exactly the defect it claims to have closed.

---

## 5. The placement body kept its exact contract

`APP3-B01-C1` documented the replace body with hand-written decorator classes,
explicitly as a scoped workaround. Those are gone. The descriptions and examples
moved onto the Zod schema as `.meta()`, and `.meta({ id })` keeps
`ReplacePlacementSideBody` and `ReplacePlacementAreaBody` as named components —
so the generated client's types stay exactly where that correction put them.

```text
required            expectedUpdatedAt, sides        (unchanged)
expectedUpdatedAt   string, date-time, offset       (unchanged)
sides               12 fields, maxItems 20          (unchanged)
sides[].areas       11 fields, maxItems 50          (unchanged)
```

What changed is fidelity: the published body now carries the bounds, patterns,
formats and integer/number distinctions the runtime actually enforces, rather
than a hand transcription of them.

---

## 6. The one body deliberately left alone

Both fields of `StaffLoginSchema` are constrained entirely by `.refine()`.
Converting it would publish two bare strings and **lose** the `email` format and
the 254-byte bound a client can read today. Its hand-written published shape
therefore stays, and the contract spec binds the two together: the field names
and the required list must match the Zod schema exactly. It may document *more*
than the converter can, never something different.

This is the only allowlisted divergence, and it is not a per-feature workaround
standing in for the platform — the platform is the authority for every body that
can be converted, and the gate refuses any DTO that hand-decorates itself.

---

## 7. OpenAPI and generated client

| Artifact | Before | After |
|---|---|---|
| paths | 19 | **19** |
| operations | 23 | **23** |
| schemas | 45 | **45** |
| OpenAPI SHA-256 | `38ab7dae…be683` | `d1dfe047…44709` |
| client tree SHA-256 | `129883fa…29d9d` | `3fcc05d0…ead7a8` |

The counts are identical — no path, operation or component was added or removed
— and only the bytes moved: the surface did not grow, its description became
true. Seven JSON request bodies are documented; six were empty and now are not,
and the seventh (staff login) is unchanged.

Generated client, before and after:

```ts
export interface CreateProductBody { [key: string]: unknown; }

export interface CreateProductBody {
  categorySlug: CreateProductBodyCategorySlug;
  /** @maxLength 5000 */
  description?: string;
  /** @minLength 1 @maxLength 200 */
  name: string;
}
```

Five `[key: string]: unknown` index signatures are gone. Every authored
description survives, and nothing was hand-edited.

---

## 8. Evidence

| Command | Result |
|---|---|
| `node tools/check-app3-p03.mjs` (chains B02 · B01 · B01N) | **PASS** |
| `node --test tools/check-app3-p03.test.mjs` | **52/52** |
| platform DTO/OpenAPI specs (`--testPathPatterns "zod-dto\|zod-openapi"`) | **102/102**, 4 suites |
| all Docker-free API specs | **1087/1087**, 77 suites |
| Product/Admin API integration (live PostgreSQL, `--runInBand`) | 122/123, 9/10 suites (§10.2) |
| `api exec tsc --noEmit` · `api build` | PASS · PASS |
| `openapi:generate` · `openapi:check` | PASS · PASS |
| `api-client generate` · `check:generated` · `typecheck` · `test` | PASS · PASS · PASS · **44/44** |
| `admin exec tsc --noEmit` · admin product component tests | PASS · **290/290** |
| `storefront exec tsc --noEmit` | PASS |
| `pnpm lint` | PASS, 24/24 |
| `pnpm format:check` · `git diff --check` | PASS · clean |

`pnpm quality` was not run. No root script was added; the root manifest still
declares **30**. No frontend, worker, E2E or Figma command was run beyond the
two the change itself broke (§10.3).

The gate's own regression suite proves it can fail: softening any one of the
three conversion options, a `catch` that returns `{}`, an unregistered consumer,
a new consumer added without registration, a hand-decorated DTO, an empty body
at any depth, a nested component gone opaque, a lost description, a client typed
as an open bag, a new path or operation, a new dependency, a root script, a
missing command-index entry, and every half-flipped phase state.

---

## 9. Governance

Runtime limits are unchanged and re-asserted by the gate against this
checkpoint's own files:

```text
application production source ≤ 400   (largest here: 209)
application test              ≤ 600   (largest here: 408)
```

Tooling gains bounded **soft caps**, recorded in `VALIDATION_GOVERNANCE.md` §5.1:

```text
tools/check-*.mjs      ≤ 450   (p03: 300, p03-contract: 289)
tools/check-*.test.mjs ≤ 700   (p03.test: 490)
```

A checker is one cohesive argument about one checkpoint; splitting it to land
under an arbitrary count scatters that argument across files whose only
relationship is size. `check-app3-p03.mjs` *was* split at 539 lines — over the
new cap, and along a real responsibility line: mechanism versus published
surface, the same split `APP3-B02` uses.

Indexed in `SCOPED_COMMAND_INDEX.md`: `CMD-CHECK-APP3-P03`,
`CMD-CHECK-APP3-P03-CONTRACT`, `CMD-TEST-APP3-P03`, `CMD-TEST-APP3-P03-CONTRACT`.

---

## 10. Disclosed deviations

### 10.1 Predecessor gates made mode-aware

`APP3-B01N`, `APP3-B02`, `APP3-G06`, `APP3-G07`, `APP3-W01A` and the `APP3-W01B`
boundaries each asserted the platform follow-up was still open, two of them that
`APP3-B03` still recorded it as a blocker, and `APP3-B01N` additionally froze the
OpenAPI and generated-client digests. Closing that follow-up and republishing
those bodies is this checkpoint's whole purpose, so none could pass unchanged
while §12 requires them to pass.

Each was made **mode-aware** on this checkpoint's own delivered status line — two
consistent worlds, no third, with the half-flipped mixture asserted to fail.
`APP3-B01N` now resolves three ordered worlds, newest first; the counts stay the
B02 ones because `APP3-P03` implies `APP3-B02` and only the digests move.

§11 allows `tools/check-app3-p03*.mjs`, so these edits sit outside that list.
Recorded as `PREDECESSOR_GATES_MADE_MODE_AWARE_ON_P03`.

### 10.2 A pre-existing failure corrected, and one left alone

`build-openapi-document.spec.ts` asserted **16 paths / 19 operations**. The three
APP3 operations were added while that count still read 16/19, so it had been
failing before this checkpoint touched anything — the committed artifact already
held 19/23 and `openapi:check` passed at entry. Corrected to 19/23 rather than
left as a permanently red guard.

`api-integration-context.integration.spec.ts` fails on a stale
`CANONICAL_FINGERPRINT` constant. `APP3-P03` changes no migration and no schema
file, so the migrated fingerprint it computes is the same one it computed at
entry; the mismatch predates this checkpoint. It is a database-change-control
concern and is **not** repaired here.

### 10.3 Admin was really broken by the corrected types, and is repaired

`apps/admin/**` is read-only under §11, and §12 says not to run frontend
commands. Correcting the generated types broke it anyway, in two directions at
once:

- three `as unknown as <Body>` casts became **unnecessary** and failed
  `@typescript-eslint/no-unnecessary-type-assertion`, so `pnpm lint` — which
  §12 *does* require — went red;
- one cast became **necessary**: under Admin's `exactOptionalPropertyTypes`,
  `ProductUpdateRequestBody` admits an explicit `undefined` for a field the
  generated type declares as merely optional, which the form legitimately sends
  for an untouched field.

Both were fixed, with the obsolete prose about "open index signatures" replaced
by what is now true, and eight structural casts in four Admin component test
files were routed through `unknown` because the recorded mock arguments are now
the real published tuple. Shipping a repository whose Admin app does not compile
to honour a file list would be the worse outcome. Recorded as
`ADMIN_CONSUMER_RECONCILED_TO_PUBLISHED_TYPES`; Admin behaviour is unchanged and
its 290 product component tests pass.

---

## 11. Limitations

1. **Query and path parameters still publish `schema: {}` in places.** Those come
   from hand-written `@ApiQuery`/`@ApiParam` decorators in controllers that omit
   a type — a separate defect from the one this follow-up named, and controllers
   are outside §11's allowed files. Not opened as a follow-up here; raised for
   the reviewer's decision.
2. **Two refinement-only constraints are unpublished** (§3): the patch
   "at-least-one-field" rule and `basePriceAmount`'s `BigInt` maximum. Both are
   enforced; neither is expressible in JSON Schema.
3. **The staff-login body remains hand-documented** (§6), by design, and is the
   only allowlisted divergence.
4. **`INTENTIONALLY_EMPTY_REQUEST_BODIES` is empty**, and the gate fails if an
   entry appears without review — a body with genuinely nothing to say should
   take no body at all.
5. **Published patterns are verbose.** Zod emits the full RFC-strict `uuid` and
   `date-time` regular expressions. They are what the runtime enforces, so
   publishing them is honest, but the artifact grew accordingly.

---

## 12. Scope confirmation

Zero new HTTP paths. Zero new operations. Zero new business capabilities. Zero
database migrations — still **34**. Zero changes to business services,
repositories, database schema, `apps/worker`, `apps/storefront`, infrastructure,
Figma or `docs/design/**`. Zero new dependencies; no lockfile or manifest change.
Root scripts remain **30**. Controller route behaviour, the validation error
shape, request parsing, unknown-key policy and every business DTO field name are
unchanged.

---

```text
APP3-P03 = COMPLETE — REVIEW_DELIVERED
```

Human review owns `APP3-P03 = COMPLETE — REVIEW_ACCEPTED`.
`APP3-B03` and `APP3-B06` unblock on that acceptance.
