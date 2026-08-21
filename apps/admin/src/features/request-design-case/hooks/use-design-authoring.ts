'use client';

/**
 * The in-memory working Design Document (`APP6-A02` §17).
 *
 * ```text
 * exact persisted / submitted DesignDocument
 *   → working copy in browser memory
 *   → Admin edits through the shared P01 document model
 *   → no server mutation while editing
 *   → Save as a new formal DRAFT through APP6-B08
 * ```
 *
 * ### It is browser memory, and only browser memory
 *
 * The working document lives in this hook's `useState`. It is never written to
 * `localStorage`, `sessionStorage` or IndexedDB, never put in a route or query
 * parameter, never logged and never held in module-global state — it is a
 * customer's artwork, delivered behind `no-store`, and persisting it in the
 * browser is the client-side version of the thing that header exists to prevent.
 *
 * ### Opening never mutates history
 *
 * The source document is copied on open. Editing the copy cannot reach the
 * persisted row, because nothing on this path writes: the only exit is
 * `APP6-B08`'s create, which appends a **new** version. A previously persisted
 * DRAFT stays exactly as it was, which is what makes `SUPERSEDED` and
 * `REVISION_REQUESTED` rows still explain how the current version was arrived
 * at.
 *
 * ### The source is exact, never "the latest"
 *
 * `open` takes the document the caller resolved — the submitted source for a
 * first Catalog version, or the exact predecessor's persisted document for a
 * revision. This hook never picks one. Choosing "the newest" or "the current" on
 * the operator's behalf is precisely how a revision would be built from a
 * document the customer never commented on.
 */
import { useCallback, useMemo, useState } from 'react';
import type { DesignDocument, DesignElement } from '@embroidery/design-document';

import {
  appendElement,
  buildTextElement,
  canAddTextElement,
  isSaveableDocument,
  readWorkingDocument,
  removeElement,
  replaceElement,
  withTransform,
} from '../model/design-authoring-document';

/** Where the working document came from, so the create dialog can say so. */
export type AuthoringSourceKind = 'submitted' | 'predecessor';

export interface AuthoringSource {
  readonly kind: AuthoringSourceKind;
  /** The exact predecessor's version number, when there is one. */
  readonly version: number | null;
  /** The predecessor's LC-08 status, for the dialog's source line. */
  readonly status: string | null;
}

export interface AuthoringState {
  readonly open: boolean;
  /** The working copy, or `null` when the surface is closed. */
  readonly document: DesignDocument | null;
  /** The document as first opened, so the operator can discard their edits. */
  readonly source: AuthoringSource | null;
  /** True once the working copy differs from what was opened. */
  readonly dirty: boolean;
  /** Whether P01 would accept the working copy as a new version's body. */
  readonly saveable: boolean;
  readonly selectedElementId: string | null;
  readonly canAddText: boolean;
  readonly openWith: (document: unknown, source: AuthoringSource) => boolean;
  readonly close: () => void;
  readonly reset: () => void;
  readonly selectElement: (elementId: string | null) => void;
  readonly addText: (text: string) => void;
  readonly moveSelected: (patch: { readonly x?: number; readonly y?: number }) => void;
  readonly removeSelected: () => void;
}

interface OpenedDocument {
  readonly original: DesignDocument;
  readonly working: DesignDocument;
  readonly source: AuthoringSource;
}

export function useDesignAuthoring(): AuthoringState {
  const [opened, setOpened] = useState<OpenedDocument | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  /**
   * Opens the surface on an exact document, or refuses.
   *
   * Refusal is `false` rather than a thrown error, and it comes from P01's own
   * structural validator: a document the package would reject is one the create
   * endpoint would reject too, and saying so before the operator edits for ten
   * minutes is the point. Nothing is repaired, migrated or defaulted to make a
   * malformed document openable.
   */
  const openWith = useCallback((document: unknown, source: AuthoringSource): boolean => {
    const parsed = readWorkingDocument(document);
    if (parsed === null) {
      return false;
    }
    setOpened({ original: parsed, working: parsed, source });
    setSelectedElementId(null);
    return true;
  }, []);

  const close = useCallback(() => {
    setOpened(null);
    setSelectedElementId(null);
  }, []);

  /** Discards every edit, back to the exact document that was opened. */
  const reset = useCallback(() => {
    setOpened((current) => (current === null ? null : { ...current, working: current.original }));
    setSelectedElementId(null);
  }, []);

  const mutate = useCallback((update: (document: DesignDocument) => DesignDocument) => {
    setOpened((current) =>
      current === null ? null : { ...current, working: update(current.working) },
    );
  }, []);

  const addText = useCallback((text: string) => {
    setOpened((current) => {
      if (current === null || !canAddTextElement(current.working)) return current;
      const element = buildTextElement(current.working, text);
      return { ...current, working: appendElement(current.working, element) };
    });
  }, []);

  const moveSelected = useCallback(
    (patch: { readonly x?: number; readonly y?: number }) => {
      if (selectedElementId === null) return;
      mutate((document) =>
        replaceElement(document, selectedElementId, (element: DesignElement) =>
          withTransform(element, patch),
        ),
      );
    },
    [mutate, selectedElementId],
  );

  const removeSelected = useCallback(() => {
    if (selectedElementId === null) return;
    mutate((document) => removeElement(document, selectedElementId));
    setSelectedElementId(null);
  }, [mutate, selectedElementId]);

  const working = opened?.working ?? null;

  const saveable = useMemo(() => working !== null && isSaveableDocument(working), [working]);

  return {
    open: opened !== null,
    document: working,
    source: opened?.source ?? null,
    dirty: opened !== null && opened.working !== opened.original,
    saveable,
    selectedElementId,
    canAddText: working !== null && canAddTextElement(working),
    openWith,
    close,
    reset,
    selectElement: setSelectedElementId,
    addText,
    moveSelected,
    removeSelected,
  };
}
