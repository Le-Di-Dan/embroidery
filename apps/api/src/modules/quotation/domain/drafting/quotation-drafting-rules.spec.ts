/**
 * The two authority-derived rules drafting enforces, and the policy shape it
 * refuses to guess (`APP6-B01`).
 *
 * These are the checkpoint's judgement calls made testable: which request states
 * `TR-LC12-01`'s "request ≥ UNDER_REVIEW" names, which quotation states still
 * accept an append, and what an unusable `quotation.deposit` value is.
 */
import { schema } from '@embroidery/database';

import { parseQuotationDepositPolicy } from '../pricing/quotation-deposit-policy';
import {
  DRAFTABLE_QUOTATION_STATES,
  QUOTABLE_REQUEST_STATES,
  isDraftableQuotationState,
  isQuotableRequestState,
} from './quotation-eligibility';
import { QUOTATION_CODE_PATTERN, generateQuotationCode } from './quotation-code';

describe('TR-LC12-01 request eligibility', () => {
  it('admits the LC-11 progression from UNDER_REVIEW onward', () => {
    expect([...QUOTABLE_REQUEST_STATES]).toEqual([
      'UNDER_REVIEW',
      'NEEDS_CLARIFICATION',
      'QUOTED',
      'QUOTE_ACCEPTED',
      'DIGITIZING',
      'DESIGN_REVIEW',
      'APPROVED',
    ]);
  });

  it('refuses NEW — below UNDER_REVIEW — and the two terminal outcomes', () => {
    expect(isQuotableRequestState('NEW')).toBe(false);
    expect(isQuotableRequestState('REJECTED')).toBe(false);
    expect(isQuotableRequestState('CANCELLED')).toBe(false);
  });

  it('classifies every declared request state, so a new one cannot be silently admitted', () => {
    const classified = new Set([
      ...QUOTABLE_REQUEST_STATES,
      'NEW',
      'REJECTED',
      'CANCELLED',
    ] as readonly string[]);

    for (const state of schema.CUSTOM_REQUEST_STATES) {
      expect(classified.has(state)).toBe(true);
    }
    expect(classified.size).toBe(schema.CUSTOM_REQUEST_STATES.length);
  });

  it('allows re-quoting a QUOTED or QUOTE_ACCEPTED request (ADR-DB3-001 rule 4)', () => {
    // Refusing these would make the documented re-quote path unreachable: a new
    // price after acceptance is a new version, and it needs a quotable request.
    expect(isQuotableRequestState('QUOTED')).toBe(true);
    expect(isQuotableRequestState('QUOTE_ACCEPTED')).toBe(true);
  });
});

describe('quotation draftability', () => {
  it('refuses only the two terminal LC-12 header states', () => {
    expect(isDraftableQuotationState('REJECTED')).toBe(false);
    expect(isDraftableQuotationState('CANCELLED')).toBe(false);

    for (const state of schema.QUOTATION_STATES) {
      if (state !== 'REJECTED' && state !== 'CANCELLED') {
        expect(isDraftableQuotationState(state)).toBe(true);
      }
    }
    expect(DRAFTABLE_QUOTATION_STATES).toHaveLength(schema.QUOTATION_STATES.length - 2);
  });

  it('admits EXPIRED, which LC-12 calls re-activatable by a new version', () => {
    expect(isDraftableQuotationState('EXPIRED')).toBe(true);
  });
});

describe('quotation.deposit policy parsing', () => {
  it('accepts a coherent split and exposes it in hundredths of a percent', () => {
    const parsed = parseQuotationDepositPolicy({ depositPercent: 40, remainingPercent: 60 });

    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.policy.depositPercentHundredths).toBe(4_000n);
  });

  it('refuses a split that does not describe one whole quotation', () => {
    expect(parseQuotationDepositPolicy({ depositPercent: 40, remainingPercent: 50 }).ok).toBe(false);
  });

  it('refuses a missing, non-numeric or out-of-range share rather than guessing', () => {
    expect(parseQuotationDepositPolicy({ remainingPercent: 60 }).ok).toBe(false);
    expect(
      parseQuotationDepositPolicy({ depositPercent: '40', remainingPercent: 60 }).ok,
    ).toBe(false);
    expect(parseQuotationDepositPolicy({ depositPercent: 140, remainingPercent: -40 }).ok).toBe(
      false,
    );
    expect(parseQuotationDepositPolicy(null).ok).toBe(false);
  });
});

describe('quotation code', () => {
  it('draws codes matching its own published pattern', () => {
    for (let draw = 0; draw < 50; draw += 1) {
      expect(generateQuotationCode()).toMatch(QUOTATION_CODE_PATTERN);
    }
  });

  it('omits the characters that are ambiguous when read aloud', () => {
    const code = generateQuotationCode();

    for (const ambiguous of ['0', 'O', '1', 'I', 'L', 'U']) {
      expect(code.slice('QUO-'.length)).not.toContain(ambiguous);
    }
  });

  it('rejects the bytes that would bias the alphabet', () => {
    // 240..255 map onto the first sixteen symbols under a bare modulo, so a
    // source that only produced them must be resampled, not folded.
    let call = 0;
    const biased = (size: number): Buffer =>
      Buffer.from(
        Array.from({ length: size }, () => (call++ < size ? 250 : 0)),
      );

    expect(generateQuotationCode(biased)).toMatch(QUOTATION_CODE_PATTERN);
  });
});
