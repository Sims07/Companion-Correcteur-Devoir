import { useState } from 'react';
import type { DetectedArrow } from '../../domain/arrowDirections.ts';
import { DIAGRAM_SENSITIVITY_CASE_IDS, scientificDiagramSensitivityPreviewUrl } from '../../domain/scientificDiagramSensitivity.ts';
import { readArrowPixels } from '../../adapters/image/arrowContext.ts';
import { Button } from '../design-system/index.ts';

interface Reading {
  name: string;
  preview: string;
  arrows: DetectedArrow[];
}

async function readDirections(name: string, url: string, degrees = 0): Promise<Reading> {
  const { canvas, context, arrows } = await readArrowPixels(url, degrees);
  context.strokeStyle = '#ad235b';
  context.fillStyle = '#ad235b';
  context.lineWidth = 2;
  context.font = 'bold 16px sans-serif';
  arrows.forEach(({ x, y }, index) => {
    context.beginPath();
    context.arc(x, y, 10, 0, 2 * Math.PI);
    context.stroke();
    context.fillText(String(index + 1), Math.max(0, x - 10), Math.max(16, y - 13));
  });
  return { name, arrows, preview: canvas.toDataURL('image/png') };
}

export function LocalArrowExperiment() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uploaded, setUploaded] = useState<File>();
  const [rotation, setRotation] = useState(0);
  async function run(file?: File, degrees = 0) {
    setBusy(true);
    setError('');
    if (file !== uploaded || !file) setReadings([]);
    const url = file && URL.createObjectURL(file);
    try {
      if (file && url) setReadings([await readDirections(file.name, url, degrees)]);
      else {
        const results: Reading[] = [];
        for (const id of DIAGRAM_SENSITIVITY_CASE_IDS) results.push(await readDirections(id, scientificDiagramSensitivityPreviewUrl(id)));
        setReadings(results);
      }
      setUploaded(file);
      setRotation(degrees);
    } catch {
      setUploaded(undefined);
      setReadings([]);
      setError('Image illisible. Essaie un fichier PNG ou JPEG.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      setBusy(false);
    }
  }
  return <details>
    <summary>Détecter le sens des flèches sans modèle IA</summary>
    <p>Sur les flèches horizontales et verticales à pointe pleine, les cercles numérotés indiquent les pointes détectées. Un trait sans détection reste à vérifier.</p>
    <Button disabled={busy} onClick={() => void run()}>Tester les six schémas en local</Button>
    <label> Essayer une image <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => {
      const file = event.currentTarget.files?.[0];
      event.currentTarget.value = '';
      if (file) void run(file);
    }} /></label>
    {uploaded && <div role="group" aria-label="Orientation de l’image importée">
      <Button variant="secondary" disabled={busy} aria-label="Tourner l’image à gauche de 90 degrés"
        onClick={() => void run(uploaded, (rotation + 270) % 360)}>↶ 90°</Button>
      <Button variant="secondary" disabled={busy} aria-label="Tourner l’image à droite de 90 degrés"
        onClick={() => void run(uploaded, (rotation + 90) % 360)}>↷ 90°</Button>
      <span> {rotation}°</span>
    </div>}
    {busy && <p role="status">Lecture des pixels…</p>}
    {error && <p role="alert">{error}</p>}
    <div className="diagram-fixture-grid">
      {readings.map(({ name, preview, arrows }) => <figure className="diagram-fixture-card" key={name}>
        <img src={preview} alt={'Pointes repérées sur ' + name} />
        <figcaption><strong>{name}</strong> — {arrows.map((arrow, index) => (index + 1) + ' vers ' + ({ droite: 'la droite', gauche: 'la gauche', haut: 'le haut', bas: 'le bas' }[arrow.direction])).join(', ') || 'Aucune pointe détectée'}</figcaption>
      </figure>)}
    </div>
  </details>;
}
