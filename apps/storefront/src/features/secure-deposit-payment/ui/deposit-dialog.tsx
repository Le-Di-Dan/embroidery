'use client';

import { type ReactNode } from 'react';

import { ModalFrame } from '../../../shared/dialog/modal-frame';

/**
 * The deposit payment surface's modal frame (`APP7-S01`).
 *
 * The accessibility and focus contract — `role="dialog"`, `aria-modal`, an
 * accessible name from its own heading, initial focus on that heading, Escape,
 * a Tab cycle that cannot wander into the page behind the scrim, focus returned
 * to the opener, and a scrim that is deliberately **not** a dismiss target — is
 * `ModalFrame`'s, promoted to `shared/dialog` by `APP12-H01` (FU-APP12-S03-03)
 * from the five byte-identical copies the secure screens each carried.
 *
 * What stays here is what is actually this feature's: the component name its own
 * screens import, and the `secure-deposit` block its approved stylesheet is
 * written against. The frame renders no copy and decides nothing about what the
 * dialog is for, so the domain — the challenge, the mutation, the outcomes and
 * every word on screen — is untouched and still lives in this feature.
 */
interface DepositDialogProps {
  readonly title: string;
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

export function DepositDialog({ title, onDismiss, children }: DepositDialogProps) {
  return (
    <ModalFrame
      title={title}
      onDismiss={onDismiss}
      scrimClassName="secure-deposit__scrim"
      dialogClassName="secure-deposit__dialog"
      titleClassName="secure-deposit__dialog-title"
    >
      {children}
    </ModalFrame>
  );
}
