import type { ZoomRegion } from '../../../shared/adapters/image/cropOriginalDiagram.ts';

export const targetRegion: ZoomRegion = { page: 1, x: 0.64, y: 0.46, width: 0.12, height: 0.08 };

export function inspectFraming(region: ZoomRegion) {
  const target = targetRegion;
  const overlap = (a: number, w: number, b: number, v: number) =>
    Math.max(0, Math.min(a + w, b + v) - Math.max(a, b));
  const area = region.page === target.page
    ? overlap(region.x, region.width, target.x, target.width) * overlap(region.y, region.height, target.y, target.height)
    : 0;
  return { coverage: Math.min(1, area / (target.width * target.height)),
    occupancy: Math.min(1, area / (region.width * region.height)) };
}

export function makeZoomWitness() {
  const canvas = document.createElement('canvas');
  canvas.width = 2000;
  canvas.height = 1200;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Le navigateur ne peut pas préparer le schéma témoin.');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.strokeStyle = '#27485c';
  ctx.fillStyle = '#162c38';
  ctx.lineWidth = 4;
  const code = String(1000 + Math.floor(Math.random() * 9000));
  for (const [index, label] of ['A', 'B'].entries()) {
    const x = index === 0 ? 600 : 1400;
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText('Cellule ' + label, x, 330);
    ctx.beginPath();
    ctx.ellipse(x, 600, 305, 195, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x, 600, 120, 48, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '16px monospace';
    ctx.fillText(index === 0 ? '0283' : code, x, 606);
  }
  const original = canvas.toDataURL('image/png');
  const small = document.createElement('canvas');
  small.width = 500;
  small.height = 300;
  const preview = small.getContext('2d');
  if (!preview) throw new Error('Aperçu du témoin indisponible.');
  preview.drawImage(canvas, 0, 0, small.width, small.height);
  return { original, preview: small.toDataURL('image/png'), code };
}
