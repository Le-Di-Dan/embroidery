/**
 * Every user-facing string on `/xac-minh-lien-he` (`APP4-S01`).
 *
 * Read from the approved `APP4-D01` frames, not written here: node ids are
 * recorded beside each entry so a copy change is traceable to the design that
 * authorized it. Centralised because `CLAUDE.md` §5 forbids hard-coded
 * user-facing copy inside components.
 *
 * Two rules govern what may be said, both from approved annotations:
 *
 * - **Non-enumeration (`634:59`).** Nothing here distinguishes a contact that
 *   belongs to a customer from one that does not. There is no "email already
 *   registered", no "customer found", no "account exists" — the forbidden list
 *   on that frame is the acceptance criterion.
 * - **No policy value is restated (`634:181`).** Durations shown to the customer
 *   come from server timestamps at runtime. The one number written here is the
 *   expiry sentence on `623:100`, which the design renders as prose; it is
 *   *display copy*, and no timer reads it.
 */

/** The masked destination is the only contact form this screen ever renders. */
import { VI_MESSAGES, messageView } from '@embroidery/i18n';

/**
 * Every sentence below lives in the canonical Vietnamese message repository
 * (`packages/i18n/messages/vi/checkout.json`, under `verification`), not in this
 * file (`APP12-V02` §5A). What stays here is the *shape* of the catalog and the
 * reasoning for each key — neither of which JSON can hold — so a Product Owner
 * changes wording by editing one JSON file and a reviewer still reads why the
 * key exists at the point of use.
 */
const verificationMessage = messageView(VI_MESSAGES.checkout, 'verification');

