# `APP3-W01B` — sanitized Template SVG normalization

```text
APP3-G07  = COMPLETE — REVIEW_ACCEPTED
APP3-W01B = COMPLETE — REVIEW_DELIVERED
APP3-B03  = BLOCKED_BY_PLATFORM_ZOD_OPENAPI_FOLLOW_UP
            BUT_TEMPLATE_RASTER_AND_SVG_NORMALIZATION_FOUNDATION_READY
```

Commit A: `5e648e4` `feat(worker): normalize sanitized Template SVG`
Commit B: this report only.
Branch `production`, local. **Nothing pushed.** Working tree clean.

---

## 1. What was delivered

`APP3-G07` selected the sanitizer and locked `IMP-D047`; this checkpoint
implements it. `TEMPLATE_ASSET` plus `image/svg+xml` is now sanitized and
finalized as a private, unwatermarked `NORMALIZED` derivative. The staged
`TEMPLATE_SVG_NORMALIZATION_NOT_AVAILABLE` refusal `APP3-W01A` shipped is gone.

It is an **extension of the accepted W01A consumer, not a second one**: the same
event, the same claim, the same deterministic key, the same `READY`-plus-quartet
finalization, the same cleanup, the same attempt evidence. What is new is one
lane and the deterministic pipeline behind it.

---

## 2. Dependencies, integrity and licences

| Fact | Value |
|---|---|
| Sanitizer | `dompurify@3.4.13` |
| Sanitizer licence | `(MPL-2.0 OR Apache-2.0)` |
| Sanitizer runtime dependencies | `0` |
| Sanitizer integrity | `sha512-2vmYIoqjze2d+kakP8S/nS5shfsl587kzwEjcGlTdiksUVgFHnFCsLYDVj/JNqJVOQZGSYBTmuycv0PodwmnMQ==` |
| DOM | `jsdom@29.1.1` |
| DOM licence | `MIT` |
| DOM integrity | `sha512-ECi4Fi2f7BdJtUKTflYRTiaMxIB0O6zfR1fX0GXpUrf6flp8QIYn1UT20YQqdSOfk2dfkCwS8LAFoJDEppNK5Q==` |
| Type declarations | `@types/jsdom@21.1.7` (worker `devDependencies`) |
| Types integrity | `sha512-yOriVnggzrnQ3a9OKOCxaVuSug3w3/SbOj5i7VwXWZEyUNl3bLF9V3MfxGbZKuwqJOQyRfqXyROBB1CoZLFWzA==` |
| New external type version | `NONE` — `21.1.7` was already resolved in the repository via `jest-environment-jsdom` |
| Range form | exact pins; no caret, tilde, wildcard or `latest` |
| `install`/`postinstall` script | **none** in either package |
| Native binary download | none |
| Runtime network call | none |
| Lockfile delta | **289 insertions, 0 deletions** — additions only |
| Unrelated importer drift | none |
| Unrelated upgrade | none |
| Packages outside the worker holding either | none |

`jsdom@29.1.1` declares `engines.node = ^20.19.0 || ^22.13.0 || >=24.0.0`.
`dompurify@3.4.13` ships its own type declarations, so only jsdom needed
`@types/jsdom`; because `21.1.7` was already in the tree, no new external
version was introduced and `pnpm install` downloaded nothing for it.

**Why not the newest jsdom.** `jsdom@30.0.1` declares
`engines.node = ^22.22.2 || ^24.15.0 || >=26.0.0` and every application image is
`node:22.14.0-alpine`. `22.14.0` does not satisfy `^22.22.2`. Pinning it would
have compiled, passed every local test and failed at container start. The gate
now asserts this mechanically by comparing the installed package's `engines`
against the Node version in the Dockerfile.

---

## 3. Container proof

Built `infrastructure/docker/worker.Dockerfile --target runner` and ran the
sanitizer inside it:

```json
{"node":"v22.14.0","jsdom":"29.1.1","dompurify":"3.4.13",
 "sha256":"188750f2569232bcc23ca1aa4c8dd4b3d85614c2f8877b9e0dc6f2bbf67e3372",
 "width":320,"height":240,"bytes":185,"unsafeRejected":true}
```

The same corpus on the Windows host produces the **same SHA-256 and the same
185 bytes**. jsdom 29.1.1 loads under the locked Node 22.14.0; a file carrying a
`<script>` is refused. No image upgrade and no runtime network dependency.

`docker run` of the image now reaches `Missing DATABASE_URL` — the expected
configuration error — instead of dying on an import (see §9).

---

## 4. XML handling and the jsdom lifecycle

