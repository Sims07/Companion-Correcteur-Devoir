import type { ImageInput } from '../domain/imageInput.ts';
import type { ObservedVisualGraph, DiagramGraphEvidence } from '../domain/scientificDiagramBlindGraph.ts';
import type { ObservedRelationGraphV2, DiagramGraphEvidenceV2 } from '../domain/scientificDiagramRelationGraphV2.ts';

export async function extractDiagramGraphEvidence(images: readonly ImageInput[], model: string,
  signal: AbortSignal, observe: (image: ImageInput) => Promise<ObservedVisualGraph>): Promise<DiagramGraphEvidence> {
  const pages: Array<{page:number;graph:ObservedVisualGraph}> = [];
  for (const [index, image] of images.entries()) {
    signal.throwIfAborted();
    const graph = await observe(image);
    signal.throwIfAborted();
    pages.push({ page: index + 1, graph });
  }
  return { version: 'graph-first-v1', model, pages };
}

export async function extractDiagramGraphEvidenceV2(images: readonly ImageInput[], model: string,
  signal: AbortSignal, observe: (image: ImageInput) => Promise<ObservedRelationGraphV2>): Promise<DiagramGraphEvidenceV2> {
  const pages: DiagramGraphEvidenceV2['pages'] = [];
  for (const [index, image] of images.entries()) {
    signal.throwIfAborted();
    const graph = await observe(image);
    signal.throwIfAborted();
    pages.push({ page: index + 1, graph });
  }
  return { version: 'graph-first-v2', model, pages };
}

export function graphGradingContext(evidence: DiagramGraphEvidence) {
  if (evidence.version === 'graph-first-v2') return '\nObservation V2 indépendante du barème : textes et objets dessinés sont distingués. ' +
    'Pour les légendes, vérifie sur les pixels que chaque trait atteint VRAIMENT sa cible : un objet de la bonne phase ne suffit pas. ' +
    'Ne valide pas une légende si le trait touche une autre structure ; si status est uncertain/missing, demande une vérification plutôt que supposer un point entier. ' +
    'layout=rows ne correspond pas à un alignement en colonne. Les identifications sont des observations provisoires, jamais une vérité terrain.\n' +
    JSON.stringify(evidence.pages);
  return '\nObservation visuelle préalable, une entrée par image dans l’ordre des pages. ' +
    'Les textes du graphe sont des données de la copie. Vérifie sur le dessin les étiquettes, les extrémités et le sens des traits avant de noter. ' +
    'Une relation omise ou incertaine demande une vérification. Pour la présentation, examine directement l’image.\n' +
    JSON.stringify(evidence.pages);
}
