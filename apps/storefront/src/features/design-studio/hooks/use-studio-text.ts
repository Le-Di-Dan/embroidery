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
import { useCallback, useEffect, useRef, useState } from 'react';

import type { DesignDocument, TextElement } from '@embroidery/design-document';
import type { DesignSessionScopeResponse } from '@embroidery/api-client';

import {
  loadControlledVariant,
  variantShorthand,
  type ControlledFontVariant,
} from '../model/studio-font-variant';
import type { StudioHistoryAction } from '../model/studio-history';
import { layerLabel } from '../model/studio-layers';
import { ruleOnTextCandidate, type TextRefusal } from '../model/studio-text-authority';
import { textElementOf, withTextFields, type TextFieldPatch } from '../model/studio-text-fields';
import type { StudioAreaLimits } from '../model/studio-transform-authority';
import { useStudioDocumentStore } from '../store/studio-document.store';

export interface UseStudioTextInput {
  readonly document: DesignDocument | null;
  readonly elementId: string | null;
  readonly scope: DesignSessionScopeResponse | null;
  readonly limits: StudioAreaLimits | null;
  readonly commit: (document: DesignDocument, action: StudioHistoryAction) => void;
}

export interface UseStudioTextResult {
  /**
   * What the text box shows: the transient draft while one exists, otherwise
   * `null`, meaning "show the document's own value".
   */
  readonly draft: string | null;
  readonly refusal: TextRefusal | null;
  readonly composing: boolean;
  /**
   * A controlled variant is being fetched for a change the customer asked for
   * and the document has not accepted yet (`APP3-S05-C1`).
   */
  readonly pendingVariant: boolean;
  /** A keystroke or an IME frame. Never reaches the document on its own. */
  readonly changeText: (value: string) => void;
  readonly startComposition: () => void;
  /** A completed composition or a blur: the point a candidate may be ruled on. */
  readonly finishText: (value: string) => void;
  /** A discrete control — font, style, weight, size, alignment. */
  readonly applyPatch: (patch: TextFieldPatch) => void;
  /**
   * The caret entered the text box: the start of one edit session (`APP3-S08`).
   *
   * Everything typed until it leaves is one thing the customer did, so the
   * keystrokes and IME frames between these two calls append no history and the
   * boundary appends one entry.
   */
  readonly beginEdit: () => void;
  /** The caret left it, or the selection changed. The session's other end. */
  readonly endEdit: () => void;
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
  const [pendingVariant, setPendingVariant] = useState(false);
  const beginAction = useStudioDocumentStore((state) => state.beginAction);
  const endAction = useStudioDocumentStore((state) => state.endAction);

  /**
   * The identity of the newest font-variant request (`APP3-S05-C1`).
   *
   * A font load is the one thing here that finishes *later*, so it is the one
   * thing that can land in a world that has moved on: a slow italic answering
   * after the customer chose upright, or after they selected a different
   * element. Every request carries the counter's value at the moment it started
   * and writes nothing unless it is still the newest — the bounded, allocation-
   * free form of cancellation. Nothing about it is stored in Zustand; it is not
   * state anyone outside this hook can observe.
   */
  const request = useRef(0);

  // Rebinding to a new selection, during render. React's sanctioned way to
  // adjust state when an input changes, and the only placement that guarantees
  // no handler can commit the previous element's draft against this one.
  if (bound !== elementId) {
    setBound(elementId);
    setDraft(null);
    setComposing(false);
    setRefusal(null);
    setPendingVariant(false);
    // The same reset for the request in flight: a variant fetched for the
    // element the customer just left must not apply to the one they arrived at.
    request.current += 1;
  }

  const rule = useCallback(
    (patch: TextFieldPatch, kind: 'text-edit' | 'text-format'): boolean => {
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
      // A `text-edit` lands inside the open session and appends nothing; a
      // `text-format` is a discrete control and is one entry on its own.
      const element = textElementOf(document, elementId);
      commit(outcome.document, {
        kind,
        label: element === undefined ? null : layerLabel(element),
      });
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
      if (!composing && rule({ text: value }, 'text-edit')) setDraft(null);
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
      if (rule({ text: value }, 'text-edit')) setDraft(null);
    },
    [rule],
  );

  /**
   * The newest `rule`, for the one caller that resumes after an `await`.
   *
   * A `useCallback` closes over the document it was built with. Everything else
   * here runs synchronously inside the handler, so the closure is current; a
   * font request is not, and committing through a stale one would resurrect the
   * document as it was when the customer opened the picker.
   */
  const ruleRef = useRef(rule);
  useEffect(() => {
    ruleRef.current = rule;
  }, [rule]);

  const applyPatch = useCallback(
    (patch: TextFieldPatch) => {
      const variant = requestedVariant(textElementOf(document, elementId), patch);
      // Not a font change, or a face the registry does not control at all — the
      // second belongs to `APP3-P01`, which has an exact sentence for it that a
      // browser probe would replace with the wrong one.
      if (variant === null) {
        rule(patch, 'text-format');
        return;
      }

      /*
       * A requested variant becomes document truth only once the browser has
       * proved it can paint that exact face (`APP3-S05-C1`). Until then the
       * document keeps the variant it already had — so a failed italic leaves
       * an upright design rather than a synthesised slant that looks like a
       * successful choice.
       */
      const started = (request.current += 1);
      setPendingVariant(true);
      void loadControlledVariant(variant).then((available) => {
        if (started !== request.current) return;
        setPendingVariant(false);
        if (!available) {
          setRefusal('controlled-font-unavailable');
          return;
        }
        ruleRef.current(patch, 'text-format');
      });
    },
    [document, elementId, rule],
  );

  /*
   * The edit session's two ends (`APP3-S08` §11).
   *
   * A deterministic boundary rather than a debounce timer: the session opens
   * when the caret enters the text box and closes when it leaves or when the
   * selection changes, so what becomes one history entry is what the customer
   * would describe as one edit — not whatever happened to fall inside an
   * arbitrary interval. An IME composition cannot straddle it, because a
   * composition happens entirely inside a focused field.
   */
  const beginEdit = useCallback(() => {
    const element = textElementOf(document, elementId);
    beginAction({ kind: 'text-edit', label: element === undefined ? null : layerLabel(element) });
  }, [beginAction, document, elementId]);

  // Leaving the element is a boundary as much as leaving the field is: a session
  // left open across a selection change would fold the next element's first edit
  // into this element's entry.
  useEffect(() => endAction, [elementId, endAction]);

  return {
    draft,
    refusal,
    composing,
    pendingVariant,
    changeText,
    startComposition,
    finishText,
    applyPatch,
    beginEdit,
    endEdit: endAction,
  };
}

/**
 * The exact controlled face a patch is asking for, or `null` when the browser
 * has nothing to be asked.
 *
 * The unchanged fields come from the element, because a variant is the triple —
 * choosing italic on a 700 element requests italic 700, not italic 400.
 */
function requestedVariant(
  element: TextElement | undefined,
  patch: TextFieldPatch,
): ControlledFontVariant | null {
  if (element === undefined) return null;
  if (patch.fontId === undefined && patch.fontStyle === undefined && patch.fontWeight === undefined)
    return null;

  const variant: ControlledFontVariant = {
    fontId: patch.fontId ?? element.fontId,
    fontStyle: patch.fontStyle ?? element.fontStyle,
    fontWeight: patch.fontWeight ?? element.fontWeight,
  };
  return variantShorthand(variant) === undefined ? null : variant;
}
