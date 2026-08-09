/**
 * Constructing and editing the local Design Document.
 *
 * ## Why an empty document is built here
 *
 * `ENGINEERING_JUDGMENT = A03_EMPTY_DOCUMENT_CONSTRUCTOR`.
 * `@embroidery/design-document` (`APP3-P01`) publishes the type, the schema
 * version and the validator, but no empty-document factory — its only builders
 * live in a test-only `testing/` module that the package deliberately does not
 * export. So this module composes the minimal valid document **from P01's own
 * exported constants** and then hands it straight to P01's own
 * `validateDesignDocumentStructure`. There is no second schema here, no second
 * validator and no second schema-version authority: if P01 would refuse the
 * document, this refuses it too, for the same reasons and with the same
 * findings.
 *
 * ## Why a scope is required to build one at all
 *
 * `DesignPlacementSnapshot` is a **required** member of every `DesignDocument`,
 * and every field in it must be a non-empty id or a positive number. A Template
 * with no placement scope therefore has no representable document — not because
 * this screen forbids one, but because the document model has nowhere to put the
 * absence. The only way around it would be to invent a `productSideId` and an
 * `embroideryAreaId`, which `APP3-A03` §17 forbids outright and which would
 * write a document pointing at geometry that does not exist.
 *
 * The values come from the resolved Product Side, which `ADR-DB1-012` and
 * `IMP-D045` make the sole conversion authority — `pxPerMm` especially is copied
 * from the Side and never recomputed from the width ratio.
 */
import {
  CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
  DESIGN_DOCUMENT_LIMITS,
  INTER_CONTROLLED_FONT,
  validateDesignDocumentStructure,
  type DesignDocument,
  type DesignDocumentResult,
  type DesignElement,
  type DesignElementTransform,
  type TextElement,
} from '@embroidery/design-document';

import type { ResolvedTemplateScope } from './editor-scope';

/**
 * The empty document for a Template that has never been saved.
 *
 * Returned as P01's own result type, so a Side whose canvas is not a positive
 * integer produces the same typed findings a save would have produced — the
 * screen reports that it cannot author, rather than rounding a value the
 * document would then misstate.
 */
export function buildEmptyDocument(
  scope: ResolvedTemplateScope,
): DesignDocumentResult<DesignDocument> {
  return validateDesignDocumentStructure({
    schemaVersion: CURRENT_DESIGN_DOCUMENT_SCHEMA_VERSION,
    placement: {
      productSideId: scope.side.id,
      embroideryAreaId: scope.area.id,
      canvasWidthPx: scope.side.imageWidthPx,
      canvasHeightPx: scope.side.imageHeightPx,
      physicalWidthMm: scope.side.physicalWidthMm,
      physicalHeightMm: scope.side.physicalHeightMm,
      pxPerMm: scope.side.pxPerMm,
    },
    elements: [],
  });
}

/**
 * A fresh element id.
 *
 * Derived from the ids already in the document rather than from
 * `crypto.randomUUID`, which is secure-context-only and would throw on a plain
 * HTTP origin (`APP2-A01`). Ids are opaque strings to `APP3-P01`, so a
 * document-local counter is a valid id and has the useful property of being
 * deterministic — a test asserts on the element it just added instead of reading
 * a UUID back out.
 */
export function nextElementId(document: DesignDocument): string {
  const taken = new Set(document.elements.map((element) => element.id));
  let index = document.elements.length + 1;
  while (taken.has(`element-${String(index)}`)) index += 1;
  return `element-${String(index)}`;
}

/** Whether another element may be added without exceeding P01's own limits. */
export function canAddTextElement(document: DesignDocument): boolean {
  const texts = document.elements.filter((element) => element.type === 'text').length;
  return (
    document.elements.length < DESIGN_DOCUMENT_LIMITS.maxElements &&
    texts < DESIGN_DOCUMENT_LIMITS.maxTextElements
  );
}

/**
 * A new text element, placed at the embroidery area's origin.
 *
 * The font is the controlled registry's, by `fontId` — never a CSS family name.
 * `APP3-F01`/`IMP-D044` PO-10 make the registry the only thing that turns an id
 * into a face, and a document that named a family would be asking a browser to
 * render something the server never approved.
 */
export function buildTextElement(
  document: DesignDocument,
  area: { readonly boundXPx: number; readonly boundYPx: number },
  text: string,
): TextElement {
  return {
    id: nextElementId(document),
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    transform: {
      x: area.boundXPx,
      y: area.boundYPx,
      width: 200,
      height: 48,
      rotationDeg: 0,
      scaleX: 1,
      scaleY: 1,
    },
    text,
    fontId: INTER_CONTROLLED_FONT.fontId,
    fontSizePx: 32,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    fill: '#101010',
  };
}

/** Replaces one element by id, preserving z-order and every other element. */
export function replaceElement(
  document: DesignDocument,
  elementId: string,
  update: (element: DesignElement) => DesignElement,
): DesignDocument {
  return {
    ...document,
    elements: document.elements.map((element) =>
      element.id === elementId ? update(element) : element,
    ),
  };
}

/**
 * Removes an element and prunes it from every group that named it.
 *
 * A group holds child **ids**, so dropping an element without pruning would
 * leave a dangling reference that `validateGroupGraph` rejects — the document
 * would become unsaveable through an edit that looked local.
 */
export function removeElement(document: DesignDocument, elementId: string): DesignDocument {
  return {
    ...document,
    elements: document.elements
      .filter((element) => element.id !== elementId)
      .map((element) =>
        element.type === 'group'
          ? { ...element, childIds: element.childIds.filter((id) => id !== elementId) }
          : element,
      ),
  };
}

/** Appends an element on top of the stack; array order is z-order, bottom first. */
export function appendElement(document: DesignDocument, element: DesignElement): DesignDocument {
  return { ...document, elements: [...document.elements, element] };
}

export function withTransform(
  element: DesignElement,
  patch: Partial<DesignElementTransform>,
): DesignElement {
  return { ...element, transform: { ...element.transform, ...patch } };
}
