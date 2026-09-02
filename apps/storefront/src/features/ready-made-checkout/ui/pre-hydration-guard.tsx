'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * The checkout's server-rendered form is **not submittable until it is
 * interactive** (`APP12-S02-C1`).
 *
 * ## The defect this closes
 *
 * `ContactEntryCard` and the delivery card are real `<form>` elements whose
 * `onSubmit` calls `preventDefault`. Between first paint and hydration that
 * handler does not exist yet, and neither form carries an `action` or a
 * `method` — so a click on the submit button, or `Enter` in a text field,
 * performs the HTML default: a **native GET to the current URL**, with the
 * form's named controls as the whole query string.
 *
 * On `/xac-minh-lien-he` that costs nothing. On `/mua-hang/[slug]` the query
 * string *is* the purchase: `?sku=&quantity=` is replaced by the contact form's
 * own `…-kind=EMAIL`, the server re-resolves an address that now names no SKU,
 * and the customer lands on "Chưa xác định được sản phẩm cần mua" with their
 * selection gone. That is state destruction on the Wave-1 checkout, which is why
 * it is S02 correctness rather than deferred debt.
 *
 * ## Why the guard is an attribute and not a handler
 *
 * `preventDefault` is the thing that is missing before hydration; adding more of
 * it cannot help. `pointer-events`, an overlay or a fast-hydration assumption
 * are all styling and hope — the HTML on the wire would still be submittable by
 * keyboard, by a slow connection, by a blocked chunk, by a browser with
 * JavaScript disabled.
 *
 * So the correction is in the markup the server actually sends. A **disabled
 * `<fieldset>`** disables every form control descended from it, across the
 * `<form>` boundaries inside it, by the HTML standard and with no script
 * involved:
 *
 * - a disabled `<button type="submit">` cannot be activated, so a click submits
 *   nothing;
 * - a disabled text input cannot be focused or typed into, so there is no
 *   control for implicit submission to originate from, and `Enter` submits
 *   nothing;
 * - a disabled control is never *successful*, so even a form that did submit
 *   would carry none of its values.
 *
 * If hydration never arrives the page stays readable and stays non-interactive,
 * which is the outcome `APP12-S02-C1` §6 asks for: the checkout may be unusable,
 * but it may never destroy what the customer already chose.
 *
 * ## Why this is the columns element rather than a wrapper around it
 *
 * A wrapper would add a box to a grid that is measured from the approved frames.
 * The fieldset **is** the band, with the UA's border, margin, padding and
 * `min-inline-size: min-content` reset in the stylesheet — so the rendered box
 * tree is byte-for-byte what it was before the correction and there is no layout
 * shift at any viewport.
 *
 * ## Why the state flip cannot mismatch
 *
 * The server renders `disabled`, the client's *first* render renders `disabled`,
 * and only the mount effect flips it. React therefore hydrates identical markup;
 * the enable is an ordinary post-mount update, and it is the arrival of that
 * update that proves interactivity rather than a timer that assumes it.
 */
export interface PreHydrationGuardProps {
  readonly className: string;
  readonly children: ReactNode;
}

export function PreHydrationGuard({ className, children }: PreHydrationGuardProps) {
  const [interactive, setInteractive] = useState(false);

  // Runs only in the browser, and only after React has taken the markup over —
  // which is precisely the moment the `onSubmit` handlers begin to exist.
  useEffect(() => {
    setInteractive(true);
  }, []);

  return (
    <fieldset
      className={className}
      disabled={!interactive}
      // Presentation only, and never the safety: the `disabled` attribute above
      // is what makes the form non-submittable. This lets the stylesheet keep
      // the controls at their normal colours for the sub-second hydration
      // window instead of flashing every checkout grey on load — a signal that
      // would be both alarming and uninformative, since nothing is wrong.
      data-interactive={interactive ? 'true' : 'false'}
    >
      {children}
    </fieldset>
  );
}
