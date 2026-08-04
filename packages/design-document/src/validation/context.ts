/**
 * Contextual validation: does the document reference things that actually
 * exist, and are they things a customer editor is allowed to see?
 *
 * The authority arrives as an argument. This package never opens a database
 * connection or an object-storage client — partly because that would destroy
 * its browser-safety, but mostly because IMP-D044 forbids an object-storage
 * read on a document write: eligibility is decided from canonical metadata that
 * a worker already measured, not by fetching the binary again.
 *
 * The metadata this compares against is `asset_derivatives.width_px`,
 * `height_px`, `media_type` and `byte_size` — the quartet `APP3-DB01` added.
 * `assets.mime_type` and `assets.size_bytes` describe the *source* binary and
 * are explicitly not a substitute (PO-07): a 4 MB source PNG says nothing about
 * the WebP the editor will load.
 */
import {
  DESIGN_DOCUMENT_LIMITS,
  ELIGIBLE_DERIVATIVE_KIND,
  ELIGIBLE_DERIVATIVE_STATUS,
} from '../schema/constants';
import type { DesignDocument } from '../schema/document';
import { finding, type DesignDocumentFinding } from '../findings/finding';
import { findControlledFont, supportsVariant } from '../fonts/registry';

/**
 * One derivative row as the caller knows it. Deliberately the canonical
 * columns and nothing else — no storage key, no URL, no grant.
 */
export interface DerivativeAuthorityRecord {
  readonly derivativeId: string;
  readonly assetId: string;
  readonly kind: string;
  readonly status: string;
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly mediaType: string | null;
  readonly byteSize: number | null;
}

export interface DesignDocumentContext {
  /** Keyed by `derivativeId`, exactly as the document references it. */
  readonly derivatives: ReadonlyMap<string, DerivativeAuthorityRecord>;
  /** Media types this delivery context accepts. Empty means "any measured type". */
  readonly allowedMediaTypes?: readonly string[];
}

function hasCompleteMetadata(record: DerivativeAuthorityRecord): boolean {
  return (
    typeof record.widthPx === 'number' &&
    typeof record.heightPx === 'number' &&
    typeof record.mediaType === 'string' &&
    typeof record.byteSize === 'number'
  );
}

function checkImage(
  element: {
    readonly assetId: string;
    readonly derivativeId: string;
    readonly intrinsicWidthPx: number;
    readonly intrinsicHeightPx: number;
  },
  path: string,
  context: DesignDocumentContext,
  findings: DesignDocumentFinding[],
): DerivativeAuthorityRecord | undefined {
  const record = context.derivatives.get(element.derivativeId);
  if (record === undefined) {
    findings.push(
      finding('UNKNOWN_ASSET_REFERENCE', `${path}.derivativeId`, 'This derivative is not known.'),
    );
    return undefined;
  }
  // The document naming derivative D but asset A, while D belongs to asset B,
  // is how a reference to somebody else's media would be smuggled in.
  if (record.assetId !== element.assetId) {
    findings.push(
      finding(
        'UNKNOWN_ASSET_REFERENCE',
        `${path}.assetId`,
        'This derivative does not belong to the referenced asset.',
      ),
    );
    return undefined;
  }
  if (record.kind !== ELIGIBLE_DERIVATIVE_KIND || record.status !== ELIGIBLE_DERIVATIVE_STATUS) {
    findings.push(
      finding(
        'INELIGIBLE_DERIVATIVE',
        `${path}.derivativeId`,
        'Only a ready editor-safe derivative may be placed in a design.',
        { requiredKind: ELIGIBLE_DERIVATIVE_KIND, requiredStatus: ELIGIBLE_DERIVATIVE_STATUS },
      ),
    );
    return undefined;
  }
  if (!hasCompleteMetadata(record)) {
    // Missing metadata makes a derivative ineligible; it is never guessed.
    findings.push(
      finding(
        'DERIVATIVE_METADATA_MISMATCH',
        `${path}.derivativeId`,
        'This derivative has not been measured, so it cannot be placed.',
      ),
    );
    return undefined;
  }

  const width = record.widthPx as number;
  const height = record.heightPx as number;
  const mediaType = record.mediaType as string;
  const byteSize = record.byteSize as number;

  if (width <= 0 || height <= 0 || byteSize <= 0 || mediaType.trim().length === 0) {
    findings.push(
      finding(
        'DERIVATIVE_METADATA_MISMATCH',
        `${path}.derivativeId`,
        'The recorded derivative metadata is not usable.',
      ),
    );
    return undefined;
  }
  const allowed = context.allowedMediaTypes;
  if (allowed !== undefined && allowed.length > 0 && !allowed.includes(mediaType)) {
    findings.push(
      finding(
        'INELIGIBLE_DERIVATIVE',
        `${path}.derivativeId`,
        'This derivative media type is not delivered in this context.',
      ),
    );
    return undefined;
  }
  if (element.intrinsicWidthPx !== width || element.intrinsicHeightPx !== height) {
    // The document's own idea of the image size decides how it is scaled onto
    // the product, so a disagreement here is a placement the customer never saw.
    findings.push(
      finding(
        'DERIVATIVE_METADATA_MISMATCH',
        `${path}.intrinsicWidthPx`,
        'The stored intrinsic dimensions do not match the canonical derivative.',
        { canonicalWidthPx: width, canonicalHeightPx: height },
      ),
    );
    return undefined;
  }
  return record;
}