Before jsdom, on **bytes**: source at most 1 MiB, UTF-8 decoded with
`fatal: true`, a leading or embedded BOM rejected, and any occurrence of `<!` or
`<?` rejected. Those two markers cover DOCTYPE, entity declarations, CDATA,
comments, processing instructions and the XML declaration in one rule that
cannot be widened by spelling — `<!doctype`, `<!DoCtYpE` and `<!ENTITY` all fail
on the two characters that introduce them.

Parsing is `new JSDOM(text, { contentType: 'image/svg+xml' })` and nothing else.
`runScripts`, `resources`, `url`, `cookieJar` and `virtualConsole` are never
passed. Verified against jsdom 29.1.1 that malformed XML, an undefined entity
and a second root each **throw** — the HTML parser would have repaired all three
into a different document.

Every window is created inside the call and closed in `finally` on every path:
success, rejection and throw. No window and no DOMPurify instance is held at
module scope, so nothing travels between two Templates.

---

## 5. DOMPurify configuration

Created from the isolated window per job with explicit `ALLOWED_TAGS`,
`ALLOWED_ATTR`, `NAMESPACE` (SVG), `PARSER_MEDIA_TYPE` (XML), `RETURN_DOM`, and
`ALLOW_DATA_ATTR`, `ALLOW_ARIA_ATTR`, `ALLOW_UNKNOWN_PROTOCOLS`,
`ALLOW_SELF_CLOSE_IN_ATTR`, `SAFE_FOR_TEMPLATES`, `WHOLE_DOCUMENT`, `IN_PLACE`,
`KEEP_CONTENT` and `allowCustomizedBuiltInElements` all `false`, with empty
`ADD_TAGS`, `ADD_ATTR`, `ADD_URI_SAFE_ATTR` and `ADD_DATA_URI_TAGS`. No
`USE_PROFILES`: a profile would replace the explicit lists with the library's.

**`DOMPurify.removed` is never read.** The security decision is the repository's
own validation; DOMPurify's job is to prove that validation missed nothing. The
gate fails if `.removed` appears in the sanitizer or the pipeline.

---

## 6. Parsers, allowlists and limits

Nine elements — `svg g path rect circle ellipse line polyline polygon` — and no
tenth. Root attributes are exactly `xmlns` and `viewBox`. Elsewhere, the exact
`IMP-D047` presentation set plus geometry attributes only where semantically
valid. `id`, `class`, `style`, `href`, `xlink:href`, every `on*`, `data-*`,
`aria-*`, `vector-effect` and every namespaced attribute reject.

Every allowed attribute has one validator, and an attribute with **no** entry is
rejected — that default is what keeps a widened name list from admitting an
unvalidated string.

- **Numbers**: full-input base-10, no unit, percentage, `calc()`, `NaN` or
  `Infinity`; canonicalized to a fixed decimal budget so `-0` prints `0` and
  every value has one spelling that re-parses without exponent notation.
- **Paints**: `none`, `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`,
  `rgb(i i i)` and `rgb(i i i / a)` only, canonicalized to lowercase `#rrggbb`,
  `#rrggbbaa` or `none`. Named colours, `currentColor`, `context-fill`, `hsl`,
  `lab`, `lch`, `color`, `device-cmyk`, `var(` and `url(` all reject.
- **Transforms**: the six functions with exact arity, order preserved.
- **`viewBox`**: four numbers with **positive integer** width and height, each
  ≤ 4096 and the product ≤ 16,777,216.
- **Path data**: a package-owned tokenizer, parser and serializer. Real arity per
  command, implicit groups expanded, moveto continuation, and arc flags read as
  **single characters** so `a1 1 0 011 1` parses as the arc it is. No regex-only
  validator and no parser dependency.

Ceilings: 1 MiB source, 10,000 elements, 1,000,000 canonical path characters,
depth 64. Boundary passes and boundary plus one rejects, proven for each.
Nothing is truncated.

---

## 7. Structural comparison, fixed point and canonical output

The canonical model is built by the **same builder** twice — once from the
strictly parsed source and once from what DOMPurify returned — and compared deep.
Any difference rejects the whole file. A second, laxer reader would have made the
comparison pass by construction, so the gate asserts both call sites.

The whole pipeline then runs a **second time on its own canonical output** and
requires the two serializations to be byte-identical. That fixed point is what
makes rejection-on-removal enforceable: the canonical form is proven to be a
value the pipeline maps to itself.

Output: `image/svg+xml`, UTF-8, no BOM, no XML declaration, no newline at all
(so LF and no-trailing-newline hold by construction), lowercase names, `xmlns`
first and `viewBox` second on the root, remaining attributes sorted
lexicographically, double-quoted and XML-escaped, one empty-element form, and
explicit start/end tags for `svg` and `g`.

SHA-256, byte size and dimensions are derived from the final bytes. No optimizer
runs after the sanitizer, and none runs at all: SVGO and Sharp appear nowhere in
the Template lane.

