/**
 * Undo and redo, driven as a customer drives them (`APP3-S08`) — the controls
 * and the two coalesced actions.
 *
 * The model suite proves the rules; this proves the *capabilities* ask them at
 * the right boundaries: that a multi-frame drag is one entry and not sixty, and
 * that a typed word is one entry and not one per key.
 *
 * The integration suite beside it carries the rest — the layer commands, the
 * image capability, what history must never touch, the keyboard and the
 * responsive compositions. Both drive the real `StudioStageScreen` through one
 * shared harness, so an entry is proved against the SVG paint rather than
 * against a store reading itself back.
 */
import { fireEvent, screen } from '@embroidery/frontend-testing';

import { MAX_HISTORY_ENTRIES } from '../../src/features/design-studio/model/studio-history';
import {
  LINEAGE,
  baselineRow,
  currentRows,
  drag,
  entries,
  installStudioHistoryHarness,
  redoButton,
  renderStage,
  rows,
  scene,
  select,
  stored,
  undoButton,
} from '../support/studio-history-harness';

jest.mock('@embroidery/api-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('@embroidery/api-client'),
  publicProductSideBackgroundGet: jest.fn(),
  publicDesignTemplateAssetGet: jest.fn(),
  publicDesignSessionCreate: jest.fn(),
  publicDesignSessionResume: jest.fn(),
  publicProductPlacementGet: jest.fn(),
  publicDesignSessionAutosave: jest.fn(),
  publicDesignSessionAssetCreate: jest.fn(),
  publicDesignSessionAssetGet: jest.fn(),
  publicDesignSessionAssetStatus: jest.fn(),
}));

installStudioHistoryHarness();

describe('the controls live in the left tool rail (609:147, 609:209)', () => {
  it('puts a real Undo and a real Redo button in the rail', () => {
    renderStage();

    const rail = screen.getByTestId('studio-history-rail');
    expect(rail).toContainElement(undoButton());
    expect(rail).toContainElement(redoButton());
    expect(undoButton()).toHaveAttribute('type', 'button');
    // Redo immediately after Undo, which is the order 609:147 draws (y=132,
    // y=188) and the order the keyboard therefore reaches them in.
    const controls = [...rail.querySelectorAll('button')];
    expect(controls.map((node) => node.getAttribute('data-testid'))).toEqual([
      'studio-history-undo',
      'studio-history-redo',
    ]);
  });

  it('puts no second pair of controls in the history panel', () => {
    renderStage();

    // Two controls for one command is how a customer comes to believe the two
    // do different things. The approved panel header carries none.
    const panel = screen.getByTestId('studio-history-list').closest('section');
    expect(panel?.querySelectorAll('button')).toHaveLength(0);
    expect(screen.getAllByTestId('studio-history-undo')).toHaveLength(1);
    expect(screen.getAllByTestId('studio-history-redo')).toHaveLength(1);
  });

  it('starts with both controls really disabled and says why', () => {
    renderStage();

    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
    // `disabled`, not `aria-disabled`: an aria-disabled button still fires.
    expect(undoButton()).not.toHaveAttribute('aria-disabled');
    expect(screen.getByTestId('studio-history-no-undo')).toBeInTheDocument();
    expect(undoButton()).toHaveAttribute('aria-describedby', 'studio-history-undo-hint');
    expect(rows()).toHaveLength(0);
  });

  it('carries the shortcut hint as its own block, outside the history panel', () => {
    renderStage();

    const hints = screen.getByTestId('studio-history-shortcuts');
    expect(hints.querySelectorAll('button')).toHaveLength(0);
    expect(hints).not.toContainElement(screen.getByTestId('studio-history-list'));

    const text = hints.textContent ?? '';
    expect(text).toContain('Phím tắt (máy tính)');
    expect(text).toContain('Ctrl/⌘ + Z hoàn tác');
    expect(text).toContain('Ctrl/⌘ + Shift + Z làm lại');
    expect(text).not.toContain('Ctrl+Y');
  });

  it('delegates the mobile controls to APP3-S11 in the approved words', () => {
    renderStage();

    expect(screen.getByTestId('studio-history-mobile-note')).toHaveTextContent(
      'Trên di động: nút ↶ ↷ trong thanh công cụ dưới (S11).',
    );
  });

  it('states the bound rather than implying an unlimited history', () => {
    renderStage();

    const bound = screen.getByTestId('studio-history-bound').textContent ?? '';
    expect(bound).toBe(
      `Lịch sử giới hạn ${String(MAX_HISTORY_ENTRIES)} bước gần nhất trong phiên này.`,
    );
    for (const forbidden of ['vô hạn', 'không giới hạn', 'toàn bộ', 'mọi thay đổi']) {
      expect(bound).not.toContain(forbidden);
    }
  });

  it('offers no jump-to-row affordance', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[100, 0]]);

    // The list is informational. `APP3-S08` §14: the presence of a list is not
    // authority for arbitrary time travel.
    const list = screen.getByTestId('studio-history-list');
    expect(list.querySelectorAll('button')).toHaveLength(0);
    expect(list.querySelectorAll('a')).toHaveLength(0);
    expect(list.querySelectorAll('[tabindex]')).toHaveLength(0);
  });
});

