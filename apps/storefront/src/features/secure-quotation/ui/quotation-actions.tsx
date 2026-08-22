import { SECURE_QUOTATION_COPY as COPY } from '../model/secure-quotation-copy';
import type { QuoteUiState } from '../model/secure-quotation-state';

/**
 * The decision controls (`700:55`, `700:57`, `701:140`, `702:127`).
 *
 * ### Three states have no acceptance control at all
 *
 * `EXPIRED`, `ACCEPTED` and `REJECTED` render **nothing** — not a disabled
 * button, not a greyed one. §13 requires that a lapsed offer offer no
 * acceptance action, and a disabled control is still an action the customer can
 * see, aim at and wonder about. The alert above already says why there is
 * nothing to press. `STALE` is the one refused state that keeps a control,
 * because there the customer *does* have something to do: look at the version
 * that now stands.
 *
 * ### Why the buttons are disabled rather than unmounted while busy
 *
 * `701:88` keeps both buttons in place and greys them, and that is right: the
 * layout must not move under a customer who has just committed to something.
 * The disabled state is belt-and-braces anyway — the controller's synchronous
 * in-flight ref is what actually guarantees one request per activation, since a
 * disabled attribute set during render is too late to stop two clicks in the
 * same tick (§19).
 */
interface QuotationActionsProps {
  readonly uiState: QuoteUiState;
  readonly onAccept: () => void;
  readonly onReject: () => void;
  readonly onViewLatest: () => void;
}

const BUSY: ReadonlySet<QuoteUiState> = new Set<QuoteUiState>([
  'ACCEPTING',
  'REJECTING',
  'RECONCILING',
  'ACCEPT_CONFIRM',
  'REJECT_CONFIRM',
  'STEP_UP',
]);

function acceptLabel(uiState: QuoteUiState): string {
  if (uiState === 'ACCEPTING') return COPY.actions.accepting;
  if (uiState === 'RECONCILING') return COPY.actions.reconciling;
  return COPY.actions.accept;
}

export function QuotationActions({
  uiState,
  onAccept,
  onReject,
  onViewLatest,
}: QuotationActionsProps) {
  if (uiState === 'EXPIRED' || uiState === 'ACCEPTED' || uiState === 'REJECTED') {
    return null;
  }

  if (uiState === 'STALE') {
    return (
      <div className="secure-quotation__actions" aria-label={COPY.actions.heading}>
        <button type="button" className="secure-quotation__button" onClick={onViewLatest}>
          {COPY.actions.viewLatest}
        </button>
      </div>
    );
  }

  const busy = BUSY.has(uiState);
  return (
    <div className="secure-quotation__actions" aria-label={COPY.actions.heading}>
      <button
        type="button"
        className="secure-quotation__button secure-quotation__button--primary"
        onClick={onAccept}
        disabled={busy}
      >
        {acceptLabel(uiState)}
      </button>
      <button
        type="button"
        className="secure-quotation__button secure-quotation__button--danger"
        onClick={onReject}
        disabled={busy}
      >
        {uiState === 'REJECTING' ? COPY.actions.rejecting : COPY.actions.reject}
      </button>
    </div>
  );
}
