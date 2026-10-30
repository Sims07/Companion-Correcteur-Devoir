import type { InputHTMLAttributes } from 'react';

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

/** Text input with the shared design-system control contract. */
export function TextInput({ className, ...props }: TextInputProps) {
  return <input {...props} className={['ds-input', className].filter(Boolean).join(' ')} />;
}
