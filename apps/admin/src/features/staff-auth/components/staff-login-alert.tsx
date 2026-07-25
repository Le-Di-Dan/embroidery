'use client';

import { type Ref } from 'react';

import { type StaffLoginAlertTone } from '../model/staff-login-display';

interface StaffLoginAlertProps {
  tone: StaffLoginAlertTone;
  message: string;
  rootRef?: Ref<HTMLDivElement>;
}

const TONE_ICON: Record<StaffLoginAlertTone, string> = {
  error: '⚠',
  warning: '⏳',
};

/**
 * Form-level status message (authentication failure, rate limit, network
 * fallback). `role="alert"` announces it once; it is focusable (`tabIndex=-1`)
 * so focus can move here when the submit button is disabled. Tone drives colour
 * and icon; meaning never depends on colour alone.
 */
export function StaffLoginAlert({ tone, message, rootRef }: StaffLoginAlertProps) {
  return (
    <div
      ref={rootRef}
      className={`staff-login-alert staff-login-alert--${tone}`}
      role="alert"
      tabIndex={-1}
    >
      <span className="staff-login-alert__icon" aria-hidden="true">
        {TONE_ICON[tone]}
      </span>
      <p className="staff-login-alert__message">{message}</p>
    </div>
  );
}
