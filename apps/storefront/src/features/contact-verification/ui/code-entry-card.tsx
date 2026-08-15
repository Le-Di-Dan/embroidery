'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { VERIFICATION_COPY } from '../model/verification-copy';
import {
  formatRemaining,
  isResendAvailable,
  resendRemainingMs,
  type VerificationChallenge,
} from '../model/verification-state';
import { CodeInput, VERIFICATION_CODE_LENGTH } from './code-input';
import { VerificationAlert } from './verification-alert';

/**
 * Code entry and every state that keeps the customer on it: sent (`623:75`),
 * verifying (`623:108`), mismatch (`625:3`), cooldown (`625:36`) and
 * resent (`625:70`).
 *
 * **The code lives here and dies here.** It is component state, passed up only
 * as an argument to `onSubmit`, and cleared whenever the challenge identity
 * changes — a resend replaces `challenge.challengeId`, and the effect below
 * empties the field the moment it does, so a code typed against a cancelled
 * challenge is never left on screen or resubmitted.
 */
interface CodeEntryCardProps {
  readonly challenge: VerificationChallenge;
  readonly nowMs: number;
  readonly verifying: boolean;
  readonly resending: boolean;
  readonly notice: 'MISMATCH' | 'RESENT' | undefined;
  readonly onSubmit: (code: string) => void;
  readonly onResend: () => void;
}

export function CodeEntryCard({
  challenge,
  nowMs,
  verifying,
  resending,
  notice,
  onSubmit,
  onResend,
}: CodeEntryCardProps) {
  const [code, setCode] = useState('');
  const fieldId = useId();
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const inputRef = useRef<HTMLInputElement | null>(null);

  // A new challenge is a new code. Keyed on the id rather than on a resend
  // event, so any path that replaces the challenge clears the field.
  useEffect(() => {
    setCode('');
  }, [challenge.challengeId]);

  // A mismatch clears the field and returns focus to it, so the customer can
  // retype immediately — `634:151` asks for focus to follow the reading order
  // after a transition.
  useEffect(() => {
    if (notice !== 'MISMATCH') return;
    setCode('');
    inputRef.current?.focus();
  }, [notice]);

  const resendReady = isResendAvailable(challenge, nowMs);
  const remaining = resendRemainingMs(challenge, nowMs);
  const complete = code.length === VERIFICATION_CODE_LENGTH;

  return (
    <form
      className="contact-verification__card"
      onSubmit={(event) => {
        event.preventDefault();
        if (!complete || verifying) return;
        onSubmit(code);
        // The value leaves as an argument; the field does not keep it while the
        // request is in flight.
        setCode('');
      }}
      noValidate
    >
      <h2 className="contact-verification__title">{VERIFICATION_COPY.codeEntry.title}</h2>

      {notice === 'RESENT' ? (
        <VerificationAlert
          tone="info"
          title={VERIFICATION_COPY.alerts.resent.title}
          body={VERIFICATION_COPY.alerts.resent.body}
        />
      ) : null}

      <p className="contact-verification__body">{VERIFICATION_COPY.codeEntry.body}</p>
      {/* Rendered from the server's mask, never from the contact typed. */}
      <p className="contact-verification__destination">{challenge.recipientMasked}</p>

      <CodeInput
        value={code}
        onChange={setCode}
        disabled={verifying}
        invalid={notice === 'MISMATCH'}
        describedBy={notice === 'MISMATCH' ? errorId : helpId}
        inputRef={inputRef}
      />
      {notice === 'MISMATCH' ? (
        <p id={errorId} className="contact-verification__error" role="alert">
          {VERIFICATION_COPY.alerts.mismatch}
        </p>
      ) : (
        <p id={helpId} className="contact-verification__help">
          {VERIFICATION_COPY.codeEntry.help}
        </p>
      )}

      <button
        className="contact-verification__submit"
        type="submit"
        disabled={verifying || !complete}
      >
        {verifying ? VERIFICATION_COPY.codeEntry.submitting : VERIFICATION_COPY.codeEntry.submit}
      </button>

      <p className="contact-verification__resend">
        <button
          className="contact-verification__resend-action"
          type="button"
          // Semantically disabled, not merely styled: `634:147` distinguishes a
          // control that is busy from one that is unavailable, and a screen
          // reader must be told which.
          disabled={!resendReady || resending || verifying}
          onClick={onResend}
        >
          {resending ? VERIFICATION_COPY.resend.sending : VERIFICATION_COPY.resend.action}
        </button>
        {resendReady ? null : (
          <span className="contact-verification__resend-note">
            {VERIFICATION_COPY.resend.cooldown(formatRemaining(remaining))}
          </span>
        )}
      </p>
    </form>
  );
}
