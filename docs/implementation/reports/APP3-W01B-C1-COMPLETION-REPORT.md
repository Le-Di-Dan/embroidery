# `APP3-W01B-C1` — lossless SVG numeric canonicalization

```text
APP3-W01B-C1 = COMPLETE — REVIEW_DELIVERED
APP3-W01B    = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW
```

Commit A: `bdc24c9` `fix(worker): preserve SVG numeric values`
Commit B: this report only.
Branch `production`, local. **Nothing pushed.** Working tree clean.

---

## 1. The defect

`APP3-W01B` canonicalized numbers to a **fixed six-decimal budget**
(`value.toFixed(6)`), then stripped the zeros that budget added. A budget
rounds, and rounding a valid finite coordinate is a silent visual modification
of an approved Template — exactly what `IMP-D047` PO-05 refuses.

Concretely, on the delivered code:

| Source value | Printed as | Consequence |
|---|---|---|
| `1e-7` | `0` | a coordinate deleted |
| `translate(1e-7 -1e-9)` | `translate(0 0)` | the transform becomes the identity |
| `0.30000000000000004` | `0.3` | a distinct binary64 value collapsed |
| `0.1234567890123` | `0.123457` | low-order digits dropped |
| `5e-324`, `1.797…e308` | rejected outright | legitimate geometry refused by a magnitude cap |

**Why nothing caught it.** Every test passed and the pipeline reached its fixed
point, because rounding a rounded value rounds to the same place. That is the
lesson worth recording: *a fixed point reached after rounding proves the
rounding is stable, never that the geometry survived.* The fixed point was
checking the serializer against itself.

The magnitude ceiling (`1e9`) existed **only** to keep the canonical form out of
exponent notation. `IMP-D047` permits lowercase exponent notation where canonical
serialization needs it, so the ceiling bought nothing and could reject valid
input.

---

## 2. Corrected semantics

The semantic domain is one finite IEEE-754 **binary64** value. Per token:

```text
validate the complete lexical token
parse it
reject non-finite
normalize -0 to +0
serialize the shortest decimal token
parse the canonical token
require the identical binary64 value
```

The round trip is **verified per token**, not assumed. `formatSvgNumber` returns
`undefined` if it ever fails — defence in depth, since the ECMAScript
specification guarantees `Number.prototype.toString` is the shortest
round-tripping decimal; a failure would mean the runtime is not the one this
policy was written against, and refusing the file is the only safe answer.

No claim is made about preserving decimal text beyond the accepted binary64
value. That value is preserved exactly.

### Canonical lexical rules

| Rule | Effect |
|---|---|
| `-0 → 0` | `-0`, `-0.0`, `-0e5` all print `0` |
| no leading `+` | `+1` → `1` |
| lowercase `e` | `1E-07` → `1e-7` |
| no `+` in the exponent | `1e+21` → `1e21` |
| no leading exponent zeros | `1e-0007` → `1e-7` |
| no redundant zeros | `1.000` → `1`, `0001.2500` → `1.25`, `.50` → `0.5` |
| no trailing decimal point | `1.` → `1`, `5.` → `5` |
| no surrounding whitespace | trimmed before parsing, never emitted |

**Threshold.** Plain decimal for `1e-6 ≤ |v| < 1e21`, exponent notation outside
it — `Number.prototype.toString`'s own, used consistently and nowhere
overridden. Choosing a different threshold would mean re-implementing
shortest-round-trip printing, which is the one thing here that must not be
re-implemented.

### Removed techniques

`toFixed`, `toPrecision`, `toLocaleString`, fixed decimal truncation or
rounding, clamping small values to zero, clamping large values, dropping
low-order digits, locale formatting and any arbitrary epsilon are **absent from
every SVG production file**, and the gate asserts their absence across the whole
`domain/svg` subtree. The `NUMERIC_SCALE`-based P01 design-document quantization
is explicitly not applied to SVG geometry, and the gate asserts that too.

---

## 3. Round-trip evidence

| Value | Canonical token | Recovers identically |
|---|---|---|
| `Number.MIN_VALUE` (smallest positive subnormal) | `5e-324` | yes |
| `Number.MAX_VALUE` | `1.7976931348623157e308` | yes |
| `2.2250738585072014e-308` | same | yes |
| `0.1 + 0.2` | `0.30000000000000004` | yes |
| `1 / 3` | `0.3333333333333333` | yes |
| `Math.PI` | `3.141592653589793` | yes |
| `123456789.12345679` | same | yes |
| `1e-7`, `1e21`, `-1e-7` | `1e-7`, `1e21`, `-1e-7` | yes |

