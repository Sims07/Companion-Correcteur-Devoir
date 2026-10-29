import type { SelectHTMLAttributes } from 'react';

/**
 * Shared select control for all application dropdowns.
 * Keeps native select semantics and keyboard/screen-reader support while
 * applying the same design-system appearance everywhere.
 */
export function DesignSystemSelect({ className, children, ...selectProps }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...selectProps} className={['design-system-select', className].filter(Boolean).join(' ')}>{children}</select>;
}
