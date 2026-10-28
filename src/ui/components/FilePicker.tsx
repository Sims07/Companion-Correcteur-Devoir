import { useRef, useState } from 'react';

export interface FilePickerProps {
  id: string;
  title: string;
  description: string;
  accept: string;
  actionLabel?: string;
  multiple?: boolean;
  disabled?: boolean;
  compact?: boolean;
  onFilesSelected: (files: FileList | null) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

export function FilePicker({
  id, title, description, accept, actionLabel = 'Parcourir les fichiers',
  multiple = false, disabled = false, compact = false, onFilesSelected,
}: FilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Array<{ name: string; size: number }>>([]);

  function handleFiles(files: FileList | null) {
    if (!files?.length || disabled) return;
    setSelectedFiles(Array.from(files).map(({ name, size }) => ({ name, size })));
    onFilesSelected(files);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div
      className={['file-picker', compact ? 'file-picker-compact' : '', dragging ? 'is-dragging' : '', disabled ? 'is-disabled' : ''].filter(Boolean).join(' ')}
      onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); setDragging(false); handleFiles(event.dataTransfer.files); }}
      data-testid={`${id}-picker`}
    >
      <input
        ref={inputRef}
        id={id}
        className="file-picker-input"
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        aria-label={title}
        onChange={(event) => handleFiles(event.currentTarget.files)}
      />
      <span className="file-picker-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14.5v4A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <div className="file-picker-copy">
        <strong>{title}</strong>
        <p>{description}</p>
        {selectedFiles.length > 0 && (
          <ul className="file-picker-selected" aria-live="polite" aria-label="Fichiers sélectionnés">
            {selectedFiles.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span className="file-picker-file-icon" aria-hidden="true">↳</span>
                <span className="file-picker-file-name">{file.name}</span>
                <span className="file-picker-file-size">{formatFileSize(file.size)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" className="file-picker-action" onClick={() => inputRef.current?.click()} disabled={disabled}>
        {actionLabel}
      </button>
    </div>
  );
}
