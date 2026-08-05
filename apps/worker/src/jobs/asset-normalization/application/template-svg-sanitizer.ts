/**
 * The deterministic Template SVG pipeline (`IMP-D047` PO-12).
 *
 * The thirteen ruled steps, in order, with no shortcut and no mutation after the
 * final pass. The one that carries the design is step 11: the whole pipeline is
 * run **twice** — once on the source and once on its own canonical output — and
 * the two serializations must be byte-identical.
 *
 * That fixed point is what makes "reject on any structural removal" enforceable
 * at all. Without it, "the sanitizer did not change anything" is a claim about
 * one comparison of two trees; with it, the canonical form is proven to be a
 * value the whole pipeline maps to itself, so anything the first pass altered
 * would have to alter again — and would be caught by a byte comparison that
 * cannot be reasoned around.
 *
 * Every failure is `undefined`. The caller raises the single stable outcome; no
 * step reports which rule refused, and no step repairs, clamps or truncates.
 */
import { canonicalDocumentsEqual, type CanonicalSvgDocument } from '../domain/svg/svg-document';
import { buildCanonicalSvgDocument } from '../domain/svg/svg-document-builder';
import { readTemplateSvgSource } from '../domain/svg/svg-source-form';
import { serializeCanonicalSvgBytes } from '../domain/svg/svg-serializer';
import { withSanitizedSvgRoot } from '../infrastructure/svg/dompurify-svg-sanitizer';
import { withStrictSvgRoot } from '../infrastructure/svg/jsdom-svg-parser';

export interface SanitizedTemplateSvg {
  /** The canonical bytes, and the only bytes anything downstream may use. */
  readonly bytes: Buffer;
  readonly widthPx: number;
  readonly heightPx: number;
}

interface SanitizationPass {
  readonly document: CanonicalSvgDocument;
  readonly bytes: Buffer;
}

/**
 * One complete pass: form gate, strict parse, validation, sanitize, compare,
 * serialize.
 *
 * The validated model and the sanitized model are built by the *same* builder
 * from two independently produced DOMs. Comparing them answers the only
 * question DOMPurify is here to answer — did an active-content defence see
 * something this policy's own validation accepted?
 */
function runPass(bytes: Buffer): SanitizationPass | undefined {
  const source = readTemplateSvgSource(bytes);
  if (!source.ok) return undefined;

  const validated = withStrictSvgRoot(source.text, buildCanonicalSvgDocument);
  if (validated === undefined) return undefined;

  const sanitized = withSanitizedSvgRoot(source.text, buildCanonicalSvgDocument);
  if (sanitized === undefined) return undefined;

  if (!canonicalDocumentsEqual(validated, sanitized)) return undefined;

  return { document: sanitized, bytes: serializeCanonicalSvgBytes(sanitized.root) };
}

/**
 * Sanitizes Template SVG source bytes, or refuses the whole file.
 *
 * `width_px` and `height_px` come from the canonical `viewBox` and from nothing
 * else — no DPI, no rounding and no fallback to a root `width`/`height`, which
 * PO-10 forbids because those two attributes are a *display* hint that a
 * renderer may override.
 */
export function sanitizeTemplateSvg(sourceBytes: Buffer): SanitizedTemplateSvg | undefined {
  const first = runPass(sourceBytes);
  if (first === undefined) return undefined;

  const second = runPass(first.bytes);
  if (second === undefined) return undefined;
  if (!first.bytes.equals(second.bytes)) return undefined;

  return {
    bytes: first.bytes,
    widthPx: first.document.viewBox.width,
    heightPx: first.document.viewBox.height,
  };
}
