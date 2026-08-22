/**
 * Explicit consent to the exact effective agreement set (`APP6-S02` §9, §15).
 *
 * ## Why consent is keyed by identity rather than stored as a list of ticks
 *
 * The rule the checkpoint has to guarantee is *negative*: consent must *not*
 * survive a change of terms. A boolean per agreement, held in state and cleared
 * by an effect, satisfies that rule only for as long as the effect exists — and
 * an effect that is deleted, reordered or made conditional fails silently,
 * leaving the customer bound to text they never read.
 *
 * So consent is stored together with the **signature** of the agreement set it
 * was given for, and it counts for nothing against any other signature.
 * Removing the reset does not weaken the rule; there is no reset to remove.
 * A changed `agreementVersionId`, a changed `contentHash`, an added or removed
 * agreement, or a reordered set all produce a different signature and therefore
 * an empty consent, by construction rather than by a rule someone maintains.
 *
 * ## Why both the id and the hash are in the key
 *
 * `APP6-B11` re-resolves the effective set inside the approval transaction and
 * `GRD-008` compares **both** fields. A client that keyed consent on the id
 * alone would carry a tick across a republished body of the same agreement
 * version — precisely the substitution the hash exists to refuse.
 *
 * Nothing in this module reads or produces agreement *content*. It compares
 * identities the server published; it never hashes text in the browser, which
 * would be a second authority for the value `GRD-008` rules on (§8).
 */

/** The two fields that identify one exact agreement version. */
export interface AgreementIdentity {
  readonly agreementVersionId: string;
  readonly contentHash: string;
}

/**
 * Consent as it is actually held: a set of accepted keys, plus the signature of
 * the agreement set those keys were given for.
 */
export interface AgreementConsent {
  readonly signature: string;
  readonly accepted: ReadonlySet<string>;
}

export const EMPTY_CONSENT: AgreementConsent = { signature: '', accepted: new Set<string>() };

/** One agreement's consent key. Never a display string, never content. */
export function consentKeyOf(agreement: AgreementIdentity): string {
  return `${agreement.agreementVersionId}|${agreement.contentHash}`;
}

/**
 * The identity of a whole effective set.
 *
 * Order-sensitive on purpose: B10 publishes the set "in the published
 * required-type order", so a different order is a different published policy
 * and re-consent is the honest answer rather than a silent match.
 */
export function agreementSignatureOf(agreements: readonly AgreementIdentity[]): string {
  return agreements.map(consentKeyOf).join('~');
}

/**
 * Consent as it applies to the set currently on screen.
 *
 * Consent given for another signature resolves to none at all — this is the
 * reset, expressed as a read rather than as a write.
 */
export function consentFor(
  consent: AgreementConsent,
  agreements: readonly AgreementIdentity[],
): ReadonlySet<string> {
  return consent.signature === agreementSignatureOf(agreements)
    ? consent.accepted
    : EMPTY_CONSENT.accepted;
}

export function isAccepted(
  consent: AgreementConsent,
  agreements: readonly AgreementIdentity[],
  agreement: AgreementIdentity,
): boolean {
  return consentFor(consent, agreements).has(consentKeyOf(agreement));
}

/** Every agreement, explicitly ticked. An empty set is never "all accepted". */
export function allAccepted(
  consent: AgreementConsent,
  agreements: readonly AgreementIdentity[],
): boolean {
  if (agreements.length === 0) return false;
  const accepted = consentFor(consent, agreements);
  return agreements.every((agreement) => accepted.has(consentKeyOf(agreement)));
}

export function outstandingCount(
  consent: AgreementConsent,
  agreements: readonly AgreementIdentity[],
): number {
  const accepted = consentFor(consent, agreements);
  return agreements.filter((agreement) => !accepted.has(consentKeyOf(agreement))).length;
}

/**
 * Records or withdraws one tick, always against the set on screen.
 *
 * Toggling an agreement that belongs to a newer set re-bases consent onto that
 * set, dropping every tick given for the old one — the customer is agreeing to
 * what is in front of them, and nothing else comes along.
 */
export function toggleConsent(
  consent: AgreementConsent,
  agreements: readonly AgreementIdentity[],
  agreement: AgreementIdentity,
  accepted: boolean,
): AgreementConsent {
  const signature = agreementSignatureOf(agreements);
  const next = new Set(consentFor(consent, agreements));
  const key = consentKeyOf(agreement);
  if (accepted) next.add(key);
  else next.delete(key);
  return { signature, accepted: next };
}

/**
 * The exact `acceptedAgreements` body `APP6-B11` requires.
 *
 * Built from the agreements **on screen** and filtered by consent, so a set the
 * customer never saw cannot be submitted. Only the id and the hash cross: no
 * type, no version number, no language and above all no content, because none
 * of those is an input the server accepts and a client that sent them would be
 * asserting an authority it does not have (§8).
 */
export function acceptedAgreementsOf(
  consent: AgreementConsent,
  agreements: readonly AgreementIdentity[],
): readonly AgreementIdentity[] {
  const accepted = consentFor(consent, agreements);
  return agreements
    .filter((agreement) => accepted.has(consentKeyOf(agreement)))
    .map((agreement) => ({
      agreementVersionId: agreement.agreementVersionId,
      contentHash: agreement.contentHash,
    }));
}
