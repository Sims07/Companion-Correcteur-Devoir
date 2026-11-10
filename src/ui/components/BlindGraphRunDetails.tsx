import { VISUAL_RELATION_REASONS, type BlindVisualObservationRun } from '../../domain/scientificDiagramBlindGraph.ts';
import type { DiagramSensitivityChoice } from '../../domain/scientificDiagramSensitivity.ts';

const names: Record<string, string> = {
  'relations::transcription': 'ADN → ARN',
  'relations::translation': 'ARN → Protéine',
  'relations::nucleus': 'Noyau dans Cellule',
};
const choices: Record<DiagramSensitivityChoice, string> = {
  present: 'Présent', absent: 'Absent', partial: 'Partiel', uncertain: 'Indécidable',
};

/** Model text is rendered as text only; never HTML, markdown or clickable links. */
export function BlindGraphRunDetails({ run, gold }: {
  run: Omit<BlindVisualObservationRun, 'caseId'>;
  gold: Record<string, DiagramSensitivityChoice>;
}) {
  return <details>
    <summary>{run.profileName} · passage {run.repetition} · {run.status === 'success' ? 'Sortie valide' :
      run.status === 'aborted' ? 'Interrompu' : 'Échec'} · {(run.durationMs / 1000).toFixed(1)} s</summary>
    {run.status === 'success' && <div className="pilot-evaluation-table-scroll">
      <table className="pilot-evaluation-table">
        <thead><tr><th>Relation</th><th>Référence</th><th>Observation</th><th>Explication du comparateur</th></tr></thead>
        <tbody>{Object.entries(run.observations).map(([key, value]) => <tr key={key}>
          <th scope="row">{names[key] || key}</th>
          <td>{gold[key] ? choices[gold[key]] : 'Non définie — enseignant requis'}</td>
          <td>{choices[value]}</td>
          <td>{run.relationDetails?.[key] ? VISUAL_RELATION_REASONS[run.relationDetails[key].reason] : 'Diagnostic indisponible'}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    {(run.diagnostic?.attempts ?? 1) > 1 && <p>Format relancé une fois : {run.status === 'success' ? 'réponse récupérée' : 'réponse encore invalide'}. Motif initial : {run.diagnostic?.previousValidationError ?? 'non renseigné'}.</p>}
    {run.diagnostic?.zoom && <p>
      Agrandissement ciblé : {run.diagnostic.zoom.attempted} tentative(s),
      {' '}{run.diagnostic.zoom.resolved} direction(s) clarifiée(s),
      {' '}{run.diagnostic.zoom.unavailable} zone(s) non localisée(s),
      {' '}{run.diagnostic.zoom.failures} échec(s).
    </p>}
    {run.diagnostic?.recheck && <p>
      Seconde lecture {run.diagnostic.recheck.kind === 'arrows' ? 'des flèches' : 'des contours'} :
      {' '}{run.diagnostic.recheck.attempted} vérification(s),
      {' '}{run.diagnostic.recheck.changed} observation(s) modifiée(s),
      {' '}{run.diagnostic.recheck.failures} échec(s).
      {run.diagnostic.recheck.fullImageFallbacks > 0 &&
        <> {run.diagnostic.recheck.fullImageFallbacks} relecture(s) sur image entière faute de recadrage utilisable.</>}
    </p>}
    {run.diagnostic?.recheck && <details>
      <summary>Voir les réponses des secondes lectures</summary>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {JSON.stringify(run.diagnostic.recheck.evidence, null, 2)}
      </pre>
    </details>}
    {run.diagnostic?.validationError && <p>Sortie rejetée : {run.diagnostic.validationError}</p>}
    {run.status !== 'success' && !run.diagnostic?.validationError && <p>
      {run.errorCategory === 'cancelled' ? 'Appel interrompu.' : 'Erreur de communication ou réponse serveur inexploitable.'}
    </p>}
    {run.graph && <details><summary>Graphe extrait</summary>
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(run.graph, null, 2)}</pre>
    </details>}
    {run.diagnostic && <details><summary>Réponse brute du modèle</summary>
      <p>Fin : {run.diagnostic.doneReason || 'non renseignée'} · Tokens générés : {run.diagnostic.outputTokens ?? 'non renseignés'}</p>
      {run.diagnostic.doneReason === 'length' && <p>Le serveur indique un arrêt à la limite de génération ; la réponse peut être incomplète.</p>}
      {run.diagnostic.rawResponseTruncated && <p>Diagnostic limité aux 24 000 premiers caractères.</p>}
      <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{run.diagnostic.rawResponse || '(Réponse vide)'}</pre>
    </details>}
  </details>;
}
