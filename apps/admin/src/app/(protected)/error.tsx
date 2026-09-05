'use client';

import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/admin.json`, under `protectedError`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const protectedErrorMessage = messageView(VI_MESSAGES.admin, 'protectedError');

const ERROR_COPY = {
  title: protectedErrorMessage.text('title'),
  detail: protectedErrorMessage.text('detail'),
  retry: protectedErrorMessage.text('retry'),
} as const;

/**
 * Protected-route error boundary. A dependency failure while resolving the
 * staff session (network/timeout/5xx) surfaces here — never as a silent
 * redirect to `/login` — so a transient API outage is not misread as
 * signed-out. `reset()` re-runs the server resolution.
 */
export default function ProtectedError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <h1>{ERROR_COPY.title}</h1>
      <p>{ERROR_COPY.detail}</p>
      <button type="button" onClick={reset}>
        {ERROR_COPY.retry}
      </button>
    </main>
  );
}
