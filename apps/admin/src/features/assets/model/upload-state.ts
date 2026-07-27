/**
 * The local upload state machine's vocabulary.
 *
 * `file` appears only in the states that precede an authoritative server
 * result. From `processing` onward the identity is server-backed, because by
 * then B01 has answered and the local filename is no longer the truth about the
 * stored asset.
 */

export type UploadState =
  /** Nothing selected. */
  | { readonly kind: 'idle' }
  /** A valid local file is staged but nothing has been sent. */
  | { readonly kind: 'selected'; readonly file: File }
  /** Bytes are in flight. `percent` is `null` when progress is not measurable. */
  | { readonly kind: 'uploading'; readonly file: File; readonly percent: number | null }
  /** B01 accepted the upload (202); inspection is running. */
  | { readonly kind: 'processing'; readonly assetId: string; readonly title: string }
  /** Inspection accepted the asset. */
  | { readonly kind: 'accepted'; readonly title: string }
  /** Inspection rejected the asset; it stays listed as unusable. */
  | { readonly kind: 'rejected'; readonly title: string }
  /** Reconciliation ended without an interpretable result. */
  | { readonly kind: 'indeterminate'; readonly title: string }
  /** The operator aborted mid-flight; server completion cannot be ruled out. */
  | { readonly kind: 'cancelled'; readonly file: File }
  /** The attempt failed with a safe, already-translated message. */
  | {
      readonly kind: 'failed';
      readonly message: string;
      readonly retryable: boolean;
      readonly file: File | null;
    };

/** True while the transport is active — used to gate cancel and re-submit. */
export function isUploadInFlight(state: UploadState): boolean {
  return state.kind === 'uploading';
}

/** True once the screen should stop showing an upload-specific banner action. */
export function isUploadTerminal(state: UploadState): boolean {
  return state.kind === 'accepted' || state.kind === 'rejected' || state.kind === 'indeterminate';
}
