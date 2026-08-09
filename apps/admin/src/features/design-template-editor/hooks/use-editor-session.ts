'use client';

/**
 * The editor's local session: the reducer, and the one rule about when the
 * server may replace it.
 *
 * The reducer itself is total over a live state; "no session yet" is this
 * hook's concern, not the reducer's, so `editor-state.ts` never has to answer
 * what `UPDATE_TEXT` means before a document exists.
 *
 * **The server replaces the draft exactly twice**: when the editor first opens a
 * Template, and when the operator explicitly asks for the latest version after a
 * conflict. Never on a refetch, never on window focus, never because a cache
 * entry updated. That is the whole reason the draft lives here and not in the
 * query cache — a background refresh that overwrote unsaved work would be
 * indistinguishable from data loss.
 *
 * A change of `templateId` starts a new session, because it is a different
 * Template and carrying a draft across would attach one Template's work to
 * another.
 */
import { useEffect, useReducer } from 'react';
import type { DesignDocument } from '@embroidery/design-document';

import {
  editorReducer,
  initialEditorState,
  type EditorAction,
  type EditorState,
} from '../model/editor-state';

type SessionAction =
  | EditorAction
  | { readonly type: 'INIT'; readonly version: number; readonly document: DesignDocument }
  | { readonly type: 'END' };

function sessionReducer(state: EditorState | null, action: SessionAction): EditorState | null {
  if (action.type === 'INIT') return initialEditorState(action.version, action.document);
  if (action.type === 'END') return null;
  return state === null ? null : editorReducer(state, action);
}

export interface EditorSession {
  readonly state: EditorState | null;
  readonly dispatch: (action: EditorAction) => void;
  readonly reset: (version: number, document: DesignDocument) => void;
}

export interface UseEditorSessionInput {
  readonly templateId: string;
  /** The first authoritative document, or `null` while it is not yet known. */
  readonly initial: { readonly version: number; readonly document: DesignDocument } | null;
}

export function useEditorSession({ templateId, initial }: UseEditorSessionInput): EditorSession {
  const [state, dispatch] = useReducer(sessionReducer, null);

  useEffect(() => {
    // Ends the previous Template's session. The effect below then opens the new
    // one once its document is known, so there is never a moment where one
    // Template's draft is displayed under another Template's name.
    dispatch({ type: 'END' });
  }, [templateId]);

  const started = state !== null;
  useEffect(() => {
    if (started || initial === null) return;
    dispatch({ type: 'INIT', version: initial.version, document: initial.document });
  }, [started, initial]);

  return {
    state,
    dispatch,
    reset: (version, document) => {
      dispatch({ type: 'RESET_FROM_SERVER', version, document });
    },
  };
}
