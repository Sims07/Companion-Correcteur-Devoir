import { useEffect, useState } from 'react';
import type { ImageInput } from '../../ports/aiProvider.ts';
import { Dialog } from '../design-system/index.ts';

type CopyPageViewerProps = {
  pages: ImageInput[];
  pageIndex: number;
  onPageChange: (pageIndex: number) => void;
  onRotate: (pageIndex: number, degrees: 90 | 270) => void;
  onClose: () => void;
  copyLabel?: string;
  rotationDisabled?: boolean;
  rotationDegrees?: number;
};

/** Shared full-size image/PDF-page viewer: the original pixels are never reduced to thumbnail size. */
export function CopyPageViewer({
  pages, pageIndex, onPageChange, onRotate, onClose, copyLabel,
  rotationDisabled = false, rotationDegrees = 0,
}: CopyPageViewerProps) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => { setZoom(1); }, [pageIndex]);
  const page = pages[pageIndex];
  if (!page) return null;

  return <Dialog
    title={`Page ${pageIndex + 1} / ${pages.length}`}
    subtitle={[copyLabel, page.fileName || `Page ${pageIndex + 1}`].filter(Boolean).join(' · ')}
    accessibleName={`Visualiseur de la page ${pageIndex + 1}`}
    closeLabel="Fermer le visualiseur"
    size="viewer"
    onClose={onClose}
  >
    <div className="copy-image-viewer-toolbar">
      <button type="button" onClick={() => onRotate(pageIndex, 270)} disabled={rotationDisabled} aria-label="Tourner l’image à gauche de 90 degrés">↶ 90°</button>
      <button type="button" onClick={() => onRotate(pageIndex, 90)} disabled={rotationDisabled} aria-label="Tourner l’image à droite de 90 degrés">↷ 90°</button>
      {rotationDegrees !== 0 && <span className="copy-image-viewer-orientation">Tournée de {rotationDegrees}°</span>}
      <button type="button" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} disabled={zoom <= 1} aria-label="Dézoomer">−</button>
      <span aria-label="Niveau de zoom">{Math.round(zoom * 100)} %</span>
      <button type="button" onClick={() => setZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))} disabled={zoom >= 4} aria-label="Zoomer">+</button>
      <button type="button" onClick={() => setZoom(1)}>Réinitialiser</button>
    </div>
    <div className="copy-image-viewer-stage">
      <img src={`data:${page.mimeType};base64,${page.base64}`} alt={`Page ${pageIndex + 1} agrandie`} style={{ transform: `scale(${zoom})` }} />
    </div>
    <footer className="copy-image-viewer-navigation">
      <button type="button" onClick={() => { onPageChange(Math.max(0, pageIndex - 1)); setZoom(1); }} disabled={pageIndex === 0}>← Page précédente</button>
      <button type="button" onClick={() => { onPageChange(Math.min(pages.length - 1, pageIndex + 1)); setZoom(1); }} disabled={pageIndex === pages.length - 1}>Page suivante →</button>
    </footer>
  </Dialog>;
}
