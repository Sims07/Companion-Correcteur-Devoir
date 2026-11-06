import type { PilotCase, PilotRun } from '../../domain/pilotEvaluationProtocol.ts';
import { PILOT_CASES, summarizePilotResult } from '../../domain/pilotEvaluationProtocol.ts';
import './PilotEvaluationPanel.css';

interface PilotEvaluationPanelProps {
  enabled: boolean;
  busy: boolean;
  uploadingCase: string | null;
  currentCase: string | null;
  message: string;
  imageCounts: Record<string, number>;
  runs: readonly PilotRun[];
  selectedProfiles: number;
  onPrepare: () => void;
  onUpload: (caseId: PilotCase['id'], files: FileList | null) => void;
  onRun: (mode: 'analysis' | 'integrated') => void;
  onStop: () => void;
  onExport: () => void;
  onCopy: () => void;
}

export function PilotEvaluationPanel({
  enabled, busy, uploadingCase, currentCase, message, imageCounts, runs, selectedProfiles,
  onPrepare, onUpload, onRun, onStop, onExport, onCopy,
}: PilotEvaluationPanelProps) {
  const readyForImages = PILOT_CASES.every((testCase) => (imageCounts[testCase.id] ?? 0) > 0);
  return <section className="pilot-evaluation-panel" aria-label="Protocole de test guidé">
    <div className="pilot-evaluation-head">
      <div>
        <p className="eyebrow">LABORATOIRE · EXPÉRIENCE GUIDÉE</p>
        <h3>Protocole de test — 3 copies de biologie</h3>
        <p>Préparez les réponses A (10/10), B (0/10, inversions) et C (5/10, partielle), un barème de 10 sous-critères et trois profils Ollama locaux. La correction normale et le barème du devoir restent inchangés.</p>
      </div>
      <button type="button" className="secondary-button" disabled={busy} onClick={onPrepare}>{enabled ? 'Réinitialiser le protocole' : 'Préparer le protocole en un clic'}</button>
    </div>
    {enabled && <>
      <div className="pilot-evaluation-cases">
        {PILOT_CASES.map((testCase) => <article className="pilot-evaluation-case" key={testCase.id}>
          <div><strong>{testCase.label}</strong><small>Référence {testCase.referenceScore}/10 · {testCase.description}</small></div>
          <label htmlFor={'pilot-image-' + testCase.id}>Photo de la copie (facultative pour Analyse seule)</label>
          <input id={'pilot-image-' + testCase.id} type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" multiple
            disabled={busy || uploadingCase !== null} onChange={(event) => { onUpload(testCase.id, event.target.files); event.target.value = ''; }} />
          <small>{uploadingCase === testCase.id ? 'Préparation locale des pages…' : (imageCounts[testCase.id] ?? 0) ? `${imageCounts[testCase.id]} page(s) prête(s)` : 'Aucune photo fournie'}</small>
        </article>)}
      </div>
      <p className="pilot-evaluation-guide">Profils préparés : Qwen 3.5 4B génératif, D1 3B, TEV1 4B. {selectedProfiles} profil(s) sélectionné(s). Les appels sont séquentiels, sans envoi des copies vers un service cloud.</p>
      <div className="pilot-evaluation-actions">
        <button type="button" className="primary-button" disabled={busy || uploadingCase !== null || selectedProfiles === 0} onClick={() => onRun('analysis')}>Lancer les 3 analyses (sans image)</button>
        <button type="button" className="secondary-button" disabled={busy || uploadingCase !== null || selectedProfiles === 0 || !readyForImages} onClick={() => onRun('integrated')}>Tester les 3 photos (Vision + analyse)</button>
        {busy && <button type="button" className="secondary-button" onClick={onStop}>Arrêter après l’appel en cours</button>}
      </div>
      {!readyForImages && <p className="pilot-evaluation-hint">Pour le parcours complet, associez une photo à chaque copie. Pour démarrer immédiatement, choisissez « Lancer les 3 analyses » : les transcriptions de référence sont déjà intégrées.</p>}
      {(message || currentCase) && <p className="pilot-evaluation-message" role="status">{currentCase ? `Copie ${currentCase} en cours · ` : ''}{message}</p>}
      {runs.length > 0 && <div className="pilot-evaluation-report">
        <div className="pilot-evaluation-report-head">
          <div><h4>Résultats consolidés</h4><p>{runs.length} copie(s) évaluée(s) · notes et décisions comparées aux références du professeur. « Non évaluée » n'est jamais assimilée à zéro.</p></div>
          <div className="pilot-evaluation-report-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={onCopy}>Copier le rapport pour ChatGPT</button>
            <button type="button" className="secondary-button" disabled={busy} onClick={onExport}>Exporter JSON complet</button>
          </div>
        </div>
        <div className="pilot-evaluation-table-scroll">
          <table className="pilot-evaluation-table"><thead><tr><th scope="col">Copie</th><th scope="col">Mode</th><th scope="col">Modèle</th><th scope="col">Note</th><th scope="col">Attendus justes</th><th scope="col">Faux positifs</th><th scope="col">Faux négatifs</th><th scope="col">À examiner</th><th scope="col">Durée</th></tr></thead><tbody>
            {runs.flatMap(({ caseId, record }) => record.results.map((result) => {
              const testCase = PILOT_CASES.find((item) => item.id === caseId)!;
              const benchmark = summarizePilotResult(testCase, result);
              return <tr key={record.id + '-' + result.profileId}>
                <th scope="row">{caseId} · {testCase.referenceScore}/10</th>
                <td>{record.stage === 'analysis' ? 'Analyse seule' : 'Parcours complet'}</td>
                <td>{result.profileName}{result.status !== 'success' ? ' · Échec' : ''}</td>
                <td>{result.score === null ? 'Non évaluée' : `${result.score}/10`}</td>
                <td>{benchmark.correct}/10</td><td>{benchmark.falsePositives}</td><td>{benchmark.falseNegatives}</td><td>{benchmark.unresolved}</td>
                <td>{(result.elapsedMs / 1000).toFixed(1)} s</td>
              </tr>;
            }))}
          </tbody></table>
        </div>
        <p className="pilot-evaluation-hint">Le rapport rassemble les références, les notes, les sous-critères, les durées, les transcriptions et les réponses/traces textuelles des modèles. Les images, jetons d’API, URL des serveurs et corps des requêtes réseau sont exclus.</p>
      </div>}
    </>}
  </section>;
}
