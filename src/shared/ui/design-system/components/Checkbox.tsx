import type { InputHTMLAttributes, ReactNode } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children: ReactNode;
}

/** Accessible checkbox label with a consistent accent and spacing. */
export function Checkbox({ children, className, ...props }: CheckboxProps) {
  return (
    <label className={['ds-checkbox', className].filter(Boolean).join(' ')}>
      <input {...props} type="checkbox" />
      <span>{children}</span>
    </label>
  );
}
