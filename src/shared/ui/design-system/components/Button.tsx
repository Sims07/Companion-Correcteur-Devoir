import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/** Shared button variants. Use semantic variants rather than feature-specific colors. */
export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={['ds-button', `ds-button--${variant}`, className].filter(Boolean).join(' ')}
    />
  );
}
