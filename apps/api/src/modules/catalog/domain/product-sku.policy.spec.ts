/**
 * `APP7-B01` — the order-eligibility rule, proved as a pure function.
 *
 * The whole checkpoint turns on one decision: how many SKUs of a variant are
 * order-eligible after a write. It is tested here without a database, a lock or
 * a transaction, so the rule is provable independently of the mechanism that
 * makes it atomic — and so a future change to that mechanism cannot quietly
 * change the rule.
 */
import * as policy from './product-sku.policy';
import {
  evaluateOrderEligibility,
  isSkuAuthorableProductState,
  MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT,
  MAX_SKU_PRICE_OVERRIDE_AMOUNT,
  SKU_AUTHORABLE_PRODUCT_STATES,
  SKU_CURRENCY,
  SKU_ORDER_ELIGIBLE_IS_ACTIVE,
} from './product-sku.policy';

const sku = (id: string, isActive: boolean) => ({ id, isActive });

describe('SKU order-eligibility', () => {
  it('counts zero when the variant has no SKU at all', () => {
    expect(evaluateOrderEligibility([])).toEqual({ eligibleCount: 0, ambiguous: false });
  });

  it('counts zero — and is not ambiguous — when every SKU is deactivated', () => {
    // Zero is a legal, reachable state: the locked rule says later conversion
    // refuses safely on zero, so refusing the deactivation that produces it
    // would forbid a legitimate Admin action to pre-empt a correct refusal.
    const result = evaluateOrderEligibility([sku('a', false), sku('b', false)]);
    expect(result).toEqual({ eligibleCount: 0, ambiguous: false });
  });

  it('counts exactly one — the only state a Catalog order item can resolve', () => {
    const result = evaluateOrderEligibility([sku('a', true), sku('b', false), sku('c', false)]);
    expect(result).toEqual({ eligibleCount: 1, ambiguous: false });
  });

  it('reports ambiguity as soon as a second SKU is order-eligible', () => {
    const result = evaluateOrderEligibility([sku('a', true), sku('b', true)]);
    expect(result).toEqual({ eligibleCount: 2, ambiguous: true });
  });

  it('never nominates a member of the set', () => {
    // The rule has no tie-break — not first, latest, smallest or id order —
    // because an ambiguous set is never allowed to exist. The returned shape is
    // the proof: it carries a count, and there is no field that could name one.
    const result = evaluateOrderEligibility([sku('z', true), sku('a', true)]);
    expect(Object.keys(result).sort()).toEqual(['ambiguous', 'eligibleCount']);
  });

  it('treats order-eligible as exactly `is_active = true`', () => {
    expect(SKU_ORDER_ELIGIBLE_IS_ACTIVE).toBe(true);
    expect(MAX_ORDER_ELIGIBLE_SKUS_PER_VARIANT).toBe(1);
  });
});

describe('SKU-authorable product states', () => {
  it('allows PUBLISHED — the state an APP6 approval actually reaches', () => {
    expect(isSkuAuthorableProductState('PUBLISHED')).toBe(true);
  });

  it('allows DRAFT, so a SKU can be authored before the product goes public', () => {
    expect(isSkuAuthorableProductState('DRAFT')).toBe(true);
  });

  it('refuses ARCHIVED', () => {
    expect(isSkuAuthorableProductState('ARCHIVED')).toBe(false);
    expect(SKU_AUTHORABLE_PRODUCT_STATES).toEqual(['DRAFT', 'PUBLISHED']);
  });

  it('refuses an unknown state rather than defaulting to permissive', () => {
    expect(isSkuAuthorableProductState('WHATEVER')).toBe(false);
  });
});

describe('SKU code policy (APP7-B01-C1)', () => {
  it('publishes no character policy at all', () => {
    // The accepted authority for `skus.code` is `text NOT NULL`, bytewise
    // comparison under `C` (ADR-DB5-002 R1/R2) and global uniqueness
    // (CST-012). None of those restricts a character. `APP7-B01` shipped an
    // ASCII regex anyway; this asserts it is gone and was not replaced by a
    // second invented alphabet under another name.
    const exported = policy as Record<string, unknown>;
    for (const name of Object.keys(exported)) {
      expect(exported[name]).not.toBeInstanceOf(RegExp);
    }
    expect(exported['SKU_CODE_PATTERN']).toBeUndefined();
  });

  it('publishes no normalization helper either', () => {
    // ADR-DB5-002 R3 assigns normalization to the writing module and names
    // lowercase email, E.164 phone and slugified paths — not a SKU code. A
    // trim-or-fold helper here would make the stored bytes differ from what
    // the Admin typed, and `uq_skus__code` compares stored bytes.
    const exported = policy as Record<string, unknown>;
    const named = Object.keys(exported).filter((name) =>
      /normal|slug|trim|fold|canonical/i.test(name),
    );
    expect(named).toEqual([]);
  });

  it('keeps a payload bound, which restricts length and not characters', () => {
    expect(policy.SKU_CODE_MAX_LENGTH).toBe(64);
  });
});

describe('SKU money bounds', () => {
  it('is VND, the only currency the CHECK permits', () => {
    expect(SKU_CURRENCY).toBe('VND');
  });

  it('stops at the twelve integer digits numeric(14,2) can hold', () => {
    expect(MAX_SKU_PRICE_OVERRIDE_AMOUNT).toBe(999_999_999_999n);
  });
});
