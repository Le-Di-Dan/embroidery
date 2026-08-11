'use client';

/**
 * The text inspector's controller (`APP3-S05`).
 *
 * ## One working document, and one transient field
 *
 * The `APP3-S03` working document stays the only editable truth. What lives here
 * is strictly smaller: the characters currently in the text box while they are
 * still being typed or composed, and the last refusal. Neither is document
 * state, and neither survives a selection change.
 *
 * The distinction matters because of Vietnamese input. A composition in progress
 * is *not* a value the customer has entered — "Việt" passes through "Vieejt" and
 * several other strings that are neither what they typed nor what they meant.
 * Committing those would write half-formed text into the document and, through
 * `APP3-S10` later, into a saved design. So the field holds them and the document
 * does not, until `compositionend`.
 *
 * ## The draft can never cross a selection
 *
 * A stale draft committed against a different element is the failure this hook is
 * shaped to make impossible: the bound id is state, and a mismatch resets the
 * draft during render — before any handler can fire — rather than in an effect
 * that runs after the first keystroke of the next element.
 */
import { useCallback, useState } from 'react';

import type { DesignDocument } from '@embroidery/design-document';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';

import { ruleOnTextCandidate, type TextRefusal } from '../model/studio-text-authority';
import { withTextFields, type TextFieldPatch } from '../model/studio-text-fields';
import type { StudioAreaLimits } from '../model/studio-transform-authority';

export interface UseStudioTextInput {
  readonly document: DesignDocument | null;
  readonly elementId: string | null;
  readonly scope: DesignSessionScopeResponse | null;
  readonly limits: StudioAreaLimits | null;
  readonly commit: (document: DesignDocument) => void;
}

export interface UseStudioTextResult {
  /**
   * What the text box shows: the transient draft while one exists, otherwise
   * `null`, meaning "show the document's own value".
   */
  readonly draft: string | null;
  readonly refusal: TextRefusal | null;
  readonly composing: boolean;
  /** A keystroke or an IME frame. Never reaches the document on its own. */
  readonly changeText: (value: string) => void;
  readonly startComposition: () => void;
  /** A completed composition or a blur: the point a candidate may be ruled on. */
  readonly finishText: (value: string) => void;
  /** A discrete control — font, style, weight, size, alignment. */
  readonly applyPatch: (patch: TextFieldPatch) => void;
}

export function useStudioText({
  document,
  elementId,
  scope,
  limits,
  commit,
}: UseStudioTextInput): UseStudioTextResult {
  const [bound, setBound] = useState<string | null>(elementId);
  const [draft, setDraft] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [refusal, setRefusal] = useState<TextRefusal | null>(null);

  // Rebinding to a new selection, during render. React's sanctioned way to
  // adjust state when an input changes, and the only placement that guarantees
  // no handler can commit the previous element's draft against this one.
  if (bound !== elementId) {
    setBound(elementId);
    setDraft(null);
    setComposing(false);
    setRefusal(null);
  }

  const rule = useCallback(
    (patch: TextFieldPatch): boolean => {
      if (document === null || elementId === null || scope === null) return false;
      const outcome = ruleOnTextCandidate(
        withTextFields(document, elementId, patch),
        elementId,
        scope,
        limits,
      );
      if (!outcome.ok) {
        setRefusal(outcome.refusal);
        return false;
      }
      setRefusal(null);
      commit(outcome.document);
      return true;
    },
    [commit, document, elementId, limits, scope],
  );

  const changeText = useCallback(
    (value: string) => {
      setDraft(value);
      // While an IME is composing, the value is held and never ruled on: a
      // partial composition is not something the customer entered, and
      // committing one would write "Vieejt" into the design on the way to
      // "Việt". Outside a composition every keystroke is a completed value, so
      // it is ruled on immediately and the stage stays in step with the field.
      if (!composing && rule({ text: value })) setDraft(null);
    },
    [composing, rule],
  );

  const startComposition = useCallback(() => {
    setComposing(true);
  }, []);

  const finishText = useCallback(
    (value: string) => {
      setComposing(false);
      setDraft(value);
      // A committed value needs no draft: the document becomes the field's
      // source again. A refused one keeps it, so the customer can correct what
      // they actually typed rather than watching it revert.
      if (rule({ text: value })) setDraft(null);
    },
    [rule],
  );

  const applyPatch = useCallback(
    (patch: TextFieldPatch) => {
      rule(patch);
    },
    [rule],
  );

  return { draft, refusal, composing, changeText, startComposition, finishText, applyPatch };
}
