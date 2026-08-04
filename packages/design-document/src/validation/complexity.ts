/**
 * Complexity limits (IMP-D044 PO-09).
 *
 * Two counting rules decide most of this file and both come straight from the
 * ruling. Hidden and locked elements count, because visibility is a display
 * fact and a document that is only legal while something is hidden becomes
 * illegal the moment it is shown. And a repeated Asset reference counts **once**
 * toward the Asset and decoded-pixel budgets but **each time** toward the image
 * element total — the budgets are about how much distinct media must be fetched
 * and decoded, the element total is about how much the editor must draw.
 *
 * Every failure rejects the whole document. Nothing here truncates, drops an
 * element or otherwise edits a document into compliance: a silently shortened
 * design is worse than a refused one, because the customer never learns.
 */
import { DESIGN_DOCUMENT_LIMITS } from '../schema/constants';
import type { DesignDocument } from '../schema/document';
import { finding, type DesignDocumentFinding } from '../findings/finding';

function exceeded(
  measure: string,
  actual: number,
  limit: number,
  message: string,
  path = '$.elements',
): DesignDocumentFinding {
  return finding('COMPLEXITY_LIMIT_EXCEEDED', path, message, { measure, actual, limit });
}

/**
 * Counts and limits everything measurable from the document alone.
 *
 * Decoded pixels are **not** here: that total needs the canonical derivative
 * dimensions, which only the caller's authority can supply, so it lives in
 * contextual validation. Canonical byte size is not here either — it is only
 * meaningful after quantization and canonicalization, and is checked by
 * `validateCanonicalSize`.
 */
export function validateDesignDocumentComplexity(
  document: DesignDocument,
): readonly DesignDocumentFinding[] {
  const findings: DesignDocumentFinding[] = [];
  const limits = DESIGN_DOCUMENT_LIMITS;
  const elements = document.elements;

  if (elements.length > limits.maxElements) {
    findings.push(
      exceeded(
        'elements',
        elements.length,
        limits.maxElements,
        `The document has ${String(elements.length)} elements; the maximum is ${String(limits.maxElements)}.`,
      ),
    );
  }

  let imageElements = 0;
  let textElements = 0;
  let totalTextCharacters = 0;
  const uniqueAssetIds = new Set<string>();

  for (const [index, element] of elements.entries()) {
    switch (element.type) {
      case 'image': {
        imageElements += 1;
        uniqueAssetIds.add(element.assetId);
        break;
      }
      case 'text': {
        textElements += 1;
        // Count code points, not UTF-16 units: a Vietnamese character outside
        // the BMP would otherwise consume two of the customer's 500.
        const characters = [...element.text].length;
        totalTextCharacters += characters;
        if (characters > limits.maxCharactersPerTextElement) {
          findings.push(
            exceeded(
              'charactersPerTextElement',
              characters,
              limits.maxCharactersPerTextElement,
              `A text element holds ${String(characters)} characters; the maximum is ${String(limits.maxCharactersPerTextElement)}.`,
              `$.elements[${String(index)}].text`,
            ),
          );
        }
        break;
      }
      default:
        break;
    }
  }

  for (const [measure, actual, limit, noun] of [
    ['imageElements', imageElements, limits.maxImageElements, 'image elements'],
    ['textElements', textElements, limits.maxTextElements, 'text elements'],
    ['uniqueAssets', uniqueAssetIds.size, limits.maxUniqueAssets, 'referenced assets'],
    [
      'totalTextCharacters',
      totalTextCharacters,
      limits.maxTotalTextCharacters,
      'text characters in total',
    ],
  ] as const) {
    if (actual > limit) {
      findings.push(
        exceeded(
          measure,
          actual,
          limit,
          `The document has ${String(actual)} ${noun}; the maximum is ${String(limit)}.`,
        ),
      );
    }
  }

  return findings;
}

/**
 * The 512 KiB ceiling, measured on canonical UTF-8 bytes.
 *
 * Byte length, not string length: a Vietnamese document is mostly multi-byte,
 * so `canonical.length` would let a customer store roughly twice the ruled
 * limit before anything complained.
 */
export function validateCanonicalSize(byteLength: number): readonly DesignDocumentFinding[] {
  const limit = DESIGN_DOCUMENT_LIMITS.maxCanonicalBytes;
  if (byteLength <= limit) return [];
  return [
    exceeded(
      'canonicalBytes',
      byteLength,
      limit,
      `The canonical document is ${String(byteLength)} bytes; the maximum is ${String(limit)}.`,
      '$',
    ),
  ];
}
