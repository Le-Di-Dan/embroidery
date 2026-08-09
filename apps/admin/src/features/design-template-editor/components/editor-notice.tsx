'use client';

interface EditorNoticeProps {
  readonly title: string;
  readonly body: string;
  readonly testId: string;
  /** `alert` for a failure the operator must act on; `status` for a fact. */
  readonly tone: 'alert' | 'status';
  readonly action?: { readonly label: string; readonly onClick: () => void };
}

/**
 * A bounded, self-explaining state.
 *
 * Every one of the editor's non-editing outcomes renders through this: not
 * found, load failure, an unscoped Template, an unresolved Side, a document this
 * build cannot read, a read-only status, and the mobile notice. They share a
 * component because they share a rule — **say what is true and what it means**,
 * never an empty screen and never a raw error.
 *
 * The tone is a parameter because it is a real distinction: a Template with no
 * scope is a fact about the Template, not something that went wrong, and
 * announcing it as an alert would interrupt an operator over a normal state.
 */
export function EditorNotice({ title, body, testId, tone, action }: EditorNoticeProps) {
  return (
    <section className="template-editor-notice" role={tone} data-testid={testId}>
      <h2 className="template-editor-notice__title">{title}</h2>
      <p className="template-editor-notice__body">{body}</p>
      {action === undefined ? null : (
        <button
          type="button"
          className="template-editor-notice__action"
          data-testid={`${testId}-action`}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </section>
  );
}
