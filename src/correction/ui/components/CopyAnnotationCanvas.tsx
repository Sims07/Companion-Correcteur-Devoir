import type { MouseEvent, ReactNode } from 'react';
import { placementFromPageClick, type CopyAnnotationPlacement } from '../../domain/copyAnnotationFeature.ts';
import './CopyAnnotationCanvas.css';
import './CopyAnnotationHandwriting.css';

export interface CopyAnnotationView {
  id: string;
  number: number;
  message: string;
  x: number;
  y: number;
  suggested?: boolean;
}

export function CopyAnnotationCanvas({
  children, pageNumber, annotations, onPlace,
}: {
  children: ReactNode;
  pageNumber: number;
  annotations: readonly CopyAnnotationView[];
  onPlace?: (placement: CopyAnnotationPlacement) => void;
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
      data-horizontal={annotation.x > 500 ? 'left' : 'right'}
      data-vertical={annotation.y > 500 ? 'above' : 'below'}
      title={annotation.message}
      aria-label={`Annotation ${annotation.number} : ${annotation.message}`}
      style={{ left: `${annotation.x / 10}%`, top: `${annotation.y / 10}%` }}
      onClick={() => document.getElementById(`copy-annotation-${annotation.id}`)?.focus()}
    >
      <span className="copy-inline-annotation-number" aria-hidden="true">{annotation.number}</span>
      <span className="copy-inline-annotation-message" aria-hidden="true">{annotation.message}</span>
    </button>)}
    {onPlace && <button type="button"
      className="copy-annotation-placement-target"
      aria-label={`Placer l’annotation sur la page ${pageNumber}`}
      title="Cliquez sur l’emplacement de la remarque. Au clavier, Entrée place le repère au centre."
      onClick={handlePlace}
    />}
  </div>;
}
