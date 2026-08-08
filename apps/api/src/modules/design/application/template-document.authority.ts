/**
 * What a Design Template draft save is allowed to persist (`APP3-B03A` §7/§8).
 *
 * `APP3-P01` owns structure, schema version, complexity, quantization,
 * canonicalization and contextual media. This composes them in the order their
 * own contracts require and turns any finding into one safe refusal. Nothing is
 * re-implemented, and there is no second Design Document validator.
 *
 * **`APP3-P02` is deliberately not here**, and that is the difference between
 * this and `DesignDocumentAuthority.validateForSave`, which a Session save uses.
 * Two reasons, and the second is the binding one:
 *
 * - A draft may legitimately hold **no scope at all** (`IMP-D042` PO-06 lets one
 *   be authored incomplete), so there is frequently no Side and no Area to
 *   validate a placement snapshot against.
 * - Placement agreement and containment are the publication guard `GRD-T01`,
 *   which `IMP-D042` PO-07 assigns to `APP3-B04` — *"no backend checkpoint may
 *   implement a reduced publish guard"* cuts both ways: implementing part of it
 *   here would be a second, weaker definition of publishable.
 *
 * So a draft may be saved out of bounds. That is the point of a draft, and
 * `APP3-B04` refuses to publish it.
 */
import { Injectable } from '@nestjs/common';
import {
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  prepareDesignDocument,
  readSchemaVersion,
  validateDesignDocumentContext,
  type DesignDocument,
  type DesignDocumentContext,
} from '@embroidery/design-document';

import { rejectionForFindings, type DocumentRejection } from './design-document.authority';

export type TemplateDocumentOutcome =
  | { readonly ok: true; readonly document: DesignDocument; readonly schemaVersion: number }
  | { readonly ok: false; readonly rejection: DocumentRejection };

@Injectable()
export class TemplateDocumentAuthority {
  /**
   * Validates and canonicalizes one candidate draft document.
   *
   * The returned document is what must be persisted — never the caller's object.
   * `prepareDesignDocument` quantizes, and quantization can move a value across
   * a schema boundary, which is why it revalidates the quantized result rather
   * than the input.
   */
  validateForSave(candidate: unknown, context: DesignDocumentContext): TemplateDocumentOutcome {
    const version = readSchemaVersion(candidate);
    if (!version.ok || version.value !== CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION) {
      return { ok: false, rejection: 'DOCUMENT_SCHEMA_UNSUPPORTED' };
    }

    const prepared = prepareDesignDocument(candidate);
    if (!prepared.ok) {
      return { ok: false, rejection: rejectionForFindings(prepared.findings) };
    }
    const document = prepared.value.document;

    if (validateDesignDocumentContext(document, context).length > 0) {
      return { ok: false, rejection: 'DOCUMENT_MEDIA_INELIGIBLE' };
    }

    return { ok: true, document, schemaVersion: version.value };
  }
}
