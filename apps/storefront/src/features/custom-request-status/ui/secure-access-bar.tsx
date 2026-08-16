import { ResponsiveText } from '../../../components/responsive-text';
import {
  CUSTOM_REQUEST_STATUS_COPY as COPY,
  fillResponsive,
} from '../model/custom-request-status-copy';

/**
 * The strip above the request (`661:6` desktop, `661:355` mobile).
 *
 * It says two things and no more: that this page was reached through a personal
 * secure link, and when that link stops working. The expiry is absolute and is
 * not extended by reading, so it is safe to state plainly.
 *
 * The approved frames also print a masked contact beside the title. `APP5-B03`
 * publishes no contact, and this checkpoint may not make a second authorized
 * read to obtain one; the title is therefore rendered without it rather than
 * with a value the page would have to invent.
 */
export function SecureAccessBar({ accessExpiresAt }: { accessExpiresAt: string }) {
  return (
    <div className="request-status__access-bar">
      <p className="request-status__access-title">{COPY.accessBar.title}</p>
      <p className="request-status__access-expiry">
        <ResponsiveText copy={fillResponsive(COPY.accessBar.expiry, '{date}', accessExpiresAt)} />
      </p>
    </div>
  );
}
