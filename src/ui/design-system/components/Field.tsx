import type { ReactNode } from 'react';

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

/** Consistent label, helper text and validation message for form controls. */
export function Field({ label, htmlFor, hint, error, required = false, children }: FieldProps) {
  const descriptionId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="ds-field">
      <label className="ds-field__label" htmlFor={htmlFor}>
        {label}{required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children && describedBy
        ? <div data-field-description={describedBy}>{children}</div>
        : children}
      {hint ? <p className="ds-field__hint" id={descriptionId}>{hint}</p> : null}
      {error ? <p className="ds-field__error" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}