describe('the baseline row and the current marker (APP3-S08-C1 §3, §4)', () => {
  it('shows a baseline row on a fresh Studio while the engine stays empty', () => {
    renderStage();

    expect(entries()).toHaveLength(0);
    expect(rows()).toHaveLength(0);
    expect(baselineRow()).toBeInTheDocument();
    expect(baselineRow()).toHaveAttribute('data-current', 'true');
  });

  it('names the Template a cloned Session came from', () => {
    renderStage(scene, { lineage: LINEAGE, templateName: 'Hoa sen cổ điển' });

    expect(baselineRow()).toHaveTextContent('Mở từ mẫu “Hoa sen cổ điển”');
    // Never the slug or the version that travelled with the lineage.
    expect(baselineRow().textContent).not.toContain(LINEAGE.templateSlug);
    expect(baselineRow().textContent).not.toContain(String(LINEAGE.templateVersion));
  });

  it('falls back rather than showing a slug when a resume carries no name', () => {
    renderStage(scene, { lineage: LINEAGE, templateName: null });

    expect(baselineRow()).toHaveTextContent('Mở từ mẫu có sẵn');
    expect(baselineRow().textContent).not.toContain(LINEAGE.templateSlug);
  });

  it('is not interactive, and adds nothing to undo depth', () => {
    renderStage();

    expect(baselineRow().querySelectorAll('button, a, [tabindex]')).toHaveLength(0);
    // The panel draws a row; undo is still off, because there is no entry
    // behind it to reverse.
    expect(undoButton()).toBeDisabled();
  });

  it('moves the one marker forward as actions are recorded', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[40, 0]]);
    drag('studio-transform-move', [[80, 0]]);

    expect(rows()).toHaveLength(2);
    expect(currentRows()).toHaveLength(1);
    // The newest action, which is the last row: the list reads oldest first.
    expect(currentRows()[0]).toBe(rows().at(-1));
  });

  it('moves it back on undo and leaves the future row visible', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[40, 0]]);
    drag('studio-transform-move', [[80, 0]]);

    fireEvent.click(undoButton());

    expect(rows()).toHaveLength(2);
    expect(currentRows()).toHaveLength(1);
    expect(currentRows()[0]).toBe(rows()[0]);
    expect(redoButton()).not.toBeDisabled();
  });

  it('returns the marker to the baseline at the start, with redo still open', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[40, 0]]);

    fireEvent.click(undoButton());

    expect(baselineRow()).toHaveAttribute('data-current', 'true');
    expect(currentRows()).toHaveLength(1);
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).not.toBeDisabled();
    expect(rows()).toHaveLength(1);

    fireEvent.click(redoButton());
    expect(currentRows()[0]).toBe(rows()[0]);
  });

  it('says nothing per row about being applied or undone', () => {
    renderStage();
    select('a');
    drag('studio-transform-move', [[40, 0]]);
    drag('studio-transform-move', [[80, 0]]);
    fireEvent.click(undoButton());

    const list = screen.getByTestId('studio-history-list').textContent ?? '';
    expect(list).not.toContain('Đang áp dụng');
    expect(list).not.toContain('Đã hoàn tác');
    // Exactly one badge, on the current row.
    expect(list.match(/hiện tại/g)).toHaveLength(1);
  });
});

