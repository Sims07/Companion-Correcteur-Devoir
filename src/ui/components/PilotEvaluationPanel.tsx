import type { AiModelProfile } from '../../domain/aiModelProfiles.ts';
import type { PilotCase, PilotRun } from '../../domain/pilotEvaluationProtocol.ts';
import { PILOT_CASES, comparePilotTranscription, pilotSelectionIssue, summarizePilotResult } from '../../domain/pilotEvaluationProtocol.ts';
import './PilotEvaluationPanel.css';

interface PilotEvaluationPanelProps {
  enabled: boolean;
  busy: boolean;
  uploadingCase: string | null;
  currentCase: string | null;
  message: string;
  imageCounts: Record<string, number>;
  runs: readonly PilotRun[];
  selectedProfiles: readonly AiModelProfile[];
  onPrepare: () => void;
  onUpload: (caseId: PilotCase['id'], files: FileList | null) => void;
  onRun: (mode: 'vision' | 'analysis' | 'integrated') => void;
  onStop: () => void;
  onExport: () => void;
  onCopy: () => void;
}

export function PilotEvaluationPanel({
  enabled, busy, uploadingCase, currentCase, message, imageCounts, runs, selectedProfiles,
  onPrepare, onUpload, onRun, onStop, onExport, onCopy,
}: PilotEvaluationPanelProps) {
  const readyForImages = PILOT_CASES.every((testCase) => (imageCounts[testCase.id] ?? 0) > 0);
  const visionIssue = pilotSelectionIssue(selectedProfiles, 'vision');
  const analysisIssue = pilotSelectionIssue(selectedProfiles, 'analysis');
  const integratedIssue = pilotSelectionIssue(selectedProfiles, 'integrated');
  return <section className="pilot-evaluation-panel" aria-label="Protocole de test guidé">
    <div className="pilot-evaluation-head">
      <div>
        <p className="eyebrow">LABORATOIRE · EXPÉRIENCE GUIDÉE</p>
        <h3>Protocole de test — 3 copies de biologie</h3>
        <p>Préparez les réponses A (10/10), B (0/10, inversions) et C (5/10, partielle), puis choisissez une à trois configurations dans « Configurations à exécuter » ci-dessous. Le barème du devoir et les réglages enregistrés restent inchangés.</p>
      </div>
      <button type="button" className="secondary-button" disabled={busy} onClick={onPrepare}>{enabled ? 'Réinitialiser le protocole' : 'Préparer le protocole en un clic'}</button>
    </div>
    {enabled && <>
      <div className="pilot-evaluation-cases">
        {PILOT_CASES.map((testCase) => <article className="pilot-evaluation-case" key={testCase.id}>
          <div><strong>{testCase.label}</strong><small>Référence {testCase.referenceScore}/10 · {testCase.description}</small></div>
          <label htmlFor={'pilot-image-' + testCase.id}>Photo de la copie (requise pour Vision)</label>
          <input id={'pilot-image-' + testCase.id} type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" multiple
            disabled={busy || uploadingCase !== null} onChange={(event) => { onUpload(testCase.id, event.target.files); event.target.value = ''; }} />
          <details className="pilot-evaluation-reference"><summary>Afficher le texte de référence</summary><p>{testCase.transcription}</p></details>
          <small>{uploadingCase === testCase.id ? 'Préparation locale des pages…' : (imageCounts[testCase.id] ?? 0) ? `${imageCounts[testCase.id]} page(s) prête(s)` : 'Aucune photo fournie'}</small>
        </article>)}
      </div>
      <p className="pilot-evaluation-guide">Configurations sélectionnées ci-dessous : {selectedProfiles.length} profil(s) sélectionné(s){selectedProfiles.length ? ` — ${selectedProfiles.map((profile) => profile.name).join(', ')}` : ''}. Les appels sont séquentiels. Chaque modèle est déchargé de la mémoire Ollama avant le profil suivant (ce qui peut rallonger les essais sur CPU). Les copies restent locales.</p>
      {visionIssue && !analysisIssue && <p className="pilot-evaluation-hint" role="status">Vision seule : {visionIssue}</p>}
      {analysisIssue && <p className="pilot-evaluation-hint" role="status">{analysisIssue}</p>}
      {!analysisIssue && integratedIssue && <p className="pilot-evaluation-hint" role="status">Parcours complet : {integratedIssue}</p>}
      <div className="pilot-evaluation-actions">
        <button type="button" className="secondary-button" disabled={busy || uploadingCase !== null || Boolean(visionIssue) || !readyForImages} onClick={() => onRun('vision')}>Lancer les 3 lectures (Vision seule)</button>
        <button type="button" className="primary-button" disabled={busy || uploadingCase !== null || Boolean(analysisIssue)} onClick={() => onRun('analysis')}>Lancer les 3 analyses (sans image)</button>
        <button type="button" className="secondary-button" disabled={busy || uploadingCase !== null || Boolean(integratedIssue) || !readyForImages} onClick={() => onRun('integrated')}>Tester les 3 photos (Vision + analyse)</button>
        {busy && <button type="button" className="secondary-button" onClick={onStop}>Arrêter après l’appel en cours</button>}
      </div>
      {!readyForImages && <p className="pilot-evaluation-hint">Pour Vision seule ou le parcours complet, associez une photo correspondant au texte de référence de chaque copie. Pour démarrer sans images, choisissez « Lancer les 3 analyses » : les transcriptions de référence sont déjà intégrées.</p>}
      {(message || currentCase) && <p className="pilot-evaluation-message" role="status">{currentCase ? `Copie ${currentCase} en cours · ` : ''}{message}</p>}
      {runs.length > 0 && <div className="pilot-evaluation-report">
        <div className="pilot-evaluation-report-head">
          <div><h4>Résultats consolidés</h4><p>{runs.length} copie(s) évaluée(s) · les parcours de lecture et de notation sont distingués. La fidélité texte ne constitue pas une note de biologie.</p></div>
          <div className="pilot-evaluation-report-actions">
            <button type="button" className="secondary-button" disabled={busy} onClick={onCopy}>Copier le rapport pour ChatGPT</button>
            <button type="button" className="secondary-button" disabled={busy} onClick={onExport}>Exporter JSON complet</button>
          </div>
        </div>
        <div className="pilot-evaluation-table-scroll">
          <table className="pilot-evaluation-table"><thead><tr><th scope="col">Copie</th><th scope="col">Mode</th><th scope="col">Modèle</th><th scope="col">Fidélité texte</th><th scope="col">Note</th><th scope="col">Attendus justes</th><th scope="col">Faux positifs</th><th scope="col">Faux négatifs</th><th scope="col">À examiner</th><th scope="col">Durée</th></tr></thead><tbody>
            {runs.flatMap(({ caseId, record }) => record.results.map((result) => {
              const testCase = PILOT_CASES.find((item) => item.id === caseId)!;
              const isVision = record.stage === 'vision';
              const benchmark = isVision ? null : summarizePilotResult(testCase, result);
              const transcriptionBenchmark = isVision ? comparePilotTranscription(testCase.transcription, result.transcription, result.status) : null;
              return <tr key={record.id + '-' + result.profileId}>
                <th scope="row">{caseId} · {testCase.referenceScore}/10</th>
                <td>{isVision ? 'Vision seule' : record.stage === 'analysis' ? 'Analyse seule' : 'Parcours complet'}</td>
                <td>{result.profileName}{result.status !== 'success' ? ' · Échec' : ''}</td>
                <td>{isVision ? (transcriptionBenchmark ? `${transcriptionBenchmark.fidelityPercent} %` : 'Non exploitable') : '—'}</td>
                <td>{isVision ? '—' : result.score === null ? 'Non évaluée' : `${result.score}/10`}</td>
                <td>{benchmark ? `${benchmark.correct}/10` : '—'}</td><td>{benchmark?.falsePositives ?? '—'}</td><td>{benchmark?.falseNegatives ?? '—'}</td><td>{benchmark?.unresolved ?? '—'}</td>
                <td>{(result.elapsedMs / 1000).toFixed(1)} s</td>
              </tr>;
            }))}
          </tbody></table>
        </div>
        {runs.filter((run) => run.record.stage === 'vision').flatMap(({ caseId, record }) =>
          record.results.map((result) => {
            const reference = PILOT_CASES.find((item) => item.id === caseId)!.transcription;
            const benchmark = comparePilotTranscription(reference, result.transcription, result.status);
            return <details className="pilot-evaluation-reading" key={record.id + '-' + result.profileId}>
              <summary>Copie {caseId} · {result.profileName} · {benchmark ? `${benchmark.fidelityPercent} % de fidélité` : 'Lecture non exploitable'}</summary>
              <p>{benchmark
                ? `Erreurs sur ${benchmark.referenceWords} mots : ${benchmark.substitutions} substitutions, ${benchmark.deletions} omissions, ${benchmark.insertions} ajouts (WER : ${(benchmark.wordErrorRate * 100).toFixed(1)} %).`
                : result.error ?? 'Aucune transcription exploitable retournée.'}</p>
              <div className="pilot-evaluation-reading-columns">
                <section><h5>Texte de référence</h5><pre>{reference}</pre></section>
                <section><h5>Lecture du modèle</h5><pre>{result.transcription || 'Aucun texte retourné'}</pre></section>
              </div>
            </details>;
          })
        )}
        <p className="pilot-evaluation-hint">La fidélité texte compare les mots après normalisation typographique : elle ne mesure pas la justesse scientifique. Utilisez la photo correspondant à la référence A, B ou C. Le rapport inclut transcriptions, durées et traces textuelles ; photos, secrets, URL des serveurs et corps des requêtes réseau en sont exclus.</p>
      </div>}
    </>}
  </section>;
}
