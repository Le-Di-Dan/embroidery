/**
 * The Admin status pill, as `APP7-D01` draws it (`732:3`, `734:3`, `740:3`,
 * `743:35`) and as `753:120` requires it.
 *
 * ### Colour is never the message
 *
 * Every badge renders a symbol **and** a text label; the tone only tints the
 * border and the text. An operator who cannot distinguish the tints still reads
 * "Chờ đặt cọc", and a screen reader announces the label rather than a colour.
 * The symbol vocabulary is the one `753:120` fixes for the whole phase:
 * `○` not started · `◷` waiting · `◐` being reconciled · `✓` succeeded ·
 * `✕` invalid or ended.
 *
 * ### One colour system, not a second one
 *
 * The tints are the same `Color/Status/*` tokens the existing Admin badges use
 * (`custom-request-status`, `design-template-status`), so this adds a shared
 * component rather than a rival palette. It lives in Admin shared scope because
 * two features need it — the order queue and the order detail — which is the
 * narrowest scope that serves both (CLAUDE.md §5). It is deliberately *not*
 * pushed into `@embroidery/ui`: nothing on the storefront renders an Admin
 * status.
 *
 * ### It presents, it does not decide
 *
 * The tone, symbol and label are computed by the caller's presentation module
 * from a contract value. This component cannot decide that an unrecognised
 * status is a known one — it renders what it was handed, and `data-status`
 * carries the stored token for tests and styling.
 */

/** The five tints, each backed by an existing Admin status token. */
export type AdminStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export interface AdminStatusBadgeProps {
  /** The stored contract value, or `UNKNOWN` when this build has no label. */
  readonly token: string;
  readonly label: string;
  readonly tone: AdminStatusTone;
  /** The `753:120` symbol. Rendered `aria-hidden`: the label carries the meaning. */
  readonly symbol: string;
  readonly testId?: string;
}

export function AdminStatusBadge({ token, label, tone, symbol, testId }: AdminStatusBadgeProps) {
  return (
    <span
      className={`admin-status admin-status--${tone}`}
      data-status={token}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
    >
      <span className="admin-status__symbol" aria-hidden="true">
        {symbol}
      </span>
      <span className="admin-status__label">{label}</span>
    </span>
  );
}
