import { CopyAnnotationCanvas } from './CopyAnnotationCanvas.tsx';
import { CopyAnnotationGenerationControls } from './CopyAnnotationGenerationControls.tsx';
import type { AnnotationGenerationState } from './useCopyAnnotationGeneration.ts';
import type { CopyAnnotation } from '../../domain/copyAnnotationFeature.ts';
import type { CopyAnnotationCriterion } from '../../domain/copyAnnotationSuggestions.ts';

const annotationFixtureCriteria: CopyAnnotationCriterion[] = [
  { criterionId: 'titre', title: 'Titre', points: 1, maxPoints: 2,
    evidence: '« Cellule végétale » est écrit en haut à gauche.', rationale: 'Le titre est présent et devrait être souligné.', pageNumber: 1 },
  { criterionId: 'orientation', title: 'Orientation', points: 0, maxPoints: 1,
    evidence: 'Aucun repère d’orientation ne figure sur la page.', rationale: 'Le repère attendu manque.' },
];

export function prepareCopyAnnotationLabFixture() {
  const canvas = document.createElement('canvas');
  canvas.width = 720;
  canvas.height = 500;
  const drawing = canvas.getContext('2d');
  if (!drawing) throw new Error('Impossible de créer la copie de test.');
  drawing.fillStyle = '#fff';
  drawing.fillRect(0, 0, 720, 500);
  drawing.fillStyle = '#20253c';
  drawing.strokeStyle = '#20253c';
  drawing.lineWidth = 3;
  drawing.font = '26px sans-serif';
  drawing.fillText('Cellule végétale', 65, 74);
  drawing.strokeRect(175, 155, 370, 265);
  drawing.beginPath();
  drawing.ellipse(340, 275, 52, 42, 0, 0, Math.PI * 2);
  drawing.stroke();
  const image = canvas.toDataURL('image/png');
  return {
    preview: image,
    images: [{ base64: image.split(',')[1], mimeType: 'image/png' }],
    criteria: annotationFixtureCriteria,
  };
}

export function CopyAnnotationLab({ state, result, onGenerate, onStop }: {
  state: AnnotationGenerationState;
  result: { preview: string; annotations: CopyAnnotation[] } | null;
  onGenerate: () => void;
  onStop: () => void;
}) {
  return <details className="panel copy-annotation-panel">
    <summary>Tester les annotations sur une copie fictive</summary>
    <p>Vérifiez que le modèle situe le titre en haut à gauche et laisse la remarque d’orientation sans repère.</p>
    <CopyAnnotationGenerationControls state={state} disabled={false} onGenerate={onGenerate} onStop={onStop} label="Lancer le test d’annotation" />
    {result && <>
      <CopyAnnotationCanvas pageNumber={1} annotations={result.annotations.flatMap((annotation, index) => annotation.placement
        ? [{ id: 'lab-' + annotation.id, number: index + 1, message: annotation.message, ...annotation.placement, suggested: true }] : [])}>
        <img src={result.preview} alt="Copie fictive avec le titre Cellule végétale en haut à gauche" style={{ maxWidth: '100%', display: 'block' }} />
      </CopyAnnotationCanvas>
      <p role="status">
        Titre en haut à gauche : {result.annotations.some(({ criterionId, placement }) =>
          criterionId === 'titre' && placement?.pageNumber === 1 && placement.x <= 430 && placement.y <= 260) ? 'oui' : 'à vérifier'}
        {' · '}Orientation sans repère : {result.annotations.some(({ criterionId }) => criterionId === 'orientation')
          && result.annotations.filter(({ criterionId }) => criterionId === 'orientation').every(({ placement }) => !placement) ? 'oui' : 'à vérifier'}
      </p>
      <ol className="copy-annotation-list">
        {result.annotations.map((annotation, index) => <li key={annotation.id} tabIndex={-1} id={`copy-annotation-lab-${annotation.id}`}>
          <strong>{index + 1}. {annotation.message}</strong>
          <div>{annotation.placement ? `Page ${annotation.placement.pageNumber} · x ${annotation.placement.x}, y ${annotation.placement.y}` : 'Sans emplacement'}</div>
        </li>)}
      </ol>
    </>}
  </details>;
}
