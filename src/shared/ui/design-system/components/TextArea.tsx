import type { TextareaHTMLAttributes } from 'react';

export type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Multiline input with the shared design-system control contract. */
export function TextArea({ className, ...props }: TextAreaProps) {
  return <textarea {...props} className={['ds-input', 'ds-textarea', className].filter(Boolean).join(' ')} />;
}