Adjacent binary64 values stay distinct: `1` vs `1.0000000000000002`, `0.1` vs
`0.10000000000000002`, `MIN_VALUE` vs `MIN_VALUE × 2`, `1e21` vs
`1.0000000000000003e21` — each pair prints two different tokens.

`9007199254740993` canonicalizes to `9007199254740992`, which is not a loss: the
odd integer is not representable, so the *accepted* value is the even one, and
the token names it exactly.

---

## 4. One numeric authority

The same parser and the same formatter now serve `viewBox`, every geometry
attribute, opacity, stroke and dash values, transform arguments, `points`, path
parameters and colour-alpha input. `formatSvgPathData` and
`formatSvgTransformList` were rewritten to return `string | undefined` so the
verified formatter's refusal propagates instead of being swallowed — no separate
lossy serializer remains in path or transform code.

Integration evidence:

```text
transform="translate(1e-7 -1e-9)"                     → unchanged
d="M1e-7 -1e-9L0.30000000000000004 0.1234567890123Z"  → unchanged
points="1e-7,1e-9 2,3"                                → 1e-7 1e-9 2 3
stroke-width="1e-7", opacity="0.0000001"              → 1e-7
d="M5e-324 1.7976931348623157e308Z"                   → unchanged
```

**Unchanged by the correction.** Arc flags remain exact `0`/`1`, read as single
characters and validated *before* any general numeric canonicalization — proven
by `A1 1 0 1e-7 1 1 1` still rejecting. The integer-only `viewBox` width/height
rule is untouched (`0 0 100.5 50` still rejects; a fractional `minX` is still
allowed). Strict parsing still refuses `NaN`, `Infinity`, `1e999`, units,
percentages, `calc()`, hex/binary/octal, numeric separators, `1,5`, `1.2.3`,
malformed exponents and signs, and surrounding whitespace.

---

## 5. Paint alpha

Output is still `none`, `#rrggbb`, `#rrggbbaa`. The conversion is now a named
function, `round(alpha × 255)` with JavaScript's half-up rule, and tested at its
boundaries:

| Alpha | Channel | Token |
|---|---|---|
| `1` | 255 | `#000000` (alpha dropped when fully opaque) |
| `0.999` | 255 | `#000000` |
| `0.998` | 254 | `#000000fe` |
| `0.75` | 191 | `#000000bf` (191.25 rounds **down**) |
| `0.5` | 128 | `#00000080` (127.5 rounds **up**) |
| `0.25` | 64 | `#00000040` |
| `0.1` | 26 | `#0000001a` (25.5 rounds **up**) |
| `0` | 0 | `#00000000` |

Alpha now shares the one numeric grammar, so `rgb(0 0 0 / 1e-3)` is a number
(→ `#00000000`) while `50%`, `1.5` and `-0.1` still reject.

---

## 6. Fixed point and determinism

The canonical model now holds lossless tokens, so the fixed point means what it
should:

```text
accepted binary64 → canonical token with the identical value
→ structural comparison → S1 → reparse/revalidate → S2 → S1 = S2
```

`canonicalize(canonical) = canonical` is asserted for every value in the edge
corpus, and `S1 = S2` byte-for-byte is asserted on a document built entirely from
tiny and high-precision values — the case the old code reached only after
rounding.

The container determinism suite was extended with that numeric corpus (five
files now: four accepted, one refused). Five fresh host processes and the
production `node:22.14.0-alpine` image produce **identical bytes and identical
SHA-256** for every case. Shortest-round-trip printing is the one part of
canonicalization delegated to the runtime, so it is the one part that had to be
proved identical on a second platform rather than assumed.

---

## 7. Regressions

| Command | Result |
|---|---|
| `pnpm --filter @embroidery/worker test` | **795/795**, 36 suites |
| security corpus (rejection + acceptance) | 175/175 |
| numeric edge corpus (new) | 88 cases |
| normalization live-stack suites (PostgreSQL + MinIO) | 38/38, 3 suites |
| `template-svg-determinism` process suite | 3/3 |
| `node tools/check-app3-w01b.mjs` · `-grammar` · `-boundaries` | PASS |
| `node tools/check-app3-w01a.mjs` · `-output` | PASS |
| `node tools/check-app3-g07.mjs` · `b01n` · `g06` · `g04` | PASS |
| `node --test check-app3-w01b.test.mjs` | 39/39 |
| `node --test check-app3-w01b-grammar.test.mjs` | **68/68** (was 51) |
| `node --test check-app3-w01a.test.mjs` · `g07` · `b01n` · `g06` · `g04` | 40 · 49 · 34 · 45 · 39 |
| `pnpm --filter @embroidery/worker typecheck` · `build` | PASS |
| `pnpm format:check` · `pnpm lint` | PASS · 24/24 |
| `node tools/check-file-size.mjs` | 3 pre-existing failures only |
| `git diff --check` | clean |

