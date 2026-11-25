import type { MouseEvent, ReactNode } from 'react';
import { placementFromPageClick, copyAnnotationToneLabel, type CopyAnnotationTone, type CopyAnnotationPlacement } from '../../domain/copyAnnotationFeature.ts';
import './CopyAnnotationCanvas.css';
import './CopyAnnotationHandwriting.css';

export interface CopyAnnotationView {
  id: string;
  number: number;
  message: string;
  x: number;
  y: number;
  suggested?: boolean;
  tone?: CopyAnnotationTone;
}

export function CopyAnnotationCanvas({
  children, pageNumber, annotations, onPlace, onAnnotationClick,
}: {
  children: ReactNode;
  pageNumber: number;
  annotations: readonly CopyAnnotationView[];
  onPlace?: (placement: CopyAnnotationPlacement) => void;
  onAnnotationClick?: (id: string) => void;
}) {
  const handlePlace = (event: MouseEvent<HTMLButtonElement>) => {
    if (!onPlace) return;
    // Keyboard activation has no pointer position. Use the page center.
    const rect = event.currentTarget.getBoundingClientRect();
    const placement = event.detail === 0
      ? { pageNumber, x: 500, y: 500 }
      : placementFromPageClick(pageNumber, event.clientX, event.clientY, rect);
    if (placement) onPlace(placement);
  };
  return <div className="copy-annotation-canvas">
    {children}
    {annotations.map((annotation) => <button type="button"
      key={annotation.id}
      className={annotation.suggested ? 'copy-inline-annotation is-suggested' : 'copy-inline-annotation'}
      data-tone={annotation.tone}
      data-horizontal={annotation.x > 500 ? 'left' : 'right'}
      data-vertical={annotation.y > 500 ? 'above' : 'below'}
      title={annotation.message}
      aria-label={`Annotation ${annotation.number} : ${annotation.tone ? copyAnnotationToneLabel(annotation.tone) + " · " : ""}${annotation.message}`}
      style={{ left: `${annotation.x / 10}%`, top: `${annotation.y / 10}%` }}
      onClick={() => {
        if (onAnnotationClick) onAnnotationClick(annotation.id);
        else document.getElementById(`copy-annotation-${annotation.id}`)?.focus();
      }}
    >
      <span className="copy-inline-annotation-number" aria-hidden="true">{annotation.number}</span>
      <span className="copy-inline-annotation-message" aria-hidden="true">{annotation.tone === 'positive' && <span className="copy-inline-annotation-symbol">✓ </span>}{annotation.tone === 'improvement' && <span className="copy-inline-annotation-symbol">! </span>}{annotation.message}</span>
    </button>)}
    {onPlace && <button type="button"
      className="copy-annotation-placement-target"
      aria-label={`Placer l’annotation sur la page ${pageNumber}`}
      title="Cliquez sur l’emplacement de la remarque. Au clavier, Entrée place le repère au centre."
      onClick={handlePlace}
    />}
  </div>;
}
