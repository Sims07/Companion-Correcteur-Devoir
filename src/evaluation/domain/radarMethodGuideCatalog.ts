import type { ScienceMethod } from './radarTimeline.ts';
import { scienceMethods } from './radarTimeline.ts';
import { biologyMethodLabels, type BiologyMethodId, type RadarMethodDomain } from './radarMethodExclusions.ts';
import {
  BIOLOGY_METHOD_DESCRIPTIONS, SCIENCE_METHOD_DESCRIPTIONS,
  type RadarMethodDescription,
} from './radarMethodDescriptions.ts';

export type MethodGuideIllustration =
  | 'small-tips' | 'long-shafts' | 'direct-graph' | 'guided' | 'graph-first'
  | 'question-contracts' | 'standard-rubric' | 'historical-pilot' | 'direct-correction';

export interface MethodGuidePresentation {
  title: string;
  summary: string;
  illustration: MethodGuideIllustration;
  visualFocus: string;
  visualCaption: string;
}

export interface MethodGuideEntry extends MethodGuidePresentation {
  id: string;
  label: string;
  science: RadarMethodDescription;
}

/** Display data is separate from the scientific facts and references canonical method IDs. */
export const SCIENCE_METHOD_PRESENTATION: Record<ScienceMethod, MethodGuidePresentation> = {
  'image-direct-v1': {
    title: 'Correction directe sur image · référence',
    summary: 'Le LLM reçoit directement le schéma et le barème pour produire la correction.',
    illustration: 'direct-correction',
    visualFocus: 'Du schéma à la note, sans graphe intermédiaire',
    visualCaption: 'Image et barème entrent dans le même modèle multimodal. Il rend les décisions et la note ; aucun graphe ni détecteur ne précède la correction.',
  },
  'pixel-v1': {
    title: 'Détecteur des petites pointes',
    summary: 'Recherche des pointes discrètes dans les pixels avant vérification par Vision.',
    illustration: 'small-tips',
    visualFocus: 'Que regarde le détecteur ?',
    visualCaption: 'Zoom sur un trait et son extrémité : la pointe n’est qu’un indice. Le modèle Vision vérifie ensuite les objets reliés.',
  },
  'leaders-v1': {
    title: 'Détecteur des longs traits',
    summary: 'Vérifie une tête élargie et une hampe longue, fine et régulière.',
    illustration: 'long-shafts',
    visualFocus: 'Pourquoi suivre la hampe ?',
    visualCaption: 'Un long trait régulier accompagne une pointe possible ; les croisements et traits courts peuvent tromper la détection.',
  },
  'direct-v1': {
    title: 'Lecture directe du graphe',
    summary: 'Le modèle Vision extrait directement les objets et leurs relations.',
    illustration: 'direct-graph',
    visualFocus: 'De l’image à un graphe observé',
    visualCaption: 'Les éléments visibles deviennent des nœuds et des relations déclarées par le modèle, qui restent à comparer aux références.',
  },
  'guided-v1': {
    title: 'Examen guidé, trait par trait',
    summary: 'Inspecte chaque connexion indépendamment avant de conclure.',
    illustration: 'guided',
    visualFocus: 'Quelles vérifications sont demandées ?',
    visualCaption: 'Le guidage impose un ordre d’examen, sans ajouter de preuve géométrique indépendante aux pixels.',
  },
  'graph-first-v1': {
    title: 'Image → graphe → correction',
    summary: 'Sépare l’observation des relations du jugement selon le barème.',
    illustration: 'graph-first',
    visualFocus: 'Séparer observation et décision',
    visualCaption: 'Un graphe visuel erroné peut conduire à une décision erronée : la traçabilité ne suffit pas à garantir la justesse.',
  },
};

export const BIOLOGY_METHOD_PRESENTATION: Record<BiologyMethodId, MethodGuidePresentation> = {
  contract: {
    title: 'Contrats par question',
    summary: 'Évalue chaque attendu explicite avant de calculer la note.',
    illustration: 'question-contracts',
    visualFocus: 'Une décision par attendu',
    visualCaption: 'Les décisions individuelles se comparent au corrigé de référence, même si la note totale paraît correcte.',
  },
  standard: {
    title: 'Barème standard',
    summary: 'Compare la réponse directement aux critères de notation.',
    illustration: 'standard-rubric',
    visualFocus: 'La réponse confrontée au barème',
    visualCaption: 'Le score global n’est pas une preuve : les erreurs d’attribution de points sont contrôlées séparément.',
  },
  pilot: {
    title: 'Pilote historique',
    summary: 'Retrace les expériences antérieures, sans relancer un protocole obsolète.',
    illustration: 'historical-pilot',
    visualFocus: 'Lire les anciennes campagnes',
    visualCaption: 'Un résultat historique ne doit pas être attribué à une méthode actuelle sans information de provenance.',
  },
};

const scienceOrder: readonly ScienceMethod[] =
  ['image-direct-v1', 'pixel-v1', 'leaders-v1', 'direct-v1', 'guided-v1', 'graph-first-v1'];

/** Includes excluded methods and strategies with no archived score. */
export function radarMethodGuideEntries(domain: RadarMethodDomain): MethodGuideEntry[] {
  if (domain === 'diagrams') return scienceOrder.map(id => ({
    id, label: scienceMethods[id].label, ...SCIENCE_METHOD_PRESENTATION[id],
    science: SCIENCE_METHOD_DESCRIPTIONS[id],
  }));
  return (Object.keys(biologyMethodLabels) as BiologyMethodId[]).map(id => ({
    id, label: biologyMethodLabels[id], ...BIOLOGY_METHOD_PRESENTATION[id],
    science: BIOLOGY_METHOD_DESCRIPTIONS[id],
  }));
}
