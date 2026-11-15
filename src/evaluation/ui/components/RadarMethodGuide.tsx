import {
  BIOLOGY_METHOD_DESCRIPTIONS, SCIENCE_METHOD_DESCRIPTIONS,
  type RadarMethodDescription,
} from '../../domain/radarMethodDescriptions.ts';
import { biologyMethodLabels } from '../../domain/radarMethodExclusions.ts';
import { scienceMethods } from '../../domain/radarTimeline.ts';
import type { RadarMethodDomain } from '../../domain/radarMethodExclusions.ts';

function MethodScientificDetails({ description }: { description: RadarMethodDescription }) {
  return <div className="lab-method-science-body">
    <p><strong>Principe scientifique.</strong> {description.principle}</p>
    <strong>Étapes de l’algorithme ou du protocole</strong>
    <ol>{description.steps.map(step => <li key={step}>{step}</li>)}</ol>
    <p><strong>Intérêt.</strong> {description.interest}</p>
    <p><strong>Limites et risques d’erreur.</strong> {description.limitations}</p>
    <p><strong>Ce qui est réellement testé.</strong> {description.radarScope}</p>
  </div>;
}

/** Read-only reference manual. The names always come from the same registry
 * as the launch selector and method radars, including excluded methods. */
export function RadarMethodGuide({ domain }: { domain: RadarMethodDomain }) {
  const entries: Array<{ id: string; label: string; description: RadarMethodDescription }> =
    domain === 'diagrams'
      ? (Object.keys(scienceMethods) as Array<keyof typeof scienceMethods>).map(id => ({
        id, label: scienceMethods[id].label, description: SCIENCE_METHOD_DESCRIPTIONS[id],
      }))
      : (Object.keys(biologyMethodLabels) as Array<keyof typeof biologyMethodLabels>).map(id => ({
        id, label: biologyMethodLabels[id], description: BIOLOGY_METHOD_DESCRIPTIONS[id],
      }));
  // Show the two competing detectors first, then the baseline and guided arms.
  const order = ['pixel-v1', 'leaders-v1', 'direct-v1', 'guided-v1', 'graph-first-v1'];
  if (domain === 'diagrams') entries.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return <section className="lab-method-science-guide" id="method-science-guide"
    aria-label="Fiches scientifiques des méthodes">
    <h3>Comprendre les méthodes</h3>
    <p>Des descriptions du fonctionnement réel, indépendantes du score du radar.
      Ouvrez une fiche pour lire le principe, les étapes, l’intérêt et les limites.</p>
    <div className="lab-method-science-list">
      {entries.map(entry => <details key={entry.id} data-method-id={entry.id}>
        <summary>{entry.label}</summary>
        <MethodScientificDetails description={entry.description}/>
      </details>)}
    </div>
    {domain === 'diagrams' && <p className="lab-method-science-caution">
      Les détecteurs #438 et #439 traitent localement les pixels pour suggérer des pointes au modèle Vision.
      Ils ne certifient ni les connexions ni les notes. Les radars historiques sans identifiant de stratégie
      ne sont pas automatiquement assimilés à l’une de ces cinq méthodes.
    </p>}
  </section>;
}
