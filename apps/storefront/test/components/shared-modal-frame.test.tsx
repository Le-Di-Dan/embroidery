/**
 * The accessibility and focus contract of the promoted modal frame
 * (`APP12-H01`, FU-APP12-S03-03).
 *
 * Five secure screens each carried a byte-identical copy of this behaviour and
 * none of them tested it directly — the copies were only ever exercised through
 * whatever dialog happened to sit inside them. Consolidating into one component
 * makes it worth proving once, properly: what moved is exactly what is asserted
 * here, so a regression in the shared frame cannot reach the quotation, the
 * design review, the deposit, the remaining balance and the Ready-Made order at
 * the same time without failing first.
 *
 * The scrim-is-not-a-dismiss-target rule is the one that most deserves a test.
 * These dialogs stand between a customer and a credential or an irreversible
 * decision, and "clicking the backdrop closed it" is the kind of behaviour that
 * gets added later by someone who thinks it is a courtesy.
 */
import { createUser, fireEvent, renderWithProviders, screen } from '@embroidery/frontend-testing';

import { ModalFrame } from '../../src/shared/dialog/modal-frame';

const BLOCK = {
  scrimClassName: 'test__scrim',
  dialogClassName: 'test__dialog',
  titleClassName: 'test__dialog-title',
};

function renderFrame() {
  const onDismiss = jest.fn();
  const view = renderWithProviders(
    <ModalFrame title="Xác minh liên hệ" onDismiss={onDismiss} {...BLOCK}>
      <button type="button">first</button>
      <button type="button">last</button>
    </ModalFrame>,
  );
  return { ...view, onDismiss };
}

describe('the shared modal frame', () => {
  it('is a modal dialog named by its own heading', () => {
    renderFrame();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    // The accessible name comes from the heading rather than a hand-written
    // `aria-label`, so the name a screen reader announces and the name a sighted
    // customer reads cannot drift apart.
    expect(dialog).toHaveAccessibleName('Xác minh liên hệ');
  });

  it('keeps each feature its own BEM block', () => {
    const { container } = renderFrame();

    // The whole reason the class names are props: five approved stylesheets, and
    // no shared one invented to hold a sixth.
    expect(container.querySelector('.test__scrim')).not.toBeNull();
    expect(container.querySelector('.test__dialog')).not.toBeNull();
    expect(container.querySelector('.test__dialog-title')).not.toBeNull();
  });

  it('puts initial focus on the heading, not the first control', () => {
    renderFrame();

    // The customer must read what is being asked of them before their fingers
    // are on the field that answers it.
    expect(screen.getByRole('heading', { name: 'Xác minh liên hệ' })).toHaveFocus();
  });

  it('dismisses on Escape', () => {
    const { onDismiss } = renderFrame();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss when the scrim is clicked', async () => {
    const user = createUser();
    const { container, onDismiss } = renderFrame();

    const scrim = container.querySelector('.test__scrim');
    expect(scrim).not.toBeNull();
    await user.click(scrim as Element);

    // A stray click on the backdrop is the least deliberate gesture there is.
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('cycles Tab forward from the last control back to the first', () => {
    renderFrame();

    const first = screen.getByRole('button', { name: 'first' });
    const last = screen.getByRole('button', { name: 'last' });

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });

    expect(first).toHaveFocus();
  });

  it('cycles Shift+Tab backward from the first control to the last', () => {
    renderFrame();

    const first = screen.getByRole('button', { name: 'first' });
    const last = screen.getByRole('button', { name: 'last' });

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });

    expect(last).toHaveFocus();
  });

  it('returns focus to the control that opened it', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const view = renderFrame();
    // The frame took focus for its heading; unmounting must hand it back.
    expect(opener).not.toHaveFocus();

    view.unmount();

    expect(opener).toHaveFocus();
    opener.remove();
  });
});
