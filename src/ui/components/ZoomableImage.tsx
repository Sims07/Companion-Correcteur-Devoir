import { useState } from 'react';
import { Dialog } from '../design-system/index.ts';
import './ZoomableImage.css';

type ZoomableImageProps = {
  src: string;
  alt: string;
  loading?: 'eager' | 'lazy';
};

/** Local image viewer: keeps the original source, never uploads or re-encodes it. */
export function ZoomableImage({ src, alt, loading = 'lazy' }: ZoomableImageProps) {
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const reset = () => { setZoom(1); setRotation(0); };
  return <>
    <button type="button" className="zoomable-image-trigger"
      aria-label={'Agrandir : ' + alt} title="Afficher l’image en grand"
      onClick={() => { reset(); setOpen(true); }}>
      <img src={src} alt={alt} loading={loading} />
      <span className="zoomable-image-hint" aria-hidden="true">⤢ Agrandir</span>
    </button>
    {open && <Dialog title={alt} accessibleName={'Visualiseur : ' + alt}
      closeLabel="Fermer le visualiseur" onClose={() => setOpen(false)} size="viewer">
      <div className="zoomable-image-toolbar">
        <button type="button" aria-label="Tourner à gauche de 90 degrés" onClick={() => setRotation((value) => (value + 270) % 360)}>↶ 90°</button>
        <button type="button" aria-label="Tourner à droite de 90 degrés" onClick={() => setRotation((value) => (value + 90) % 360)}>↷ 90°</button>
        <button type="button" aria-label="Dézoomer" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value - 0.25))}>−</button>
        <span aria-label="Niveau de zoom">{Math.round(zoom * 100)} %</span>
        <button type="button" aria-label="Zoomer" disabled={zoom >= 4} onClick={() => setZoom((value) => Math.min(4, value + 0.25))}>+</button>
        <button type="button" onClick={reset}>Réinitialiser</button>
      </div>
      <div className="zoomable-image-stage">
        <img src={src} alt={alt + ' agrandi'} style={{ transform: 'rotate(' + rotation + 'deg) scale(' + zoom + ')' }} />
      </div>
    </Dialog>}
  </>;
}
