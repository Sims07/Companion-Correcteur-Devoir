import type { ReactNode } from 'react';

export type StatusTone = 'success' | 'info' | 'warning' | 'error';

type StatusNoticeProps = {
  tone: StatusTone;
  children: ReactNode;
};

const symbols: Record<StatusTone, string> = {
  success: '✓',
  info: 'i',
  warning: '!',
  error: '!',
};

/** Feedback for a finished action, distinct from branded calls to action. */
export function StatusNotice({ tone, children }: StatusNoticeProps) {
  return (
    <p className={`ds-status-notice ds-status-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span aria-hidden="true" className="ds-status-notice__icon">{symbols[tone]}</span>
      <span>{children}</span>
    </p>
  );
}
