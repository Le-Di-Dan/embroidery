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
  drag,
  entries,
  installStudioHistoryHarness,
  redoButton,
  renderStage,
  rows,
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

describe('the controls (609:147, 609:209)', () => {
  it('starts with both controls off and says why', () => {
    renderStage();

    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
    expect(screen.getByTestId('studio-history-no-undo')).toBeInTheDocument();
    expect(screen.getByTestId('studio-history-empty')).toBeInTheDocument();
    expect(rows()).toHaveLength(0);
  });

  it('names the two shortcuts as readable text and no third one', () => {
    renderStage();

    const hints = screen.getByTestId('studio-history-shortcuts').textContent ?? '';
    expect(hints).toContain('Ctrl/Cmd + Z');
    expect(hints).toContain('Ctrl/Cmd + Shift + Z');
    expect(hints).not.toContain('Ctrl+Y');
  });

  it('states the bound rather than implying an unlimited history', () => {
    renderStage();

    const bound = screen.getByTestId('studio-history-bound').textContent ?? '';
    expect(bound).toContain(String(MAX_HISTORY_ENTRIES));
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