export const VERIFICATION_COPY = {
  /** `623:9` / `623:10` / `623:23` — contact entry, and the mobile card `628:8`. */
  contactEntry: {
    title: verificationMessage.text('contactEntry.title'),
    body: verificationMessage.text('contactEntry.body'),
    /** `623:23`. Says what this screen is not, which is also the S01 scope. */
    caption: verificationMessage.text('contactEntry.caption'),
    submit: verificationMessage.text('contactEntry.submit'),
    /** `623:70` — the same control while the request is in flight. */
    submitting: verificationMessage.text('contactEntry.submitting'),
  },

  /** `623:12` / `623:14` — one control, both contact kinds. */
  contactKind: {
    legend: verificationMessage.text('contactKind.legend'),
    EMAIL: verificationMessage.text('contactKind.EMAIL'),
    PHONE: verificationMessage.text('contactKind.PHONE'),
  },

  /** `623:17` … `623:20`, and the error state `623:44`. */
  emailField: {
    label: verificationMessage.text('emailField.label'),
    placeholder: verificationMessage.text('emailField.placeholder'),
    help: verificationMessage.text('emailField.help'),
    invalid: verificationMessage.text('emailField.invalid'),
  },

  /**
   * The phone field, presented Vietnam-first per `APP4-D01` §D.1.
   *
   * The help text names the national form the customer is expected to type and
   * says an international number is accepted. It deliberately describes nothing
   * about normalization: the server is the canonical normalizer and the customer
   * has no reason to know E.164 exists.
   */
  phoneField: {
    label: verificationMessage.text('phoneField.label'),
    placeholder: verificationMessage.text('phoneField.placeholder'),
    help: verificationMessage.text('phoneField.help'),
    invalid: verificationMessage.text('phoneField.invalid'),
  },

  /** `623:81` … `623:104`. */
  codeEntry: {
    title: verificationMessage.text('codeEntry.title'),
    /** `623:82`. Ends in a colon: the masked destination is its object. */
    body: verificationMessage.text('codeEntry.body'),
    fieldLabel: verificationMessage.text('codeEntry.fieldLabel'),
    /** `623:100`. Display prose, never a timer source. */
    help: verificationMessage.text('codeEntry.help'),
    submit: verificationMessage.text('codeEntry.submit'),
    /** `623:135`. */
    submitting: verificationMessage.text('codeEntry.submitting'),
  },

  /** `623:104` / `625:65` / `625:66`. */
  resend: {
    action: verificationMessage.text('resend.action'),
    /** `625:66` renders `có thể gửi lại sau 00:47`; the clock is the server's. */
    cooldown: (remaining: string) => verificationMessage.text('resend.cooldown', { remaining }),
    sending: verificationMessage.text('resend.sending'),
  },

  /**
   * The alerts, each from its approved frame.
   *
   * `mismatch` deliberately omits the remaining-attempt count that frame
   * `625:28` renders ("Bạn còn 3 lần thử"). `APP4-B04` refuses to publish the
   * count on purpose — its refusal contract calls a "3 attempts remaining"
   * message "a free oracle over how much budget an attacker has left" — and the
   * budget itself is a policy value `634:181` forbids the UI from restating.
   * Recorded as `FU-APP4-S01-ATTEMPT-COUNT-COPY-01`; everything else about the
   * state is exactly as drawn.
   */
  alerts: {
    /** `625:28`, minus the unavailable count. */
    mismatch: verificationMessage.text('alerts.mismatch'),
    /** `625:78` / `625:79`. */
    resent: {
      title: verificationMessage.text('alerts.resent.title'),
      body: verificationMessage.text('alerts.resent.body'),
    },
    /** `625:114` / `625:115`. */
    expired: {
      title: verificationMessage.text('alerts.expired.title'),
      body: verificationMessage.text('alerts.expired.body'),
    },
    /** `625:148` / `625:149`. */
    locked: {
      title: verificationMessage.text('alerts.locked.title'),
      body: verificationMessage.text('alerts.locked.body'),
    },
    /** `625:181` / `625:182`. Identical for a known and an unknown contact. */
    rateLimited: {
      title: verificationMessage.text('alerts.rateLimited.title'),
      body: verificationMessage.text('alerts.rateLimited.body'),
    },
    /** `625:201` / `625:202`. */
    success: {
      title: verificationMessage.text('alerts.success.title'),
      body: verificationMessage.text('alerts.success.body'),
    },
    /** `625:219` / `625:220`. An infrastructure failure, not a verdict. */
    recoverableError: {
      title: verificationMessage.text('alerts.recoverableError.title'),
      body: verificationMessage.text('alerts.recoverableError.body'),
    },
  },

  /**
   * The terminal cards, each with its own title distinct from its alert
   * (`625:112`, `625:146`, `625:199`, `625:217`).
   */
  outcome: {
    EXPIRED: {
      title: verificationMessage.text('outcome.EXPIRED.title'),
      /** `625:116` — the destination follows, so this ends in a colon. */
      destinationLead: verificationMessage.text('outcome.EXPIRED.destinationLead'),
      action: verificationMessage.text('outcome.EXPIRED.action'),
    },
    LOCKED: {
      title: verificationMessage.text('outcome.LOCKED.title'),
      /** `625:150`. */
      destinationLead: verificationMessage.text('outcome.LOCKED.destinationLead'),
      action: verificationMessage.text('outcome.LOCKED.action'),
    },
    SUCCESS: {
      title: verificationMessage.text('outcome.SUCCESS.title'),
      destinationLead: undefined,
      /** `625:206` — the forward action. APP5 owns where it leads. */
      action: verificationMessage.text('outcome.SUCCESS.action'),
    },
    RECOVERABLE_ERROR: {
      title: verificationMessage.text('outcome.RECOVERABLE_ERROR.title'),
      destinationLead: undefined,
      /** `625:226`. */
      action: verificationMessage.text('outcome.RECOVERABLE_ERROR.action'),
    },
  },
  /** `625:207` — the success card's closing caption. */
  successCaption: verificationMessage.text('successCaption'),
  /** The one page `h1`; the card titles are `h2` beneath it. */
  pageTitle: verificationMessage.text('pageTitle'),
  /** Announced politely while a request is in flight (`634:145`). */
  live: {
    requesting: verificationMessage.text('live.requesting'),
    verifying: verificationMessage.text('live.verifying'),
  },
} as const;

/** Which field copy a contact kind uses. One lookup, no branching in the view. */
export const CONTACT_FIELD_COPY = {
  EMAIL: VERIFICATION_COPY.emailField,
  PHONE: VERIFICATION_COPY.phoneField,
} as const;