describe('one gesture is one entry (APP3-S08 §10)', () => {
  it('records one entry for a drag of many frames', () => {
    renderStage();
    select('a');

    drag('studio-transform-move', [
      [10, 0],
      [30, 0],
      [60, 0],
      [90, 0],
      [120, 0],
    ]);

    expect(entries()).toHaveLength(1);
    expect(rows()).toHaveLength(1);
    expect(entries()[0]?.action.kind).toBe('move');
  });

  it('records one entry for a resize and one for a rotate', () => {
    renderStage();
    select('a');

    drag('studio-transform-handle-se', [
      [20, 20],
      [40, 40],
    ]);
    drag('studio-transform-rotate', [
      [10, 10],
      [30, 40],
    ]);

    expect(entries().map((entry) => entry.action.kind)).toEqual(['resize', 'rotate']);
  });

  it('undoes the whole gesture rather than its last frame', () => {
    renderStage();
    select('a');
    const before = stored('a')?.transform.x;

    drag('studio-transform-move', [
      [30, 0],
      [90, 0],
    ]);
    expect(stored('a')?.transform.x).not.toBe(before);

    fireEvent.click(undoButton());
    expect(stored('a')?.transform.x).toBe(before);
  });

  it('records nothing for a gesture that never moved', () => {
    renderStage();
    select('a');

    drag('studio-transform-move', []);

    expect(entries()).toHaveLength(0);
    expect(undoButton()).toBeDisabled();
  });

  it('records nothing when every frame was refused', () => {
    renderStage();
    select('a');

    // Far outside the safe area: `APP3-P02` refuses each candidate, so nothing
    // was ever committed and there is nothing to take back.
    drag('studio-transform-move', [
      [900, 700],
      [950, 750],
    ]);

    expect(screen.getByTestId('studio-transform-refusal')).toBeInTheDocument();
    expect(entries()).toHaveLength(0);
  });
});

describe('one text session is one entry (APP3-S08 §11)', () => {
  function field() {
    return screen.getByTestId('studio-text-value');
  }

  it('records one entry for a word typed character by character', () => {
    renderStage();
    select('b');

    fireEvent.focus(field());
    for (const value of ['X', 'Xi', 'Xin', 'Xin ', 'Xin c']) {
      fireEvent.change(field(), { target: { value } });
    }
    expect(entries()).toHaveLength(0);

    fireEvent.blur(field(), { target: { value: 'Xin c' } });
    expect(entries()).toHaveLength(1);
    expect(entries()[0]?.action.kind).toBe('text-edit');
  });

  it('gives an IME composition no entry of its own', () => {
    renderStage();
    select('b');

    fireEvent.focus(field());
    fireEvent.compositionStart(field());
    for (const value of ['Vie', 'Viee', 'Vieej', 'Vieejt']) {
      fireEvent.change(field(), { target: { value } });
    }
    // Nothing has been committed to the document at all, let alone recorded.
    expect(entries()).toHaveLength(0);

    fireEvent.compositionEnd(field(), { target: { value: 'Việt' } });
    expect(entries()).toHaveLength(0);

    fireEvent.blur(field(), { target: { value: 'Việt' } });
    expect(entries()).toHaveLength(1);
  });

  it('undoes the whole session back to the text it started from', () => {
    renderStage();
    select('b');

    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: 'Chào bạn' } });
    fireEvent.blur(field(), { target: { value: 'Chào bạn' } });

    fireEvent.click(undoButton());
    expect(stored('b')).toMatchObject({ text: 'Xin chào' });
  });

  it('records a property edit as its own entry', () => {
    renderStage();
    select('b');

    fireEvent.change(screen.getByTestId('studio-text-align'), { target: { value: 'center' } });

    expect(entries()).toHaveLength(1);
    expect(entries()[0]?.action.kind).toBe('text-format');

    fireEvent.click(undoButton());
    expect(stored('b')).toMatchObject({ textAlign: 'left' });
  });

  it('closes the session rather than folding the next element into it', () => {
    renderStage();
    select('b');

    fireEvent.focus(field());
    fireEvent.change(field(), { target: { value: 'Chào' } });
    select('a');

    expect(entries()).toHaveLength(1);
  });
});