---

## 8. Policy binding and outcomes

`TEMPLATE_SVG_SANITIZATION_POLICY_VERSION` is **defined as**
`NORMALIZATION_POLICY_VERSION`, not declared beside it, so the producer's policy
version and the sanitizer's cannot drift. An unsupported version raises
`TEMPLATE_SVG_POLICY_VERSION_UNSUPPORTED` **before the claim and before any
byte is read** — the gate asserts that ordering against the source.

Neither version is persisted on an Asset or an Asset Derivative row, and no
derivative kind was added.

Two outcomes and no third: `UNSAFE_OR_UNSUPPORTED_TEMPLATE_SVG` for anything the
policy does not admit (one code for every way a file can fail, because a precise
reason is a probe for what the allowlist contains), and
`TEMPLATE_SVG_POLICY_VERSION_UNSUPPORTED` for a deployment that is behind the
producer.

**Behaviour change worth naming.** A content verdict is now reached *after* the
claim, because judging content means reading it — so a refused Template leaves a
`FAILED NORMALIZED` row and no object, exactly as an integrity mismatch or an
undecodable raster does. `APP3-W01A` refused before claiming because it was
refusing a *capability*. The W01A integration assertion was updated to this
truth rather than left asserting zero rows.

---

## 9. Disclosed deviation — the production image

`APP3-B01N` (commit `2ada703`) made `@embroidery/domain-types` a worker **runtime**
dependency — it exports the event's version constants, which are values — but
added no `COPY` in the production image's `runner` stage.
`infrastructure/docker/worker.Dockerfile` was last touched by APP2-I03
(`6252e4d`), long before. The shipped image therefore resolved a dangling symlink
and died on its first import:

```text
LOAD_FAILED Cannot find module '@embroidery/domain-types'
```

This checkpoint's container proof was the first thing to load that module inside
the runner stage, and so the first thing to find it. Two `COPY` lines were added,
mirroring the three workspace packages already shipped; no `node_modules` line,
because the package has no runtime dependency of its own.

Recorded in the phase status as
`APP3-W01B DISCLOSED_DEVIATION = WORKER_IMAGE_DOMAIN_TYPES_COPY_RESTORED`.
No Node image upgrade, no new stage, no other infrastructure change.

Two smaller disclosed changes, both inside allowed files:

- `packages/object-storage/src/object-key.ts` gained `image/svg+xml → svg` in the
  key-extension map. Required for the safe-write key builder; it is not an intake
  format and it makes nothing deliverable.
- `apps/worker/jest.config.mjs` transpiles the fifteen ESM-only packages in
  jsdom 29's closure. That is what lets the corpus run against the **real** jsdom
  and the real DOMPurify instead of a mock of the parser under test. Production
  is unaffected — Node loads them natively.

---

## 10. Evidence

**Corpus.** 120 rejection cases covering scripts, event handlers, `foreignObject`
and embedded HTML, `image`/`href`/`xlink:href`, `javascript:`/`data:`/`blob:`/
`file:`/protocol-relative/relative/`#fragment`, `url(`/`var(`, `style` element
and attribute, text and fonts, `use`/`defs`/`symbol`, animation, filters, masks,
clips, gradients and patterns, DOCTYPE/entity/XXE/billion-laughs, namespace
confusion, malformed XML and multiple roots, `viewBox` violations, `NaN`/
`Infinity`/units/percentages, malformed paths and invalid arc flags, node/path/
depth/byte overflow, DOM-clobbering `id` and `name`, encoding and case evasions,
and an mXSS parser-differential fixture.

51 acceptance cases covering every allowed primitive, every presentation
attribute, every transform, every path command family and the exact boundaries.
Assertions are on **bytes, SHA-256 and outcome codes** — no snapshots.

| Command | Result |
|---|---|
| `node tools/check-app3-w01b.mjs` | PASS |
| `node tools/check-app3-w01b-grammar.mjs` | PASS |
| `node tools/check-app3-w01b-boundaries.mjs` | PASS |
| `node tools/check-app3-w01a.mjs` · `-output.mjs` | PASS |
| `node tools/check-app3-g07.mjs` · `b01n` · `g06` · `g04` | PASS |
| `node --test tools/check-app3-w01b.test.mjs` | 39/39 |
| `node --test tools/check-app3-w01b-grammar.test.mjs` | 51/51 |
| `node --test tools/check-app3-w01a.test.mjs` | 40/40 |
| `node --test tools/check-app3-g07.test.mjs` | 49/49 |
| `node --test tools/check-app3-b01n.test.mjs` · `g06` · `g04` | 34/34 · 45/45 · 39/39 |
| `pnpm --filter @embroidery/worker test` | 703/703, 35 suites |
| normalization live-stack suites (PostgreSQL + MinIO) | 38/38, 3 suites |
| `template-svg-determinism` process suite | 3/3 |
| `pnpm --filter @embroidery/worker typecheck` · `build` | PASS |
| `pnpm format:check` | PASS |
| `pnpm lint` | 24/24 |
| `node tools/check-file-size.mjs` | 3 pre-existing failures only |
| `git diff --check` | clean |

