/**
 * Editing the in-browser working Design Document (`APP6-A02` §17).
 *
 * ## Why this is A02-local rather than a reuse of the APP3 editor
 *
 * `ENGINEERING_JUDGMENT = A02_LOCAL_DOCUMENT_EDITING`. The APP3 Admin Template
 * editor has an equivalent module, and its element helpers would have suited —
 * but reaching them means a deep import into another bounded product feature,
 * which `APP6-A02` §17 forbids outright, and hoisting them to a shared location
 * changes source `APP3-A03` owns and would put its whole editor suite back in
 * this checkpoint's validation set for a refactor that changes no behaviour.
 *
 * So this composes over the **same public API** instead: every type, limit,
 * font and validator below comes from `@embroidery/design-document`, the package
 * that owns them. There is no second schema here, no second validator, no second
 * schema-version authority and no second rendering model. If `APP3-P01` would
 * refuse a document, this refuses it too, for the same reasons and with the same
 * findings.
 *
 * ## The working document is never persisted history
 *
 * There is no update-version API and there is deliberately no attempt to invent
 * one. A working document lives in browser memory, is derived from an exact
 * persisted document, and leaves only as the body of a **new DRAFT**
 * (`APP6-B08`). A persisted version is never mutated — not here, not anywhere on
 * this screen.
 *
 * It is also never written to `localStorage`, `sessionStorage` or IndexedDB, and
 * never logged: it is a customer's artwork, and the responses that carry it are
 * `no-store`.
 *
 * ## This is not machine digitizing
 *
 * Nothing here produces a DST or PES file, counts a stitch, simulates thread or
 * emits a production specification. `APP6` creates none of those, and a module
 * that gestured at them would promise a capability the system does not have.
 */
import {
  DESIGN_DOCUMENT_LIMITS,
  INTER_CONTROLLED_FONT,
  validateDesignDocumentStructure,
  type DesignDocument,
  type DesignElement,
  type DesignElementTransform,
  type TextElement,
} from '@embroidery/design-document';

/**
 * Reads an unknown persisted document into a `DesignDocument`, or reports why not.
 *
 * The server returns the stored value verbatim — unmigrated and unrewritten — so
 * a v1 Catalog document and a v2 customer-owned one both arrive here as they
 * were saved. `validateDesignDocumentStructure` is P01's own acceptance
 * authority and is the only thing that decides: a document this refuses is one
 * the create endpoint would refuse too, and saying so before the operator edits
 * for ten minutes is the point.
 */
export function readWorkingDocument(document: unknown): DesignDocument | null {
  const result = validateDesignDocumentStructure(document);
  return result.ok ? result.value : null;
}

/**
 * A fresh element id.
 *
 * Derived from the ids already in the document rather than from
 * `crypto.randomUUID`, which is secure-context-only and throws on a plain HTTP
 * origin — the trap `APP2-A01` and `APP5-E01` both recorded. Ids are opaque
 * strings to `APP3-P01`, so a document-local counter is a valid id and has the
 * useful property of being deterministic.
 */
export function nextElementId(document: DesignDocument): string {
  const taken = new Set(document.elements.map((element) => element.id));
  let index = document.elements.length + 1;
  while (taken.has(`element-${String(index)}`)) index += 1;
  return `element-${String(index)}`;
}

/** Whether another text element may be added without exceeding P01's own limits. */
export function canAddTextElement(document: DesignDocument): boolean {
  const texts = document.elements.filter((element) => element.type === 'text').length;
  return (
    document.elements.length < DESIGN_DOCUMENT_LIMITS.maxElements &&
    texts < DESIGN_DOCUMENT_LIMITS.maxTextElements
  );
}

/**
 * A new text element, placed at the document canvas origin.
 *
 * The font is the controlled registry's, **by `fontId`** — never a CSS family
 * name. `APP3-F01`/`IMP-D044` PO-10 make the registry the only thing that turns
 * an id into a face, and a document naming a family would be asking a browser to
 * render something the server never approved.
 */
export function buildTextElement(document: DesignDocument, text: string): TextElement {
  return {
    id: nextElementId(document),
    type: 'text',
    visible: true,
    locked: false,
    opacity: 1,
    transform: {
      x: 0,
      y: 0,
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

/** Appends an element on top of the stack; array order is z-order, bottom first. */
export function appendElement(document: DesignDocument, element: DesignElement): DesignDocument {
  return { ...document, elements: [...document.elements, element] };
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
 * leave a dangling reference the group-graph validator rejects — the document
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

export function withTransform(
  element: DesignElement,
  patch: Partial<DesignElementTransform>,
): DesignElement {
  return { ...element, transform: { ...element.transform, ...patch } };
}

/**
 * Whether the working document would be accepted as a new version's body.
 *
 * P01's structural validator again, run on the edited copy. The screen uses this
 * to disable the save control rather than to *decide* acceptance: the create
 * endpoint validates, quantizes and canonicalizes the document inside its own
 * write transaction, and that remains the authority.
 */
export function isSaveableDocument(document: DesignDocument): boolean {
  return validateDesignDocumentStructure(document).ok;
}
