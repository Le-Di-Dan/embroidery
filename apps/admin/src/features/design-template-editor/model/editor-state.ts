/**
 * The editor's local state, as one deterministic reducer.
 *
 * Everything the operator has not sent anywhere lives here, and nothing here
 * lives in the query cache: a background refetch that replaced an unsaved draft
 * with the server's copy would look like a cache update and behave like data
 * loss.
 *
 * ## The states are kept apart on purpose
 *
 * `dirty`, `saving`, `conflicted` and `saveError` are four independent facts,
 * not four values of one enum, because they genuinely co-occur — a conflicted
 * draft is still dirty, and a failed save leaves both set. Collapsing them is
 * how an editor ends up reporting "saved" for a draft the server refused.
 *
 * `conflicted` is separate from `conflictDialogOpen` for the same reason.
 * Dismissing a dialog is a statement about a dialog; it is not a statement about
 * the version the draft is based on. Closing it must never make the editor look
 * saved, so the banner and the disabled save button outlive the dialog.
 *
 * ## Baseline versus working copy
 *
 * `baselineDocument` is what the server holds, `document` is what the operator
 * is editing, and `dirty` is a stored fact rather than a deep comparison of the
 * two — comparing would call an edit-and-undo "clean" and, more importantly,
 * would have to walk the whole document on every keystroke.
 *
 * Nothing here mutates a document in place. Every action returns a fresh object
 * graph, so the query cache's copy of the server's document can be handed in as
 * a baseline without the editor ever writing through to it.
 */
import type { DesignDocument, DesignElement } from '@embroidery/design-document';

import { appendElement, removeElement, replaceElement, withTransform } from './editor-document';
import type { SaveFailure } from './editor-failure';

export interface EditorState {
  /** Exactly what the next save must send as `expectedCurrentVersion`. */
  readonly baselineVersion: number;
  readonly baselineDocument: DesignDocument;
  readonly document: DesignDocument;
  readonly selectedElementId: string | null;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly conflicted: boolean;
  readonly conflictDialogOpen: boolean;
  readonly saveError: SaveFailure | null;
  /** The version the last successful save produced; drives the announcement. */
  readonly lastSavedVersion: number | null;
}

/** The chip. `conflict` is a state of its own, never a flavour of error. */
export type SaveChip = 'saved' | 'unsaved' | 'saving' | 'conflict';

export type EditorAction =
  | {
      readonly type: 'RESET_FROM_SERVER';
      readonly version: number;
      readonly document: DesignDocument;
    }
  | { readonly type: 'SELECT_ELEMENT'; readonly elementId: string }
  | { readonly type: 'CLEAR_SELECTION' }
  | { readonly type: 'ADD_ELEMENT'; readonly element: DesignElement }
  | { readonly type: 'REMOVE_ELEMENT'; readonly elementId: string }
  | {
      readonly type: 'UPDATE_TEXT';
      readonly elementId: string;
      readonly patch: Partial<
        Omit<Extract<DesignElement, { type: 'text' }>, 'id' | 'type' | 'transform'>
      >;
    }
  | {
      readonly type: 'UPDATE_TRANSFORM';
      readonly elementId: string;
      readonly patch: Partial<DesignElement['transform']>;
    }
  | { readonly type: 'MARK_SAVING' }
  | { readonly type: 'SAVE_SUCCESS'; readonly version: number; readonly document: DesignDocument }
  | { readonly type: 'SAVE_FAILURE'; readonly failure: SaveFailure }
  | { readonly type: 'STALE_CONFLICT' }
  | { readonly type: 'KEEP_LOCAL_DRAFT' };

export function initialEditorState(version: number, document: DesignDocument): EditorState {
  return {
    baselineVersion: version,
    baselineDocument: document,
    document,
    selectedElementId: null,
    dirty: false,
    saving: false,
    conflicted: false,
    conflictDialogOpen: false,
    saveError: null,
    lastSavedVersion: null,
  };
}

/** An edit keeps the selection but always marks the draft dirty and un-errored. */
function edited(state: EditorState, document: DesignDocument): EditorState {
  return { ...state, document, dirty: true, saveError: null };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'RESET_FROM_SERVER':
    case 'SAVE_SUCCESS': {
      // Both replace the working copy with the server's canonical document.
      // The returned document is not the one that was sent — quantization moves
      // values — so the local copy is *replaced*, never assumed equal.
      const stillPresent = action.document.elements.some(
        (element) => element.id === state.selectedElementId,
      );
      return {
        ...state,
        baselineVersion: action.version,
        baselineDocument: action.document,
        document: action.document,
        selectedElementId: stillPresent ? state.selectedElementId : null,
        dirty: false,
        saving: false,
        conflicted: false,
        conflictDialogOpen: false,
        saveError: null,
        lastSavedVersion: action.type === 'SAVE_SUCCESS' ? action.version : state.lastSavedVersion,
      };
    }

    case 'SELECT_ELEMENT':
      return { ...state, selectedElementId: action.elementId };

    case 'CLEAR_SELECTION':
      return { ...state, selectedElementId: null };

    case 'ADD_ELEMENT':
      return {
        ...edited(state, appendElement(state.document, action.element)),
        selectedElementId: action.element.id,
      };

    case 'REMOVE_ELEMENT':
      return {
        ...edited(state, removeElement(state.document, action.elementId)),
        selectedElementId:
          state.selectedElementId === action.elementId ? null : state.selectedElementId,
      };

    case 'UPDATE_TEXT':
      return edited(
        state,
        replaceElement(state.document, action.elementId, (element) =>
          element.type === 'text' ? { ...element, ...action.patch } : element,
        ),
      );

    case 'UPDATE_TRANSFORM':
      return edited(
        state,
        replaceElement(state.document, action.elementId, (element) =>
          withTransform(element, action.patch),
        ),
      );

    case 'MARK_SAVING':
      return { ...state, saving: true, saveError: null };

    case 'SAVE_FAILURE':
      // The draft survives every ordinary failure. `dirty` is untouched, which
      // is what keeps the unsaved-navigation guard armed after a failed save.
      return { ...state, saving: false, saveError: action.failure };

    case 'STALE_CONFLICT':
      // The server wrote nothing, so the baseline is still whatever it was and
      // the draft is still dirty. Only the conflict flags change.
      return {
        ...state,
        saving: false,
        conflicted: true,
        conflictDialogOpen: true,
        saveError: 'stale-version',
      };

    case 'KEEP_LOCAL_DRAFT':
      // Closes the dialog and *only* the dialog.
      return { ...state, conflictDialogOpen: false };

    default:
      return state;
  }
}

export function saveChip(state: EditorState): SaveChip {
  if (state.saving) return 'saving';
  if (state.conflicted) return 'conflict';
  return state.dirty ? 'unsaved' : 'saved';
}

/**
 * Whether the save button may act.
 *
 * A conflicted draft can never be saved as it stands: its
 * `expectedCurrentVersion` is known to be behind, so pressing save would
 * re-earn the same `409`. Rebasing is the only way forward, which is why the
 * conflict banner stays visible and the button stays disabled until it happens.
 */
export function canSave(state: EditorState, editable: boolean): boolean {
  return editable && state.dirty && !state.saving && !state.conflicted;
}

export function selectedElement(state: EditorState): DesignElement | null {
  if (state.selectedElementId === null) return null;
  return state.document.elements.find((element) => element.id === state.selectedElementId) ?? null;
}
