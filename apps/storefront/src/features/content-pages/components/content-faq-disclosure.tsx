'use client';

import { useState } from 'react';

import type { ContentFaqSection } from '../model/content-page';

/**
 * The template's `[OPTIONAL]` FAQ accordion (`864:779`).
 *
 * ## Native `<details>` for behaviour, explicit ARIA for the state
 *
 * The element is a real `<details>`/`<summary>`, so the disclosure works before
 * a single byte of JavaScript arrives: the browser toggles it, Enter and Space
 * operate it, and focus is native. No library is added and no click-only `div`
 * is involved.
 *
 * What `<details>` did **not** give us is the announced state. Live acceptance at
 * 1440 measured Chromium's actual mapping for this markup: the `<summary>` was
 * exposed as a generic node, matched no `role=button` query, and carried no
 * expanded state — so a screen-reader user was told neither that the row was a
 * control nor whether it was open. Nesting a heading inside the summary made it
 * worse, surfacing "heading, level 3" instead. The mapping is a user-agent
 * detail, and this one is not one to rely on.
 *
 * So the trigger states its own semantics — `role="button"`, `aria-expanded` and
 * `aria-controls` naming a stable panel id — and React keeps `aria-expanded` in
 * step with the element through `onToggle`, which fires for every activation
 * however it happened: pointer, Enter, Space, or a find-in-page match the
 * browser auto-expanded. The attribute is never a hard-coded literal, which is
 * the failure mode that would announce "collapsed" over an open answer.
 *
 * The one honest gap: between first paint and hydration, a click still toggles
 * the element natively while `aria-expanded` briefly reads `false`. That window
 * is small, self-correcting, and strictly better than the alternative of never
 * exposing the state at all — and the answers themselves are readable
 * throughout, because they are always in the DOM.
 *
 * ## The answers are always in the DOM
 *
 * A collapsed `<details>` still contains its content: hidden visually, not
 * absent. A crawler reads all nine answers and so does a visitor whose page has
 * not hydrated. `docs/08` §5 requires exactly this, which is also why the FAQ
 * has no client-side search or filtering.
 *
 * ## No animation
 *
 * The disclosure opens instantly — there is no height transition to make
 * motion-safe and nothing for `prefers-reduced-motion` to reduce. The marker
 * rotation, the only movement, is behind the shared `motion-safe` mixin.
 *
 * Each `<summary>` is the only interactive element inside its own row: no link,
 * no button and no control is nested inside a trigger.
 */
export function ContentFaqDisclosure({ section }: { section: ContentFaqSection }) {
  const headingId = `content-${section.id}-heading`;
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="content-page__block content-page__faq" aria-labelledby={headingId}>
      <h2 className="content-page__block-heading" id={headingId}>
        {section.heading}
      </h2>
      <div className="content-page__faq-list">
        {section.items.map((item) => {
          const panelId = `content-faq-${item.id}-answer`;

          return (
            <details
              className="content-page__faq-item"
              key={item.id}
              onToggle={(event) => {
                // Read the element rather than inverting a previous guess: this
                // fires for pointer, Enter, Space and browser-driven expansion
                // alike, and `open` is what actually happened.
                setOpenId(event.currentTarget.open ? item.id : null);
              }}
            >
              <summary
                className="content-page__faq-question"
                role="button"
                aria-expanded={openId === item.id}
                aria-controls={panelId}
              >
                <span className="content-page__faq-question-text">{item.question}</span>
              </summary>
              <div className="content-page__faq-answer" id={panelId}>
                {item.answer.map((paragraph, index) => (
                  <p className="content-page__paragraph" key={`${item.id}-p-${String(index)}`}>
                    {paragraph}
                  </p>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
