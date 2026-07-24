# ADR-APP0-001 — 2D Design Studio Rendering Engine and Engine-Neutral Document Adapter

- Status: Accepted
- Date: 2026-07-24
- Git HEAD: `adb28efbed4c8af66ab2c50f244e0aa9360aaa97`
- Decision IDs: D-004, D-005, D-007, D-008, D-009 (`docs/12-DECISION-LOG.md`)
- Implementation decision: IMP-D026 (resolves IMP-O004)
- Evidence: `spikes/app0-r01-design-studio/`,
  `docs/implementation/reports/APP0-R01-COMPLETION-REPORT.md`

## Context

APP3 delivers the 2D Design Studio (`docs/05-DESIGN-STUDIO-SPEC.md`). The
rendering engine and the rendering architecture were the last unresolved
implementation decision blocking it (IMP-O004). `docs/12-DECISION-LOG.md` already
locks the product frame: an advanced product customizer rather than a design
suite (D-004), 2D product-image composition only (D-005), no customer
export/download (D-007), a dynamic repeated watermark on customer previews
(D-008), and no claim of screenshot prevention (D-009). `ADR-DB1-012` already
locks that `packages/design-document` owns the document model, RFC 8785 canonical
serialization and SHA-256 hashing; the renderer is a consumer of that model, not
its owner.

APP0-R01 built one research harness (`spikes/app0-r01-design-studio/`) in which
three candidates implement the **same** adapter contract over the **same**
engine-neutral document and are measured by the **same** driver, on Windows
(desktop + mobile Chromium) and in the pinned Linux Playwright image (desktop +
mobile Chromium, desktop WebKit).

## Decision Drivers

- Mobile is a first-class surface (`05 §7`, `10 §7`): "mobile-capable
  customizer", and phones are high-DPI, where a canvas repaints the whole
  backing store every frame.
- The repeated watermark (D-008) is mandatory and static, so how an engine
  isolates static content from the dragged element materially changes cost.
- `FRONTEND_CONVENTIONS.md` §12 requires the document model to stay
  framework-independent and forbids the renderer becoming the source of truth.
- `10 §6` requires meaningful non-canvas controls; canvas is opaque to assistive
  technology, SVG is not.
- `FRONTEND_CONVENTIONS.md` §3 requires SEO-critical content in server-rendered
  HTML and forbids hiding essential content only inside canvas.
- Expected scale is small (`10 §3`: 20–100 products, <10 concurrent editor
  users), so raw throughput ceilings matter far less than interaction latency.

## Options Considered

| Option | Version / license | Executable spike | Outcome |
| --- | --- | --- | --- |
| A. Konva + react-konva | `konva 10.3.0` MIT (2026-04-30) + `react-konva 19.2.5` MIT (2026-06-09) | Yes | Runner-up; documented fallback |
| B. Fabric.js | `fabric 7.4.0` MIT (2026-05-18) | Yes | Rejected |
| C. Native SVG rendered by React 19 | no rendering dependency | Yes | **Chosen** |
| D. PixiJS / WebGL | `pixi.js 8.19.0` MIT (2026-07-13) | No — rejected before spiking | Rejected |

`interactjs 1.10.27` was audited as the pointer layer for option C and rejected:
its last release is 2024-03-28, and the spike proved the platform Pointer Events
API covers tap, drag, pinch, two-finger pan and cancel with no dependency.

## Decision

### 1. Rendering engine (locked)

**Native SVG rendered by React 19 itself.** APP3 adds **no** rendering-engine
dependency: no Konva, no Fabric, no PixiJS, no interaction library. Scene nodes
are real DOM nodes produced by React from the design document.

### 2. Rendering architecture (locked)

1. **Engine-neutral document is the single source of truth.** The renderer is a
   pure projection of it. No engine-native serialization (`toJSON()`,
   `toObject()`, `toDatalessJSON()`) is ever persisted or transported.
2. **A renderer adapter boundary is mandatory** even though only one renderer is
   selected. All rendering is reached through one narrow adapter contract
   (mount/load/select/transform/z-order/lock/hide/group/viewport/hit-test/
   serialize/destroy), so a future engine change is a contained replacement. The
   spike proved three implementations of that contract produce byte-identical
   canonical documents.
3. **Selection, hover, handles, viewport zoom/pan and the watermark are runtime
   state and are never serialized.**
4. **Mutable runtime objects (DOM nodes, refs, adapter instances) never enter
   Zustand or React state** (`FRONTEND_CONVENTIONS.md` §10). Zustand holds ids,
   tool selection and viewport values only.
5. **Geometry and coordinate conversion live outside components** — document
   pixels ↔ product-image pixels ↔ physical millimetres are centralised
   (`packages/design-engine`).
