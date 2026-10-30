import { cloneElement, isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

/** Consistent label, helper text and validation message for a single form control. */
export function Field({ label, htmlFor, hint, error, required = false, children }: FieldProps) {
  const descriptionId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const control = isValidElement(children)
    ? (() => {
        const childProps = children.props as {
          'aria-describedby'?: string;
          'aria-invalid'?: boolean;
          required?: boolean;
        };
        const describedBy = [...new Set([
          childProps['aria-describedby'],
          descriptionId,
          errorId,
        ].filter(Boolean))].join(' ') || undefined;

        return cloneElement(children as ReactElement<{
          'aria-describedby'?: string;
          'aria-invalid'?: boolean;
          required?: boolean;
        }>, {
          'aria-describedby': describedBy,
          'aria-invalid': error ? true : childProps['aria-invalid'],
          required: required || childProps.required || undefined,
        });
      })()
    : children;

  return (
    <div className="ds-field">
      <label className="ds-field__label" htmlFor={htmlFor}>
        {label}{required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {control}
      {hint ? <p className="ds-field__hint" id={descriptionId}>{hint}</p> : null}
      {error ? <p className="ds-field__error" id={errorId} role="alert">{error}</p> : null}
    </div>
  );
}
