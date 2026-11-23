import type { MouseEvent, ReactNode } from 'react';
import { placementFromPageClick, type CopyAnnotationPlacement } from '../../domain/copyAnnotationFeature.ts';
import './CopyAnnotationCanvas.css';

export interface CopyAnnotationView {
  criterionId: string;
  message: string;
  x: number;
  y: number;
}

/** Display-only SVG-free overlay. Marks live in the review, never in image pixels. */
export function CopyAnnotationCanvas({
  children, pageNumber, annotations, placingCriterion, onPlace,
}: {
  children: ReactNode;
  pageNumber: number;
  annotations: readonly CopyAnnotationView[];
  placingCriterion?: string | null;
  onPlace?: (criterionId: string, placement: CopyAnnotationPlacement) => void;
}) {
  const handlePlace = (event: MouseEvent<HTMLButtonElement>) => {
    if (!placingCriterion || !onPlace) return;
    const placement = placementFromPageClick(pageNumber, event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (placement) onPlace(placingCriterion, placement);
  };
  return <div className="copy-annotation-canvas">
    {children}
    {annotations.map((annotation) => <div
      key={annotation.criterionId}
      className="copy-inline-annotation"
      title={annotation.message}
      style={{ left: `${annotation.x / 10}%`, top: `${annotation.y / 10}%` }}
      data-criterion-id={annotation.criterionId}
    ><span aria-hidden="true" className="copy-inline-annotation-symbol">✎</span><span>{annotation.message}</span></div>)}
    {placingCriterion && onPlace && <button type="button"
      className="copy-annotation-placement-target"
      aria-label={`Placer l’annotation sur la page ${pageNumber}`}
      title="Cliquez sur l’emplacement de la remarque"
      onClick={handlePlace}
    />}
  </div>;
}