6. **Undo/redo is a domain concern**, expressed as commands/snapshots over the
   document, never as an engine history stack.
7. **Pointer/touch handling is engine-neutral**; only hit testing is
   renderer-specific, and with SVG it is native DOM hit testing.
8. **Transform handles are DOM elements**, not scene nodes: they must keep a
   fixed physical size independent of canvas zoom, sit **outside** the element
   box, be at least 44 px, and be focusable for keyboard/assistive use.
9. **The Studio is client-only and lazily loaded**; the route shell stays
   server-rendered.

### 3. Watermark (locked)

The repeated watermark is **preview policy**, supplied at mount/load time and
never part of the document: non-selectable, non-deletable, topmost, regenerated
on every load, marked with an opaque session/request token that carries no raw
PII. It is deterrence and value reduction, never screenshot prevention (D-009).

### 4. Serialization (locked)

The Studio produces only the canonical document owned by
`packages/design-document` (RFC 8785 JCS + SHA-256, ADR-DB1-012). Unknown
`schemaVersion` fails loudly. Numbers are quantized before hashing so accumulated
float noise cannot change a hash. **Browser code must not depend on
`crypto.subtle`**: it exists only in a secure context, so the API remains the
hashing authority (see Risks).

### 5. Assets and security (locked)

Elements reference an asset id plus an approved **derivative**; originals and
high-resolution previews are never loaded by the customer editor. SVG uploads are
sanitized before they reach the renderer (sanitizer selection remains APP3's).
No export/download surface exists in customer UI (D-007).

### 6. Performance budgets (locked as provisional)

| Budget | Value |
| --- | --- |
| Transform frame p95, desktop, 50 elements | ≤ 20 ms |
| Transform frame p95, mobile, 50 elements | ≤ 33 ms |
| Long task during a 2 s gesture | no repeated task > 100 ms |
| Scene load to usable, 50 elements | ≤ 500 ms desktop / ≤ 1000 ms mobile |
| Canonical serialize / deserialize, 150 elements | ≤ 100 ms / ≤ 300 ms |
| Additional gzip for the renderer | ≤ 200 KB |
| Heap across 20 mount/destroy cycles | no monotonic growth |

`10 §3` defers exact budgets; these stand until APP12 replaces them.

### 7. Upgrade policy (locked)

There is no rendering dependency to upgrade. Re-run the APP0-R01 benchmark
(`pnpm spike:editor:benchmark`) on any React or Next major upgrade, and re-open
this ADR only with new measured evidence.

## Consequences

### Positive

- Every measured budget passes in every one of the five platform/browser runs,
  including the largest scene (150 elements): transform frame p95 16.7–17 ms on
  Windows and Linux, desktop and mobile Chromium and desktop WebKit alike, with
  zero dropped frames and zero long tasks. It is the only candidate that passes
  the full matrix.
- Zero additional bundle bytes for rendering; the Studio chunk carries only
  application code.
- Native accessibility: real focusable nodes, `aria-*`, and keyboard handling
  without inventing a parallel DOM (`10 §6`).
- Native hit testing honours `pointer-events`, so locked elements are
  untappable for free.
- The document is the only serializer available, so engine-native persistence is
  structurally impossible.
- Server-renderable markup keeps the door open for `FRONTEND_CONVENTIONS.md` §3.

### Negative

- Editor primitives that Konva ships (transformer, snapping, marquee
  multi-select, hit graph) must be implemented. The spike reduced this cost —
  handles must be DOM overlays for touch/accessibility regardless of engine —
  but selection marquee, snapping and guides remain APP3 work.
- Very large scenes would eventually cost more in DOM nodes than in canvas
  nodes (150 elements ≈ 508 DOM nodes measured). Well inside expected scale, but
  it is the metric to watch.
- Raster filters (if ever needed) have no built-in implementation.

## Risks and Mitigations

- **Risk:** DOM node growth if the product later needs far larger scenes.
  **Mitigation:** the L-scene (150-element) benchmark is a committed regression
  scene; re-run it before raising any element limit.
- **Risk:** WebKit re-rasterises the whole SVG on viewport scale — measured
  zoom-gesture p95 41 ms on desktop WebKit versus 16.7 ms on Chromium.
  **Mitigation:** APP3 zoom should step discretely and/or use a CSS transform on
  a wrapper rather than continuously changing the SVG scale; re-measure.
- **Risk:** a developer reaches for `crypto.subtle` in the browser and the
  editor breaks on a non-secure origin.
  **Mitigation:** hashing stays server-side in `packages/design-document`; the
  spike documents and demonstrates the failure and a fallback.
- **Risk:** the adapter boundary erodes and SVG details leak into features.
  **Mitigation:** the adapter contract is the reviewed boundary at APP3-S02;
  `tools/check-spike-boundaries.mjs` already blocks any rendering-candidate
  dependency from entering an app manifest.

## Rejected Alternatives

- **Fabric.js 7.4.0** — richest built-ins, but its single-canvas full-repaint
  model fails the frozen budgets at product scale: desktop transform p95 33.4 ms
  (budget 20), mobile 50.1 ms (budget 33), 150-element load-to-usable 285–494 ms,
  long tasks up to 181 ms, 30–59 dropped frames per 60-frame gesture. Attribution
  runs show the mandatory repeated watermark is a dominant part of that cost
  (desktop M drag p95 falls from 33.4 ms to 16.7 ms when the watermark is made
  sparse) — i.e. the failure is caused by a **product requirement**, not by an
  artificial benchmark. It also has no React binding and its imported-SVG group
  layout diverges from the document box, breaking naive hit testing.
- **Konva 10.3.0 + react-konva 19.2.5** — passes every functional gate, and every
  budget on desktop Chromium (transform p95 16.8 ms at all scene sizes);
  **runner-up and the documented fallback**. Rejected as the primary because it
  sits *on* the budget boundary rather than inside it: mobile transform p95
  **33.4 ms against a 33 ms budget in every run**, desktop **WebKit** transform
  p95 measured **20–23 ms against a 20 ms budget** across repeated runs, and
  mobile long tasks measured **96–109 ms against a 100 ms budget** — i.e. its
  pass/fail verdict flips between runs, which is not a margin worth building a
  flagship feature on. At 150 elements it shows 50 ms p95 and 19–22 dropped
  frames per 60-frame gesture. It also adds ~92 KB gzip (of which ~43 KB is the
  react-konva reconciler binding), cannot recolour an imported SVG (it rasterises
  SVG through `HTMLImageElement`), and gives assistive technology nothing to
  hold. `react-konva` pins `react ^19.2.0` as a peer, coupling upgrades tightly.
  The breaches are small, so it remains a credible fallback.
- **PixiJS 8.19.0 / WebGL** — rejected before spiking on official evidence: it is
  a WebGL/WebGPU rendering library for graphics-heavy and game workloads, brings
  ten runtime dependencies (including `@xmldom/xmldom` and `parse-svg-path`) for
  capabilities SVG has natively, offers no accessibility story for editor
  semantics, and adds GPU context-loss failure modes on mobile — all for
  throughput this product does not need at <10 concurrent editors.
- **interact.js 1.10.27** — no release since 2024-03-28; the platform Pointer
  Events API covered every required gesture in the spike.

## Deferred Details

- SVG sanitizer selection, font loading/whitelist mechanics, snapping/guide
  rules, marquee multi-select, crop UX, freehand smoothing, autosave cadence and
  conflict policy — **owner: APP3**.
- Concrete production performance budgets — **owner: APP12** (`10 §3`).
- Whether `packages/design-engine` or a Studio feature owns each geometry helper
  — **owner: APP3-S02**.

## Implementation Checkpoint

APP3-S01 (route shell, client boundary) and APP3-S02 (renderer and selection).

## Verification Checkpoint

APP3-E01 (Studio E2E) plus the committed APP0-R01 regression scenes.

## Reversal / Migration Cost

Low-to-moderate and contained by design: because the document is engine-neutral
and all rendering goes through the adapter contract, swapping to the Konva
fallback replaces one adapter implementation and changes no persisted byte. The
spike itself is the proof — three interchangeable adapters produced the identical
canonical hash `sha256:d8a4f67d07c5e27aee2de8264ae4848405339e09114b10cfe6b6fcc7137b7d81`
for the cross-engine subset on both platforms.

## References

- `docs/05-DESIGN-STUDIO-SPEC.md`; `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §5–§6;
  `docs/10-NON-FUNCTIONAL-REQUIREMENTS.md` §3/§6/§7; `docs/12-DECISION-LOG.md`
  D-004/D-005/D-007/D-008/D-009
- `docs/adr/database/ADR-DB1-012-DESIGN-DOCUMENT-CANONICALIZATION.md`
- `docs/development/FRONTEND_CONVENTIONS.md` §3, §10, §12, §15, §17
- Konva — https://konvajs.org/ · https://github.com/konvajs/konva
- react-konva — https://github.com/konvajs/react-konva
- Fabric.js — http://fabricjs.com/ · https://github.com/fabricjs/fabric.js
- PixiJS — https://pixijs.com/ · https://github.com/pixijs/pixijs
- interact.js — https://interactjs.io/
- SVG 2 — https://www.w3.org/TR/SVG2/ · Pointer Events — https://www.w3.org/TR/pointerevents3/
- Secure contexts — https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts
