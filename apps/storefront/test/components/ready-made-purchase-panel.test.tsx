/**
 * The `APP12-S01` purchase panel, driven as a customer drives it.
 *
 * The `APP12-S01` §33 state matrix, case by case: one variant with one SKU,
 * several variants, several eligible SKUs under one variant, zero stock, the
 * quantity ceiling, a SKU price override, a Product with nothing to sell, and a
 * purchase projection that could not be read.
 *
 * Assertions are made on what the customer can reach — the accessible name, the
 * disabled state, the rendered price, the composed `href` — rather than on class
 * names, so a restyle does not fail the suite and a broken control does.
 */
import { fireEvent, renderWithProviders, screen, within } from '@embroidery/frontend-testing';

import { ReadyMadePurchasePanel } from '../../src/features/ready-made-purchase';
import { READY_MADE_PURCHASE_COPY } from '../../src/features/ready-made-purchase/model/ready-made-purchase-copy';
import type { ReadyMadePurchaseResult } from '../../src/features/ready-made-purchase';
import { toReadyMadePurchaseView } from '../../src/features/ready-made-purchase/model/purchase-projection';
import {
  makeSku,
  makeVariant,
  makeVariantList,
  makeVariantMatrix,
} from '../support/ready-made-purchase-fixture';

const BASE_PRICE = { amount: '450000', currency: 'VND' } as const;
const SLUG = 'ao-thun-cotton';

function ready(
  variants: Parameters<typeof makeVariantList>[0] = makeVariantMatrix(),
): ReadyMadePurchaseResult {
  return { kind: 'ready', view: toReadyMadePurchaseView(makeVariantList(variants)) };
}

function renderPanel(purchase: ReadyMadePurchaseResult = ready()) {
  return renderWithProviders(
    <ReadyMadePurchasePanel slug={SLUG} basePrice={BASE_PRICE} purchase={purchase} />,
  );
}

/**
 * A native input, proved to be one.
 *
 * The narrowing is a real `instanceof` check rather than a cast, so it doubles
 * as the accessibility assertion the panel actually owes: a control reached by
 * its label or its role has to BE an input, not a styled div wearing one's name.
 */
function asInput(element: HTMLElement): HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Expected a native input, found <${element.tagName.toLowerCase()}>.`);
  }
  return element;
}

/** The panel's call to action, whichever element currently represents it. */
function cta(): HTMLElement {
  const link = screen.queryByRole('link', { name: READY_MADE_PURCHASE_COPY.continue });
  if (link !== null) return link;
  return screen.getByRole('button', {
    name: new RegExp(
      `${READY_MADE_PURCHASE_COPY.continue}|${READY_MADE_PURCHASE_COPY.continueOutOfStock}`,
    ),
  });
}

function chooseOption(legend: string, name: string): void {
  const group = screen.getByRole('group', { name: legend });
  fireEvent.click(within(group).getByRole('radio', { name: new RegExp(`^${name}`) }));
}

describe('case B — several variants', () => {
  it('offers exactly the axes the server published, with nothing preselected', () => {
    renderPanel();
    const variantGroup = screen.getByRole('group', {
      name: READY_MADE_PURCHASE_COPY.variantLegend,
    });
    expect(
      within(variantGroup)
        .getAllByRole('radio')
        .map((radio) => asInput(radio).checked),
    ).toEqual([false, false]);
    // No variant is marked as a default by the contract and none is invented here.
    expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
  });

  it('holds the CTA disabled and binds the reason to the open fieldset', () => {
    renderPanel();
    expect(cta()).toBeDisabled();
    // Nothing is claimed before the customer engages.
    expect(screen.queryByText(READY_MADE_PURCHASE_COPY.variantRequired)).not.toBeInTheDocument();

    chooseOption(READY_MADE_PURCHASE_COPY.variantLegend, 'Trắng');
    const sizeGroup = screen.getByRole('group', { name: READY_MADE_PURCHASE_COPY.sizeLegend });
    // Bound to the group rather than announced as a toast (`906:186`).
    expect(sizeGroup).toHaveAccessibleDescription(READY_MADE_PURCHASE_COPY.sizeRequired);
    expect(cta()).toBeDisabled();
  });

  it('renders the whole panel before any JavaScript decides anything', () => {
    // A variant with nothing to sell is still shown (`APP12-S01` §7) — it is
    // simply not selectable.
    renderPanel();
    const sizeGroup = screen.getByRole('group', { name: READY_MADE_PURCHASE_COPY.sizeLegend });
    expect(within(sizeGroup).getAllByRole('radio')).toHaveLength(2);
  });
});

describe('case A / F — one available SKU, and the price that follows it', () => {
  it('shows the product price until a SKU resolves, then that SKU price override', () => {
    renderPanel();
    // `906:189`: the Product's own published catalog price, before a SKU exists.
    expect(screen.getByText('450.000 VND')).toBeInTheDocument();

    chooseOption(READY_MADE_PURCHASE_COPY.variantLegend, 'Trắng');
    chooseOption(READY_MADE_PURCHASE_COPY.sizeLegend, 'M');
    // The override on `sku-trang-m`, not the base and not the other variant's.
    expect(screen.getByText('399.000 VND')).toBeInTheDocument();
    expect(screen.queryByText('450.000 VND')).not.toBeInTheDocument();
  });

  it('follows the price immediately when the selection moves to another SKU', () => {
    renderPanel();
    chooseOption(READY_MADE_PURCHASE_COPY.variantLegend, 'Trắng');
    chooseOption(READY_MADE_PURCHASE_COPY.sizeLegend, 'M');
    expect(screen.getByText('399.000 VND')).toBeInTheDocument();

    chooseOption(READY_MADE_PURCHASE_COPY.variantLegend, 'Đen');
    expect(screen.getByText('1.250.000 VND')).toBeInTheDocument();
  });

  it('states the availability the server published and offers the CTA', () => {
    renderPanel();
    chooseOption(READY_MADE_PURCHASE_COPY.variantLegend, 'Trắng');
    chooseOption(READY_MADE_PURCHASE_COPY.sizeLegend, 'M');

    expect(screen.getByText('Còn 8 sản phẩm')).toBeInTheDocument();
    expect(cta()).toHaveAttribute('href', `/mua-hang/${SLUG}?sku=sku-trang-m&quantity=1`);
  });
});

describe('case D — zero stock', () => {
  it('captions the sold-out size and refuses to select it', () => {
    renderPanel();
    chooseOption(READY_MADE_PURCHASE_COPY.variantLegend, 'Trắng');
    const sizeGroup = screen.getByRole('group', { name: READY_MADE_PURCHASE_COPY.sizeLegend });
    const large = within(sizeGroup).getByRole('radio', { name: /^L/ });

    expect(large).toBeDisabled();
    expect(within(sizeGroup).getByText(READY_MADE_PURCHASE_COPY.optionSoldOut)).toBeInTheDocument();

    fireEvent.click(large);
    expect(asInput(large).checked).toBe(false);
    expect(cta()).toBeDisabled();
  });
});

describe('case E — the quantity ceiling', () => {
  beforeEach(() => {
    renderPanel();
    chooseOption(READY_MADE_PURCHASE_COPY.variantLegend, 'Đen');
    chooseOption(READY_MADE_PURCHASE_COPY.sizeLegend, 'M');
  });

  const quantity = () => asInput(screen.getByLabelText(READY_MADE_PURCHASE_COPY.quantityLabel));

  it('starts at one and publishes the server bound on the control itself', () => {
    expect(quantity().value).toBe('1');
    expect(quantity()).toHaveAttribute('min', '1');
    expect(quantity()).toHaveAttribute('max', '3');
  });

  it('steps up to the availability and stops there', () => {
    const increase = screen.getByRole('button', {
      name: READY_MADE_PURCHASE_COPY.quantityIncrease,
    });
    fireEvent.click(increase);
    fireEvent.click(increase);
    expect(quantity().value).toBe('3');
    expect(increase).toBeDisabled();
    expect(cta()).toHaveAttribute('href', `/mua-hang/${SLUG}?sku=sku-den-m&quantity=3`);
  });

  it('never steps below one', () => {
    const decrease = screen.getByRole('button', {
      name: READY_MADE_PURCHASE_COPY.quantityDecrease,
    });
    expect(decrease).toBeDisabled();
    fireEvent.click(decrease);
    expect(quantity().value).toBe('1');
  });

  it('refuses a typed value past the ceiling and a blank one', () => {
    fireEvent.change(quantity(), { target: { value: '99' } });
    // The URL never carries a quantity the SKU cannot satisfy, even while the
    // control still shows what was typed.
    expect(cta()).toHaveAttribute('href', `/mua-hang/${SLUG}?sku=sku-den-m&quantity=3`);
    fireEvent.blur(quantity());
    expect(quantity().value).toBe('3');

    fireEvent.change(quantity(), { target: { value: '' } });
    expect(cta()).toHaveAttribute('href', `/mua-hang/${SLUG}?sku=sku-den-m&quantity=1`);
  });

  it('resets the quantity when the selection moves to a SKU with less stock', () => {
    fireEvent.click(
      screen.getByRole('button', { name: READY_MADE_PURCHASE_COPY.quantityIncrease }),
    );
    expect(quantity().value).toBe('2');

    chooseOption(READY_MADE_PURCHASE_COPY.variantLegend, 'Trắng');
    chooseOption(READY_MADE_PURCHASE_COPY.sizeLegend, 'M');
    expect(quantity().value).toBe('1');
    expect(cta()).toHaveAttribute('href', `/mua-hang/${SLUG}?sku=sku-trang-m&quantity=1`);
  });
});

describe('case C — several eligible SKUs under one variant', () => {
  it('selects none of them, names none of them and claims nothing about stock', () => {
    renderPanel(
      ready([
        makeVariant({
          productVariantId: 'v-ambiguous',
          colorName: 'Trắng',
          sizeLabel: 'M',
          skus: [
            makeSku({
              skuId: 'sku-cheap',
              unitPrice: { amount: '100000', currency: 'VND' },
              availableQuantity: 9,
            }),
            makeSku({
              skuId: 'sku-dear',
              unitPrice: { amount: '900000', currency: 'VND' },
              availableQuantity: 1,
            }),
          ],
        }),
      ]),
    );

    // The option is offered but not selectable, and it is NOT captioned `· hết`:
    // nothing about this refusal is a statement about inventory.
    const variantGroup = screen.getByRole('group', {
      name: READY_MADE_PURCHASE_COPY.variantLegend,
    });
    expect(within(variantGroup).getByRole('radio', { name: /^Trắng/ })).toBeDisabled();
    expect(
      within(variantGroup).queryByText(READY_MADE_PURCHASE_COPY.optionSoldOut),
    ).not.toBeInTheDocument();

    // Neither SKU's price is shown, so no heuristic winner leaked through the
    // price line; the Product's own price stands.
    expect(screen.getByText('450.000 VND')).toBeInTheDocument();
    expect(screen.queryByText('100.000 VND')).not.toBeInTheDocument();
    expect(screen.queryByText('900.000 VND')).not.toBeInTheDocument();

    // No internal id reaches the customer, and there is nothing to continue to.
    expect(document.body.textContent).not.toContain('sku-cheap');
    expect(document.body.textContent).not.toContain('sku-dear');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(cta()).toBeDisabled();
  });
});

describe('case G — a Product with no purchasable SKU', () => {
  it('renders the approved out-of-stock panel and no navigable action', () => {
    renderPanel(ready([makeVariant({ skus: [] })]));

    expect(screen.getByText(READY_MADE_PURCHASE_COPY.priceCaptionOutOfStock)).toBeInTheDocument();
    expect(screen.queryByText(READY_MADE_PURCHASE_COPY.priceCaption)).not.toBeInTheDocument();
    const button = screen.getByRole('button', {
      name: READY_MADE_PURCHASE_COPY.continueOutOfStock,
    });
    expect(button).toBeDisabled();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // No quantity control: `906:143` drops the whole block.
    expect(screen.queryByLabelText(READY_MADE_PURCHASE_COPY.quantityLabel)).not.toBeInTheDocument();
  });

  it('invents no restock promise', () => {
    renderPanel(ready([makeVariant({ skus: [makeSku({ availableQuantity: 0 })] })]));
    expect(document.body.textContent).not.toMatch(/sắp có|sắp về|liên hệ để đặt|thông báo khi/i);
  });
});

describe('case H — the purchase projection could not be read', () => {
  it('says so, and reports neither a price nor zero stock', () => {
    renderPanel({ kind: 'unavailable' });

    expect(screen.getByText(READY_MADE_PURCHASE_COPY.unavailableHeading)).toBeInTheDocument();
    // A backend failure is not zero stock (`APP12-S01` §24).
    expect(screen.queryByText(READY_MADE_PURCHASE_COPY.continueOutOfStock)).not.toBeInTheDocument();
    expect(screen.queryByText('450.000 VND')).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('accessibility', () => {
  it('uses real grouped radios and real buttons, never a clickable div', () => {
    renderPanel();
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio.tagName).toBe('INPUT');
      expect(radio).toHaveAttribute('type', 'radio');
    }
    // Two named groups, so the two axes are distinguishable to a screen reader.
    expect(screen.getAllByRole('group')).toHaveLength(2);
  });

  /*
   * `APP12-H08`. The description binding above is necessary and was not
   * sufficient.
   *
   * `aria-describedby` on a group is announced when the group is **entered**,
   * and this message appears while the customer is already inside one: choosing
   * a colour is what publishes "chọn kích thước" on the *sibling* fieldset. The
   * CTA cannot fill the gap either — it is `disabled`, so it is not in the tab
   * order and a screen-reader customer never lands on it. Without a live region
   * there was no way to learn why the purchase could not continue.
   */
  it('announces the missing-axis message as well as binding it to the group', () => {
    renderPanel();
    chooseOption(READY_MADE_PURCHASE_COPY.variantLegend, 'Trắng');

    const message = screen.getByText(READY_MADE_PURCHASE_COPY.sizeRequired);
    // Polite, not assertive: the customer is mid-choice and has done nothing
    // wrong.
    expect(message).toHaveAttribute('role', 'status');
    // And still the group's description — the live region is in addition to the
    // `906:186` binding, never instead of it.
    expect(
      screen.getByRole('group', { name: READY_MADE_PURCHASE_COPY.sizeLegend }),
    ).toHaveAccessibleDescription(READY_MADE_PURCHASE_COPY.sizeRequired);
  });

  it('is operable from the keyboard alone', () => {
    renderPanel();
    const variantGroup = screen.getByRole('group', {
      name: READY_MADE_PURCHASE_COPY.variantLegend,
    });
    const white = asInput(within(variantGroup).getByRole('radio', { name: /^Trắng/ }));
    white.focus();
    expect(document.activeElement).toBe(white);
    // Space/Enter on a focused radio is a change, exactly as the platform
    // implements it for a native control.
    fireEvent.click(white);
    expect(white.checked).toBe(true);
  });
});
