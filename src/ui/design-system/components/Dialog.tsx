import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button.tsx';

export interface DialogProps {
  title: string;
  children: ReactNode;
  onClose?: () => void;
  subtitle?: string;
  accessibleName?: string;
  closeLabel?: string;
  actions?: ReactNode;
  size?: 'compact' | 'wide' | 'viewer';
  dismissible?: boolean;
  className?: string;
}

/** Native modal semantics: focus containment, Escape and focus restoration are managed by the browser. */
export function Dialog({
  title, children, onClose, subtitle, accessibleName, closeLabel = 'Fermer la fenêtre',
  actions, size = 'compact', dismissible = true, className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog
      ref={ref}
      className={['ds-dialog', 'ds-dialog--' + size, className].filter(Boolean).join(' ')}
      aria-label={accessibleName}
      aria-labelledby={accessibleName ? undefined : headingId}
      onCancel={(event) => {
        if (!dismissible) { event.preventDefault(); return; }
        onClose?.();
      }}
      onClick={(event) => {
        if (dismissible && event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="ds-dialog__surface">
        <header className="ds-dialog__header">
          <div className="ds-dialog__heading">
            <h2 id={headingId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {dismissible && <Button variant="secondary" className="ds-dialog__close" aria-label={closeLabel} onClick={onClose}>×</Button>}
        </header>
        <div className="ds-dialog__body">{children}</div>
        {actions && <footer className="ds-dialog__footer">{actions}</footer>}
      </div>
    </dialog>
  );
}
