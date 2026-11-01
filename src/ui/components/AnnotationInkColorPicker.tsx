import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type { ImageInput } from '../../ports/aiProvider.ts';
import type { TeacherAnnotationInkColor } from '../../domain/teacherAnnotationColor.ts';

type Props = {
  image: ImageInput;
  preview: ImageInput | null;
  selectedColor: TeacherAnnotationInkColor;
  onColorPick: (color: TeacherAnnotationInkColor) => void;
};

type ViewerImage = 'before' | 'after';

function imageUrl(image: ImageInput): string {
  return `data:${image.mimeType};base64,${image.base64}`;
}

function rgbToHex(red: number, green: number, blue: number): `#${string}` {
  return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, '0')).join('')}` as `#${string}`;
}

/** Lets the teacher inspect either image at high zoom and sample a pixel from the original. */
export function AnnotationInkColorPicker({ image, preview, selectedColor, onColorPick }: Props) {
  const [viewer, setViewer] = useState<ViewerImage | null>(null);
  const [zoom, setZoom] = useState(1);
  const sourceCanvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadedImage = new Image();
    loadedImage.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = loadedImage.naturalWidth;
      canvas.height = loadedImage.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.drawImage(loadedImage, 0, 0);
      sourceCanvas.current = canvas;
    };
    loadedImage.src = imageUrl(image);
    return () => {
      cancelled = true;
      sourceCanvas.current = null;
    };
  }, [image.base64, image.mimeType]);

  const pickColor = (event: MouseEvent<HTMLImageElement>) => {
    const canvas = sourceCanvas.current;
    const displayedImage = event.currentTarget;
    if (!canvas || !displayedImage.naturalWidth) return;
    const bounds = displayedImage.getBoundingClientRect();
    const x = Math.floor((event.clientX - bounds.left) / bounds.width * canvas.width);
    const y = Math.floor((event.clientY - bounds.top) / bounds.height * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    const [red, green, blue] = context.getImageData(x, y, 1, 1).data;
    onColorPick(rgbToHex(red, green, blue));
  };

  const openViewer = (target: ViewerImage) => {
    setZoom(1);
    setViewer(target);
  };

  const activeImage = viewer === 'after' && preview ? preview : image;

  return (
    <div className="annotation-ink-picker">
      <label className="field-label">Couleur des annotations du professeur</label>
      <p className="annotation-ink-picker-instruction">Cliquez directement sur l’encre à retirer dans l’image originale pour prélever sa couleur.</p>
      <div className="annotation-ink-preview" role="group" aria-label="Comparaison avant et après retrait des annotations">
        <figure>
          <button type="button" className="annotation-ink-image-button" onClick={() => openViewer('before')} aria-label="Agrandir l’image avant et choisir une couleur">
            <img src={imageUrl(image)} alt="Page avant retrait des annotations" />
            <span>Cliquer pour agrandir et prélever</span>
          </button>
          <figcaption>Avant</figcaption>
        </figure>
        <figure>
          {preview ? (
            <button type="button" className="annotation-ink-image-button" onClick={() => openViewer('after')} aria-label="Agrandir l’image après retrait">
              <img src={imageUrl(preview)} alt="Page après retrait des annotations" />
              <span>Cliquer pour agrandir</span>
            </button>
          ) : (
            <div className="annotation-ink-image-placeholder">L’aperçu après traitement apparaîtra ici.</div>
          )}
          <figcaption>Après</figcaption>
        </figure>
      </div>
      <div className="annotation-ink-picked-color">
        <span className="annotation-ink-picked-swatch" style={{ backgroundColor: selectedColor === 'none' ? 'transparent' : selectedColor }} aria-hidden="true" />
        <span>{selectedColor === 'none' ? 'Aucune couleur sélectionnée' : `Couleur sélectionnée : ${selectedColor.toUpperCase()}`}</span>
        {selectedColor !== 'none' && <button type="button" className="text-button" onClick={() => onColorPick('none')}>Effacer</button>}
      </div>
      {viewer && (
        <div className="copy-image-viewer annotation-ink-viewer" role="dialog" aria-modal="true" aria-label={viewer === 'before' ? 'Visualiseur de l’image avant traitement' : 'Visualiseur de l’image après traitement'} onClick={() => setViewer(null)} onKeyDown={(event) => { if (event.key === 'Escape') setViewer(null); }}>
          <div className="copy-image-viewer-panel" onClick={(event) => event.stopPropagation()}>
            <header className="copy-image-viewer-header">
              <strong>{viewer === 'before' ? 'Avant le retrait' : 'Après le retrait'}</strong>
              <span>{activeImage.fileName ?? 'Page de la copie'}</span>
              <button type="button" aria-label="Fermer le visualiseur" onClick={() => setViewer(null)}>×</button>
            </header>
            <div className="copy-image-viewer-toolbar">
              <button type="button" aria-label="Dézoomer" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} disabled={zoom <= 1}>−</button>
              <span>{Math.round(zoom * 100)} %</span>
              <button type="button" aria-label="Zoomer" onClick={() => setZoom((value) => Math.min(4, Number((value + 0.25).toFixed(2))))} disabled={zoom >= 4}>+</button>
              <button type="button" onClick={() => setZoom(1)}>Réinitialiser</button>
            </div>
            <div className="copy-image-viewer-stage annotation-ink-viewer-stage">
              <img
                src={imageUrl(activeImage)}
                alt={viewer === 'before' ? 'Image originale agrandie' : 'Image après retrait agrandie'}
                onClick={viewer === 'before' ? pickColor : undefined}
                className={viewer === 'before' ? 'annotation-ink-sample-image' : undefined}
                style={{ transform: `scale(${zoom})` }}
                title={viewer === 'before' ? 'Cliquez sur un pixel pour prélever sa couleur' : undefined}
              />
            </div>
            <footer className="copy-image-viewer-navigation annotation-ink-viewer-footer">
              <span>{viewer === 'before' ? 'Cliquez sur la couleur de l’encre à retirer.' : 'Vérifiez que les réponses de l’étudiant sont intactes.'}</span>
              {viewer === 'before' && <button type="button" className="primary-button" onClick={() => setViewer(null)}>Terminer la sélection</button>}
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