/** What one Asset costs, and which derivative the document chose for it. */
interface CountedAsset {
  readonly derivativeId: string;
  readonly decodedPixels: number;
}

/**
 * Validates every asset and font reference against caller-supplied authority.
 *
 * Decoded pixels are summed over unique **Assets** (IMP-D044 PO-09), not over
 * derivatives. Placing one logo twenty times costs one decode, and charging it
 * twenty times would refuse documents that are cheap to render.
 *
 * The two are only equivalent while each Asset is referenced through a single
 * derivative — which is why naming one Asset through two different
 * `derivativeId` values is **rejected** rather than resolved. Every way of
 * resolving it silently breaks one of the two G04 rules: counting the first,
 * last, smallest or largest derivative makes the pixel budget depend on element
 * order or on an arbitrary choice, and summing them charges one Asset more than
 * once. The ambiguity is also unanswerable for canonical media identity and for
 * intrinsic-dimension validation, so it is a document defect, not a policy gap.
 */
export function validateDesignDocumentContext(
  document: DesignDocument,
  context: DesignDocumentContext,
): readonly DesignDocumentFinding[] {
  const findings: DesignDocumentFinding[] = [];
  const countedAssets = new Map<string, CountedAsset>();

  for (const [index, element] of document.elements.entries()) {
    const path = `$.elements[${String(index)}]`;

    if (element.type === 'image') {
      const record = checkImage(element, path, context, findings);
      if (record !== undefined) {
        const seen = countedAssets.get(record.assetId);
        if (seen === undefined) {
          countedAssets.set(record.assetId, {
            derivativeId: record.derivativeId,
            decodedPixels: (record.widthPx as number) * (record.heightPx as number),
          });
        } else if (seen.derivativeId !== record.derivativeId) {
          // The path names the *later* element, which is the one that
          // introduced the disagreement.
          findings.push(
            finding(
              'DERIVATIVE_METADATA_MISMATCH',
              `${path}.derivativeId`,
              'This asset is already placed through a different derivative in this design.',
            ),
          );
        }
      }
      continue;
    }

    if (element.type !== 'text') continue;

    const font = findControlledFont(element.fontId);
    if (font === undefined) {
      findings.push(
        finding(
          'UNKNOWN_FONT_ID',
          `${path}.fontId`,
          'This font is not in the controlled registry.',
        ),
      );
      continue;
    }
    if (!supportsVariant(font, element.fontStyle, element.fontWeight)) {
      findings.push(
        finding(
          'UNSUPPORTED_FONT_VARIANT',
          `${path}.fontWeight`,
          'This font does not provide the requested style and weight.',
          { style: element.fontStyle, weight: element.fontWeight },
        ),
      );
    }
  }

  let decodedPixels = 0;
  for (const counted of countedAssets.values()) decodedPixels += counted.decodedPixels;

  const limit = DESIGN_DOCUMENT_LIMITS.maxDecodedPixels;
  if (decodedPixels > limit) {
    findings.push(
      finding(
        'DECODED_PIXEL_LIMIT_EXCEEDED',
        '$.elements',
        `The referenced images decode to ${String(decodedPixels)} pixels; the maximum is ${String(limit)}.`,
        { measure: 'decodedPixels', actual: decodedPixels, limit },
      ),
    );
  }
  return findings;
}
