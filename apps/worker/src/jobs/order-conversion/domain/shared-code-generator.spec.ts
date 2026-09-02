/**
 * The promoted code generator, proved across all three consumers
 * (`APP7-W01` §13, §18).
 *
 * `FU-APP6-B01-CODE-GENERATOR-PROMOTION-01` asked for one mechanism once the
 * third code existed. The risk a promotion carries is not that the new code is
 * wrong — it is that the two **delivered** codes quietly change while nobody is
 * looking at them. So this file pins the shared mechanism and the `ORD-` prefix
 * that consumes it, and the delivered `REQ-`/`QUO-` suites
 * (`submission-invariants.spec.ts`, `quotation-drafting-rules.spec.ts`) keep
 * asserting their own alphabets, patterns and rejection behaviour unchanged
 * against exactly this code.
 *
 * It lives beside the worker's order code because that is the consumer this
 * checkpoint added; `@embroidery/domain-types` publishes types and pure
 * functions and runs no suite of its own, exactly as the delivered
 * `shared-event-contract.spec.ts` covers its event contract from here.
 */
import {
  generateHumanCode,
  generateOrderCode,
  HUMAN_CODE_ALPHABET,
  HUMAN_CODE_BODY_LENGTH,
  ORDER_CODE_ALPHABET,
  ORDER_CODE_LENGTH,
  ORDER_CODE_PATTERN,
  ORDER_CODE_PREFIX,
} from '@embroidery/domain-types';

describe('promoted human-code mechanism', () => {
  it('keeps the G01-D12 alphabet and length exactly', () => {
    // Omits `0`, `O`, `1`, `I`, `L`, `U`: the code is read aloud and retyped.
    expect(HUMAN_CODE_ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTVWXYZ');
    expect(HUMAN_CODE_ALPHABET).toHaveLength(30);
    expect(HUMAN_CODE_BODY_LENGTH).toBe(10);
  });

  it('rejects biased bytes rather than folding them onto the alphabet', () => {
    // 256 is not a multiple of 30, so bytes at or above 240 must be discarded.
    // A `% 30` shortcut would map 250 onto `A` and make the first sixteen
    // symbols measurably more likely.
    const bytes = [250, 251, 252, 253, 254, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let cursor = 0;
    const drawn = generateHumanCode('X-', (size) =>
      Array.from({ length: size }, () => bytes[cursor++ % bytes.length] as number),
    );

    expect(drawn.startsWith('X-')).toBe(true);
    expect(drawn.slice(2)).toBe('23456789AB');
  });

  it('maps every byte below the ceiling onto its alphabet position', () => {
    const drawn = generateHumanCode('X-', (size) =>
      Array.from({ length: size }, (_value, index) => index),
    );

    expect(drawn).toBe(`X-${HUMAN_CODE_ALPHABET.slice(0, 10)}`);
  });
});

describe('ORD- order code', () => {
  it('publishes the shared alphabet and length under its own prefix', () => {
    expect(ORDER_CODE_PREFIX).toBe('ORD-');
    expect(ORDER_CODE_ALPHABET).toBe(HUMAN_CODE_ALPHABET);
    expect(ORDER_CODE_LENGTH).toBe(HUMAN_CODE_BODY_LENGTH);
  });

  it('generates a code its own pattern accepts', () => {
    expect(generateOrderCode()).toMatch(ORDER_CODE_PATTERN);
    expect(ORDER_CODE_PATTERN.source).toBe(`^ORD-[${HUMAN_CODE_ALPHABET}]{10}$`);
  });

  it('draws from a CSPRNG, so codes are not a sequence', () => {
    const drawn = new Set(Array.from({ length: 200 }, () => generateOrderCode()));

    // 49 bits: 200 draws colliding would mean the source is not random.
    expect(drawn.size).toBe(200);
  });

  it('never emits a character the pattern would reject', () => {
    const body = generateOrderCode().slice(ORDER_CODE_PREFIX.length);

    expect(body).toHaveLength(10);
    expect([...body].every((character) => HUMAN_CODE_ALPHABET.includes(character))).toBe(true);
  });
});
