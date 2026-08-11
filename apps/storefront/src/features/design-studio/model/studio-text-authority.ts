/**
 * Ruling on a candidate text edit (`APP3-S05`).
 *
 * `APP3-S03` already established the shape of this: a candidate is either
 * committed exactly as computed or not committed at all, and a refusal is stated
 * in text while the working document stays exactly as it legally was. S05
 * changes *what* has to be asked, not that rule.
 *
 * Four authorities, in the one order that makes each answer meaningful:
 *
 * 1. **Structure** (`APP3-P01`) — is this a document at all? Non-NFC text, a
 *    non-integer weight and an out-of-range size are refused here, before
 *    anything tries to measure them.
 * 2. **Complexity** (`APP3-P01`) — the 500-per-element and 5000-total character
 *    ceilings. `APP3-S03`'s transform path never needed this, because a matrix
 *    cannot change a character count; a text edit is the first thing that can.
 * 3. **The controlled registry** (`APP3-P01` fonts) — the picker only offers
 *    registry entries, so a bad `fontId` should be unreachable from the UI. It
 *    is still checked, because "unreachable from today's UI" is not a property
 *    of the document, and a refusal with no copy is a silent failure.
 * 4. **Geometry** (`APP3-P02`, via `APP3-S03`) — quantization, containment and
 *    physical size, asked in `APP3-S03`'s accepted order.
 *
 * Step 4 is expected to be a formality for a text edit, and is asked anyway.
 * `APP3-P02` PO-08 measures a text element from its **declared box** and
 * performs no font measurement, so changing `fontSizePx` or the string does not
 * move the envelope — which is exactly the property `APP3-S05` must not quietly
 * break by measuring glyphs somewhere else. Running the check keeps that a
 * *verified* fact about every commit rather than an assumption, and it is where
 * quantization happens, which the working document needs regardless.
 *
 * It delegates to `ruleOnCandidate` rather than restating it: containment and
 * physical size are `APP3-S03`'s accepted, quantization-ordered rules, and a
 * second copy here would be a second answer to the same question.
 */
import {
  type DesignDocument,
  type DesignDocumentFinding,
  findControlledFont,
  supportsVariant,
  validateDesignDocumentComplexity,
  validateDesignDocumentStructure,
} from '@embroidery/design-document';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';

import {
  ruleOnCandidate,
  type StudioAreaLimits,
  type TransformRefusal,
} from './studio-transform-authority';

/**
 * Why a text candidate was refused.
 *
 * The transform refusals are reused rather than renamed: a text edit that pushes
 * an element out of the embroidery area is the same fact as a drag that does,
 * and a customer reading two different sentences for it would reasonably think
 * they were two different problems.
 */
export type TextRefusal =
  | 'text-too-long'
  | 'document-text-limit'
  | 'invalid-text'
  | 'unknown-font'
  | 'unsupported-variant'
  | 'invalid-value'
  | TransformRefusal;

export type TextOutcome =
  | { readonly ok: true; readonly document: DesignDocument }
  | { readonly ok: false; readonly refusal: TextRefusal };

/**
 * Which refusal a structural failure is, from the findings' paths.
 *
 * Read by path rather than by message, because a message is prose and a path is
 * a contract. A finding path names an array *index*, not an element id, so this
 * cannot be narrowed to the edited element — and it does not need to be: the
 * only field this checkpoint writes is a text field, so a text-shaped finding in
 * a candidate this checkpoint built came from the edit. Anything else means the
 * document was already unreadable, which is a different sentence.
 *
 * The findings themselves never reach the customer.
 */
function structuralRefusal(findings: readonly DesignDocumentFinding[]): TextRefusal {
  if (findings.some((item) => item.path.endsWith('.text'))) return 'invalid-text';
  if (
    findings.some((item) => /\.(fontSizePx|fontWeight|fontId|fontStyle|textAlign)$/.test(item.path))
  ) {
    return 'invalid-value';
  }
  return 'unreadable-candidate';
}

/** Which refusal a complexity failure is, from the finding's own measure. */
function complexityRefusal(findings: readonly DesignDocumentFinding[]): TextRefusal {
  for (const item of findings) {
    const measure = item.meta?.measure;
    if (measure === 'charactersPerTextElement') return 'text-too-long';
    if (measure === 'totalTextCharacters') return 'document-text-limit';
  }
  return 'unreadable-candidate';
}

/**
 * The controlled-font check, for the edited element only.
 *
 * Deliberately not `validateDesignDocumentContext`: that function also rules on
 * image derivatives against authority the Studio does not hold, so calling it
 * here with an empty derivative map would refuse a perfectly valid image the
 * customer never touched. The font half is asked directly, through P01's own
 * registry functions.
 */
function fontRefusal(document: DesignDocument, elementId: string): TextRefusal | null {
  const element = document.elements.find((candidate) => candidate.id === elementId);
  if (element === undefined || element.type !== 'text') return null;

  const font = findControlledFont(element.fontId);
  if (font === undefined) return 'unknown-font';
  if (!supportsVariant(font, element.fontStyle, element.fontWeight)) return 'unsupported-variant';
  return null;
}

/**
 * Rules on a candidate document carrying one changed text element.
 *
 * Nothing is repaired, truncated, normalized or clamped on the way through. A
 * string that is not NFC is refused rather than silently rewritten — quietly
 * changing a customer's text is still changing it, and `ADR-DB1-012` §7 puts the
 * decision at the boundary for exactly that reason.
 */
export function ruleOnTextCandidate(
  candidate: DesignDocument,
  elementId: string,
  scope: DesignSessionScopeResponse,
  limits: StudioAreaLimits | null,
): TextOutcome {
  const structure = validateDesignDocumentStructure(candidate);
  if (!structure.ok) {
    return { ok: false, refusal: structuralRefusal(structure.findings) };
  }

  const complexity = validateDesignDocumentComplexity(structure.value);
  if (complexity.length > 0) {
    return { ok: false, refusal: complexityRefusal(complexity) };
  }

  const font = fontRefusal(structure.value, elementId);
  if (font !== null) return { ok: false, refusal: font };

  const geometry = ruleOnCandidate(candidate, elementId, scope, limits);
  if (!geometry.ok) return { ok: false, refusal: geometry.refusal };
  return { ok: true, document: geometry.document };
}