The whole prior acceptance and rejection corpus stayed green **unchanged**:
ordinary values such as `1.5`, `#ff0000` and `translate(1 2)` canonicalize
identically under both implementations, so every existing byte-exact assertion
still holds. W01A raster output, the quartet, idempotency and concurrent
convergence are all unchanged — the correction touches no raster code.

Two W01A/W01B test expectations were corrected rather than the code: the path
grammar's "out of range" case tested the removed magnitude cap, and the value
grammar's "never prints exponent notation" case asserted the defect itself.

---

## 8. Gate correction

`check-app3-w01b-grammar.mjs` gained `checkNumericCanonicalization`, asserting:
the `-0` normalization, shortest round-trip printing, the **verified** round
trip, the finite check, the absence of `toFixed`/`toPrecision`/`toLocaleString`/
`EPSILON`/`Math.trunc`/a decimals constant/a magnitude constant across ten SVG
source files, that the transform, values and path serializers all use the shared
formatter, that paint alpha uses the shared parser, and that design-document
quantization is not applied. The corpus check gained nine numeric requirements
plus the container corpus and the end-to-end fidelity case.

17 new regression cases prove each one fires — including reintroducing
`toFixed(6)` in the exact place the defect lived.

---

## 9. Files and line counts

| File | Lines | Change |
|---|---|---|
| `domain/svg/svg-number.ts` | 121 | rewritten |
| `domain/svg/svg-number-edge.spec.ts` | 249 | new |
| `domain/svg/svg-paint.ts` | 118 | alpha via shared parser, named conversion |
| `domain/svg/svg-transform.ts` | 102 | checked formatter |
| `domain/svg/svg-attribute-values.ts` | 143 | checked viewBox formatter |
| `domain/svg/template-svg-policy.ts` | 159 | two constants removed |
| `domain/svg/path/path-parser.ts` | 109 | magnitude cap removed |
| `domain/svg/path/path-serializer.ts` | 33 | checked formatter |
| `domain/svg/svg-document-builder.ts` | 201 | checked viewBox |
| `domain/svg/svg-value-grammar.spec.ts` | 281 | expectations corrected |
| `domain/svg/path/path-grammar.spec.ts` | 104 | cap case removed |
| `application/template-svg-sanitizer.acceptance.spec.ts` | 260 | fidelity block added |
| `test/process/template-svg-determinism.process.spec.ts` | 186 | numeric corpus added |
| `tools/check-app3-w01b-grammar.mjs` | 395 | numeric checks |
| `tools/check-app3-w01b-grammar.test.mjs` | 591 | 17 new cases |

All within the limits (source ≤ 400, tests ≤ 600). Docs updated: the APP3 phase
(§6.17.2 PO-09 clarification, new §6.19, status block), the decision register
(`IMP-D047` PO-09 clarification), the master roadmap and the phase source map.
**No `IMP-D048` was created** and no historical completion report was rewritten.

---

## 10. Confirmed unchanged

No dependency change — `apps/worker/package.json` and `pnpm-lock.yaml` are
byte-identical. No Docker or infrastructure change. No API, OpenAPI, generated
client, database schema, migration, derivative kind, event, producer, handler,
public delivery, admin, storefront, Figma or spike change. No
`packages/object-storage` or `packages/domain-types` change. Root scripts remain
30. No root script, and `pnpm quality` was not run.

The sanitizer architecture, allowlists, complexity limits, path commands, output
MIME, object protocol and database behaviour are exactly as accepted.

---

## 11. Limitations

1. **Three pre-existing `check-file-size` failures remain** —
   `check-app3-g01.mjs` (411), `check-app3-g03.mjs` (409) and
   `check-app3-g05.test.mjs` (609). Byte-identical at entry.
2. **The magnitude ceiling was removed**, so a coordinate of `1e308` is now
   accepted where it was previously refused. That is required by §3's ban on
   clamping and §8's max-finite round-trip; the complexity ceilings (bytes,
   elements, path characters, depth) and the `viewBox` ceilings are unchanged,
   and they are what actually bound a Template's cost.
3. **Determinism is proven on two platforms** — Windows host and Alpine Linux in
   the production image. Shortest-round-trip printing is specified behaviour, so
   a third platform is expected to agree, but it is not proven here.
4. `FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01` stays
   `OPEN — BLOCKS_NEXT_SCHEMA_BACKED_HTTP_CHECKPOINT`, untouched.

---

```text
APP3-W01B-C1 = COMPLETE — REVIEW_DELIVERED
APP3-W01B    = COMPLETE — CORRECTION_DELIVERED_FOR_REVIEW
```

Human review owns `APP3-W01B = COMPLETE — REVIEW_ACCEPTED`.
