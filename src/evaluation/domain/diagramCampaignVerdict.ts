import { buildDiagramLabRadar, RADAR_AXES, type RadarAxisId } from './diagramLabRadar.ts';
import { diagramLabProtocolLabels, type DiagramLabArchiveEntry, type DiagramLabProtocol } from './diagramLabHistory.ts';

const axes: Record<DiagramLabProtocol, RadarAxisId | null> = {
  reference: 'graphics',
  arrows: 'arrows',
  semantic: 'biology',
  graph: 'relations',
  personal: null,
};

const explanations: Record<DiagramLabProtocol, string> = {
  reference: 'Cette batterie A/B/C mesure la qualité graphique : présentation, légendes et justesse visuelle. Les notes de référence sont celles des schémas, pas celles du modèle.',
  arrows: 'Cette batterie D/E vérifie le sens des flèches et les destinations des traits de rappel. Elle ne constitue pas une mesure de qualité graphique A/B/C.',
  semantic: 'Cette batterie S0–S5 contrôle la compréhension des modifications biologiques. Elle ne constitue pas une mesure de qualité graphique A/B/C.',
  graph: 'Cette batterie S0–S5 contrôle le graphe des relations et les destinations des flèches. Elle ne mesure pas la qualité graphique A/B/C.',
  personal: 'Cet essai libre ne fournit pas, à lui seul, un score validé sur les axes du radar.',
};

/** Explain exactly what one archived test measured, without conflating API
 * responses, sample reference grades, and a validated radar measurement. */
export function describeDiagramCampaign(entry: DiagramLabArchiveEntry) {
  const axisId = axes[entry.protocol];
  const axisLabel = axisId === null
    ? 'Aucun axe du radar'
    : RADAR_AXES.find((axis) => axis.id === axisId)!.label;
  const candidates = axisId === null ? [] : buildDiagramLabRadar([entry], 'profile');
  const scores = candidates.map((candidate) => {
    const measure = candidate.axes[axisId!];
    return { profile: candidate.name, value: measure.value, reason: measure.reason };
  });
  const measured = entry.state === 'finished' && scores.some((item) => item.value !== null);
  const passageStatus = entry.state === 'running'
    ? 'Campagne encore en cours : mesure provisoire.'
    : entry.experimentCount === 0
      ? 'Aucun passage enregistré : rien à mesurer.'
      : entry.successfulCount < entry.experimentCount
        ? entry.successfulCount + '/' + entry.experimentCount + ' passages exploitables : batterie incomplète.'
        : entry.successfulCount + '/' + entry.experimentCount + ' passages exploitables.';
  const conclusion = entry.state !== 'finished'
    ? 'Aucune conclusion avant la fin de la batterie.'
    : measured
      ? 'Mesure calculée à partir de cette campagne uniquement, selon les références du protocole.'
      : 'Aucun score validé pour cet axe sur cette campagne. Un appel IA réussi ne prouve pas que le résultat scientifique soit exploitable ; « non mesuré » ne signifie pas 0/100.';
  return {
    battery: diagramLabProtocolLabels[entry.protocol],
    axisId, axisLabel, explanation: explanations[entry.protocol],
    passageStatus, conclusion, scores, measured,
  };
}
