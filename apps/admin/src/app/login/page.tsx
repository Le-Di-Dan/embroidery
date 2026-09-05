import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import type { Metadata } from 'next';
import { BRAND_NAME } from '@embroidery/ui';

import { StaffLoginScreen } from '../../features/staff-auth';
import { redirectAuthenticatedStaffFromLogin } from '../../server/staff-session-access';

// The Admin console is not for public indexing; the login route is explicitly
// non-indexable in addition to the app-wide robots policy.
/**
 * The browser title and description, from the canonical Vietnamese message
 * repository (`packages/i18n/messages/vi/seo.json`, under `admin.login`).
 */
const seoMessage = messageView(VI_MESSAGES.seo, 'admin');

export const metadata: Metadata = {
  title: seoMessage.text('login.title'),
  description: seoMessage.text('login.description', { brand: BRAND_NAME }),
  robots: { index: false, follow: false },
};

/**
 * Public login route. An already-authenticated visitor is redirected to the
 * authenticated home before the form renders; an invalid/stale cookie or a
 * temporary API outage simply renders the login screen (no redirect loop, and a
 * valid session is never cleared here).
 */
export default async function LoginPage() {
  await redirectAuthenticatedStaffFromLogin();
  return <StaffLoginScreen />;
}