**Live-stack behaviour proven** (disposable PostgreSQL + disposable MinIO):
valid Template completion with the exact quartet, the canonical object at
`…/NORMALIZED.svg`, `is_watermarked = false`, byte size and checksum matching the
**object read back**, asset lifecycle untouched, replay idempotency, concurrent
convergence with the loser not deleting the winner's bytes, retired-association
refusal, stale-context refusal even when a good derivative exists, six unsafe
files leaving no `READY` and no `PROCESSING` row and no object, Side and Session
SVG refused as profile-invalid, and APP2 `THUMBNAIL`/`CATALOG_PREVIEW` rows
untouched.

**Determinism**: 25 same-process repetitions, 5 fresh host processes, and the
production container — identical bytes and identical SHA-256 throughout, plus
first-serialization = second-serialization on every accepted case.

---

## 11. Files

New worker source (lines): `template-svg-policy` 164, `svg-number` 91,
`svg-paint` 98, `svg-transform` 98, `svg-attribute-values` 141, `svg-document`
100, `svg-document-builder` 201, `svg-serializer` 63, `svg-source-form` 62,
`path-tokenizer` 146, `path-parser` 109, `path-serializer` 22,
`jsdom-svg-parser` 53, `dompurify-svg-sanitizer` 90, `template-svg-sanitizer` 83,
`template-svg-normalization.service` 179, `derivative-object-writer` 81.

New tests: rejection corpus 285, acceptance corpus 221, value grammar 273, path
grammar 105, source form 63, service 215, integration 325, determinism 180.

New tools: `check-app3-w01b` 277, `-grammar` 298, `-boundaries` 288, tests 442
and 479; `check-app3-w01a-files` 60, `check-app3-w01a-output` 118.

Every file is within the limits. `check-app3-w01a.mjs` was split at 444 lines
(the mode-aware edits pushed it past 400) into the checker, a shared file map and
an output-contract checker; the W01B checker and its tests were split the same
way, by responsibility.

Modified: the use case (lane dispatch), the raster service (lane discriminator
and the shared write), the outcome codes, the module, the jest config, the worker
manifest, the lockfile, the object key map, the Dockerfile, two W01A test files,
the phase document, the command index and the G07/W01A gates.

---

## 12. Confirmed unchanged

Zero HTTP paths, zero HTTP operations, zero OpenAPI schemas — the generated
document mentions neither SVG nor sanitization. Zero database migrations (34,
unchanged). No derivative kind, no schema column, no `assets.status` write. No
new event type, producer, handler, queue, scheduler or retry framework. No public
delivery route or policy: the output stays private, unwatermarked and
Template-owned. No API, admin, storefront, Figma or design change. Root scripts
remain 30.

The ninth mode-aware gate: `check-app3-g07.mjs` and `check-app3-w01a.mjs` now
accept exactly two consistent worlds — before W01B, nothing is installed and the
staged refusal is live; after it, the sanitizer is exactly what `IMP-D047`
selected. Both tokens (`APP3-W01B = COMPLETE` **and** `IMP-D047 = LOCKED`) are
required, and the half-flipped third world is asserted to fail.

---

## 13. Limitations

1. **Three pre-existing `check-file-size` failures remain** —
   `check-app3-g01.mjs` (411), `check-app3-g03.mjs` (409) and
   `check-app3-g05.test.mjs` (609). Byte-identical at entry; not this
   checkpoint's to fix.
2. **The `engines` check is narrow by design.** It understands the caret and
   `>=` clauses every range in this repository uses, and would not correctly
   evaluate an exotic semver range. The container run is the real proof; the
   static check exists to fail earlier and more cheaply.
3. **Determinism is proven on two platforms, not all.** Windows host and Alpine
   Linux in the production image. A third libc or architecture is unproven,
   though nothing in the pipeline is platform-sensitive.
4. **`FU-PLATFORM-ZOD-DTO-OPENAPI-METADATA-01` stays
   `OPEN — BLOCKS_NEXT_SCHEMA_BACKED_HTTP_CHECKPOINT`.** Untouched here, and
   still the blocker on `APP3-B03` and `APP3-B06`.
5. **Template SVG intake is not delivered.** Nothing yet creates a
   `TEMPLATE_SOURCE` SVG Asset or its association — that is `APP3-B02`/`B03`.
   This checkpoint delivers the consumer; the live-stack suite seeds the rows a
   producer will later write.
