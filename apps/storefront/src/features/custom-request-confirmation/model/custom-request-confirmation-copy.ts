/**
 * Every user-facing string on `/yeu-cau/da-gui` (`APP5-S02` §7).
 *
 * Read from the approved `660:3` (desktop) and `660:53` (mobile) frames, not
 * written here; node ids sit beside each entry so a copy change is traceable to
 * the design that authorized it. Centralised because `CLAUDE.md` §5 forbids
 * hard-coded user-facing copy inside components.
 *
 * ### The three things this page may not say
 *
 * **That the code opens anything.** `660:14` says the opposite in the
 * customer's own words, and it is the single most load-bearing sentence on the
 * page: the code is for talking to the workshop, the link in the message is for
 * getting back in. `G01 §5` is why — a code is never authorization data.
 *
 * **That anything has been agreed.** `660:26` and the whole of `660:44` exist
 * to close that door: no quotation, no price, no design approval, no deposit,
 * no payment, no order. A request has been received; nothing has been accepted.
 *
 * **Where the link went.** The approved frames print a masked contact
 * (`b***@vidu.com`); this route makes no request of any kind and holds no
 * customer data — the only thing in the URL is the display code — so the notice
 * names the verified contact without reproducing it. Fetching one would mean a
 * lookup keyed on the code, which is exactly what `G01 §5` forbids.
 */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';
import type { ResponsiveCopy } from '../../../components/responsive-text';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/custom.json`, under `requestConfirmation`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const requestConfirmationMessage = messageView(VI_MESSAGES.custom, 'requestConfirmation');

export const CUSTOM_REQUEST_CONFIRMATION_COPY = {
  /** `660:11` / `660:59` — the page heading. */
  title: requestConfirmationMessage.text('title'),

  /** `660:9` / `660:57` — the tick beside it. Decorative; the title carries the meaning. */
  successMark: requestConfirmationMessage.text('successMark'),

  /** `660:12` / `660:13` — the code, and what it is for. */
  code: {
    label: requestConfirmationMessage.text('code.label'),
    /** `660:14` desktop, `660:62` mobile — the same rule, the shorter sentence. */
    note: {
      wide: requestConfirmationMessage.text('code.note.wide'),
      narrow: requestConfirmationMessage.text('code.note.narrow'),
    } satisfies ResponsiveCopy,
  },

  /**
   * `660:15` / `660:63` — the state a just-submitted request is in.
   *
   * Not read from anywhere, and it does not need to be: `APP5-B01` records that
   * a submission always lands at `NEW`, so this is the one state this page can
   * state without asking. It is a badge, not a live status — the live one is
   * behind the secure link, which is what the notice below points at.
   */
  statusBadge: requestConfirmationMessage.text('statusBadge'),

  /** `660:17` … `660:20` desktop, `660:65` … `660:68` mobile. */
  secureLink: {
    /**
     * `660:18` / `660:66`, with the masked contact removed — see the module
     * note. "Liên hệ đã xác minh" is the same contact the customer verified
     * minutes ago in the submission flow, so it identifies itself.
     */
    title: requestConfirmationMessage.text('secureLink.title'),
    body: {
      wide: requestConfirmationMessage.text('secureLink.body.wide'),
      narrow: requestConfirmationMessage.text('secureLink.body.narrow'),
    } satisfies ResponsiveCopy,
    fallback: {
      wide: requestConfirmationMessage.text('secureLink.fallback.wide'),
      narrow: requestConfirmationMessage.text('secureLink.fallback.narrow'),
    } satisfies ResponsiveCopy,
  },

  /**
   * Shown in place of the code block when `?ma=` is missing or is not a request
   * code (§7).
   *
   * The page still confirms — the customer completed a submission and the
   * secure link is on its way regardless of what survived the navigation — but
   * it claims **no specific request**, because it has no way to know which one.
   * Making no API call here is the point: a lookup by code would be the surface
   * `G01 §5` exists to prevent, and there is nothing to look up anyway.
   */
  missingCode: {
    label: requestConfirmationMessage.text('missingCode.label'),
    note: requestConfirmationMessage.text('missingCode.note'),
  },

  /** `660:21` … `660:26` — what the workshop does next. */
  nextSteps: {
    title: requestConfirmationMessage.text('nextSteps.title'),
    steps: requestConfirmationMessage.list('nextSteps.steps'),
    note: requestConfirmationMessage.text('nextSteps.note'),
  },

  /** `660:44` … `660:49` — stated as absences, on purpose. */
  notIncluded: {
    title: requestConfirmationMessage.text('notIncluded.title'),
    points: requestConfirmationMessage.list('notIncluded.points'),
  },
} as const;
