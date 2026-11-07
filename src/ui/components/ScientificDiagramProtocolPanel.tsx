import { useState } from 'react';
import type { AiModelProfile } from '../../domain/aiModelProfiles.ts';
import type { Rubric } from '../../domain/rubric.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import { getRubricSubcriteria, validateRubric } from '../../domain/rubric.ts';
import { Button, TextArea } from '../design-system/index.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';
import { FilePicker } from './FilePicker.tsx';
import {
  SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, diagramProtocolProfileIssue,
  diagramTargetKey, parseScientificDiagramProtocolRubric, usesDirectDiagramVision,
  type DiagramGold, type DiagramProtocolCount, type buildScientificDiagramProtocolReport,
} from '../../domain/scientificDiagramProtocol.ts';
import './PilotEvaluationPanel.css';
import './ScientificDiagramProtocolPanel.css';

export interface DiagramProtocolRequest {
  rubric: Rubric;
  context: string;
  images: ImageInput[];
  gold: DiagramGold;
  repetitions: DiagramProtocolCount;
}
type DiagramReport = ReturnType<typeof buildScientificDiagramProtocolReport>;

export interface ScientificDiagramProtocolPanelProps {
  selectedProfiles: readonly AiModelProfile[];
  busy: boolean;
  progress: string;
  onPrepareImages: (files: File[]) => Promise<ImageInput[]>;
  onRun: (request: DiagramProtocolRequest) => Promise<DiagramReport>;
  onStop: () => void;
}

export function ScientificDiagramProtocolPanel({
  selectedProfiles, busy, progress, onPrepareImages, onRun, onStop,
}: ScientificDiagramProtocolPanelProps) {
  const [rubric, setRubric] = useState<Rubric>(() => structuredClone(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC));
  const [context, setContext] = useState('');
  const [images, setImages] = useState<ImageInput[]>([]);
  const [uploading, setUploading] = useState(false);
  const [repetitions, setRepetitions] = useState<DiagramProtocolCount>(3);
  const [gold, setGold] = useState<DiagramGold>({});
  const [report, setReport] = useState<DiagramReport | null>(null);
  const [message, setMessage] = useState('');
  const targets = rubric.criteria.flatMap((criterion) =>
    getRubricSubcriteria(criterion).map((item) => ({ criterion, item, key: diagramTargetKey(criterion.id, item.id) })));
  const validation = validateRubric(rubric);
  const profileIssues = selectedProfiles.map(diagramProtocolProfileIssue).filter((issue): issue is string => Boolean(issue));
  const hasRemote = selectedProfiles.some((profile) => {
    try { return !['localhost', '127.0.0.1', '[::1]'].includes(new URL(profile.configuration.endpoint).hostname); }
    catch { return true; }
  });
  const canRun = !busy && !uploading && images.length > 0 && validation.valid && selectedProfiles.length > 0 && profileIssues.length === 0;

  async function importRubric(files: FileList | null) {
    if (!files?.length || busy || uploading) return;
    try {
      const imported = parseScientificDiagramProtocolRubric(JSON.parse(await files[0]!.text()) as unknown);
      setRubric(imported);
      setGold({});
      setReport(null);
      setMessage('Barème importé localement : ' + imported.criteria.length + ' critères. Les critères de compréhension sans sous-critères ont été exclus.');
    } catch (cause) {
      setMessage('Import refusé : ' + (cause instanceof Error ? cause.message : String(cause)));
    }
  }

  async function importImages(files: FileList | null) {
    if (!files?.length || busy || uploading) return;
    setUploading(true);
    setImages([]);
    setReport(null);
    try {
      const prepared = await onPrepareImages(Array.from(files));
      setImages(prepared);
      setMessage(prepared.length + ' page(s) préparée(s) localement. Les mêmes pages serviront aux répétitions.');
    } catch (cause) {
      setMessage('Lecture impossible : ' + (cause instanceof Error ? cause.message : String(cause)));
    } finally { setUploading(false); }
  }

  async function start() {
    if (!canRun) return;
    setReport(null);
    setMessage('');
    try {
      const completed = await onRun({
        rubric: structuredClone(rubric), context: context.trim(),
        images, gold: { ...gold }, repetitions,
      });
      setReport(completed);
      setMessage(completed.experiments.length ? 'Mesures disponibles : le rapport ne contient aucune photographie.' : 'Aucun essai terminé.');
    } catch (cause) {
      setMessage('Erreur du protocole : ' + (cause instanceof Error ? cause.message : String(cause)));
    }
  }

  function exportReport() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'companion-protocole-schema-scientifique.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyReport() {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      setMessage('Rapport copié : vous pouvez le coller dans la conversation pour l’analyse.');
    } catch {
      setMessage('Copie bloquée par le navigateur : utilisez « Exporter JSON ».');
    }
  }

  return <section className="pilot-evaluation-panel diagram-protocol-panel" aria-label="Protocole schémas scientifiques">
    <div className="pilot-evaluation-head">
      <div>
        <p className="eyebrow">LABORATOIRE · VISION DÉCISIONNELLE</p>
        <h3>Protocole — schéma scientifique</h3>
        <p>Un dessin réel, un barème professeur et 3 ou 5 répétitions par configuration. Comparer la justesse avec des décisions de référence, la couverture, la stabilité et le temps CPU. Le devoir en cours n’est pas modifié.</p>
      </div>
    </div>
    <div className="diagram-protocol-inputs">
      <div className="diagram-protocol-import">
        <h4>1. Schéma et barème</h4>
        <FilePicker id="diagram-protocol-photos" title="Schéma à analyser" description="Photo(s) ou PDF du même schéma ; pages conservées ensemble dans un seul essai" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" multiple disabled={busy || uploading} onFilesSelected={(files) => { void importImages(files); }} />
        <p className="pilot-evaluation-hint">{uploading ? 'Préparation locale…' : images.length ? images.length + ' page(s) prêtes' : 'Aucune image fournie.'}</p>
        <FilePicker id="diagram-protocol-rubric" title="Barème du professeur (JSON)" description="Par défaut : 15 attendus visuels, 8 points. Importez un barème propre au sujet pour évaluer aussi la compréhension." accept=".json,application/json" disabled={busy || uploading} onFilesSelected={(files) => { void importRubric(files); }} />
        <p className="pilot-evaluation-hint">Barème actif : <strong>{rubric.title}</strong> — {validation.maximumPoints} points, {targets.length} attendu{targets.length > 1 ? 's' : ''}. Les 2 points « Compréhension » de l’exemple sont exclus par défaut : ils nécessitent des structures attendues propres au schéma.</p>
        <label htmlFor="diagram-protocol-context">Contexte biologique du dessin (facultatif pour les seuls critères de présentation)</label>
        <TextArea id="diagram-protocol-context" rows={2} disabled={busy} value={context}
          onChange={(event) => { setContext(event.currentTarget.value); setReport(null); }}
          placeholder="Ex. coupe longitudinale de racine ; structures attendues, espèce, préparation…" />
      </div>
      <div className="diagram-protocol-reference">
        <h4>2. Référence du professeur (facultatif)</h4>
        <p className="pilot-evaluation-hint">Pour mesurer la justesse, indiquez ce qui est réellement visible sur cette copie. Sans référence, le test mesure seulement la répétabilité et la couverture ; il n’invente aucune note attendue.</p>
        <div className="diagram-protocol-labels">
          {rubric.criteria.map((criterion) => <fieldset key={criterion.id}>
            <legend>{criterion.title} · {criterion.maxPoints} pts</legend>
            {getRubricSubcriteria(criterion).map((sub) => {
              const key = diagramTargetKey(criterion.id, sub.id);
              return <label key={key} className="diagram-protocol-label-row" htmlFor={'diagram-gold-' + key}>
                <span>{sub.title} <small>({sub.maxPoints} pt)</small></span>
                <DesignSystemSelect id={'diagram-gold-' + key} aria-label={'Référence : ' + sub.title} disabled={busy}
                  value={gold[key] ?? ''} onChange={(event) => {
                    const choice = event.currentTarget.value;
                    setGold((current) => {
                      const next = { ...current };
                      if (choice === 'present' || choice === 'absent' || choice === 'partial') next[key] = choice;
                      else delete next[key];
                      return next;
                    });
                    setReport(null);
                  }}>
                  <option value="">Non renseigné</option>
                  <option value="present">Présent</option>
                  <option value="absent">Absent</option>
                  <option value="partial">Partiel</option>
                </DesignSystemSelect>
              </label>;
            })}
          </fieldset>)}
        </div>
      </div>
    </div>
    <div className="diagram-protocol-run">
      <h4>3. Répéter à l’identique</h4>
      <p className="pilot-evaluation-hint">Configurations : {selectedProfiles.length ? selectedProfiles.map((profile) =>
        profile.name + ' (' + (usesDirectDiagramVision(profile) ? 'System One image directe' : 'Vision puis analyse') + ')').join(' · ') :
        'Sélectionnez les profils dans « Configurations à exécuter » plus bas.'}</p>
      {hasRemote && <p className="pilot-evaluation-hint" role="status">Attention : une configuration distante est sélectionnée. Les images seront envoyées à son serveur ; choisissez uniquement Ollama local pour un traitement sur cet appareil.</p>}
      {profileIssues.map((issue) => <p className="pilot-evaluation-hint" role="status" key={issue}>{issue}</p>)}
      <div className="pilot-evaluation-actions">
        <label htmlFor="diagram-protocol-repeat-count">Répétitions</label>
        <DesignSystemSelect id="diagram-protocol-repeat-count" disabled={busy} value={repetitions}
          onChange={(event) => setRepetitions(event.currentTarget.value === '5' ? 5 : 3)}>
          <option value={3}>3 passages</option><option value={5}>5 passages</option>
        </DesignSystemSelect>
        <Button disabled={!canRun} onClick={() => { void start(); }}>Tester le schéma en un clic</Button>
        {busy && <Button variant="secondary" onClick={onStop}>Arrêter après l’appel en cours</Button>}
      </div>
      {(progress || message) && <p role="status" className="pilot-evaluation-message">{message || progress}</p>}
    </div>
    {report && <div className="pilot-evaluation-report" aria-label="Résultats du protocole schéma">
      <div className="pilot-evaluation-report-head">
        <div><h4>Résultats du schéma</h4><p>{report.experiments.length} essai(s) exécuté(s), {report.imageCount} page(s) par essai. Le taux de justesse exige des références renseignées par le professeur.</p></div>
        <div className="pilot-evaluation-report-actions">
          <Button variant="secondary" onClick={() => { void copyReport(); }}>Copier le rapport</Button>
          <Button variant="secondary" onClick={exportReport}>Exporter JSON</Button>
        </div>
      </div>
      <div className="pilot-evaluation-table-scroll">
        <table className="pilot-evaluation-table">
          <thead><tr><th>Modèle</th><th>Parcours</th><th>Essais</th><th>Justesse</th><th>Couverture</th><th>Stables et évalués</th><th>Temps moyen</th></tr></thead>
          <tbody>{report.summaries.map((summary) => <tr key={summary.profileId}>
            <th scope="row">{summary.profileName} · {summary.model}</th>
            <td>{summary.method === 'direct-image-systemone' ? 'Image directe' : 'Vision + analyse'}</td>
            <td>{summary.runsCompleted}/{summary.plannedRepetitions}</td>
            <td>{summary.accuracyPercent === null ? 'Non mesurée' : summary.accuracyPercent + ' %'}{summary.labelledTargets ? ' (' + summary.labelledTargets + ' références)' : ''}</td>
            <td>{summary.coveragePercent === null ? '—' : summary.coveragePercent + ' %'}</td>
            <td>{summary.stableResolvedTargets === null ? 'Série incomplète' : summary.stableResolvedTargets + '/' + summary.totalTargets}</td>
            <td>{summary.meanDurationMs === null ? '—' : (summary.meanDurationMs / 1000).toFixed(1) + ' s'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="pilot-evaluation-hint">{report.limitations} Le rapport n’exporte ni images, ni réponses brutes, ni clés API, ni adresses de serveur.</p>
      <details className="pilot-evaluation-reference">
        <summary>Voir les décisions par sous-critère et par passage</summary>
        {report.summaries.map((summary) => <div key={summary.profileId}>
          <strong>{summary.profileName} — {summary.model}</strong>
          <div className="diagram-protocol-decision-list">
            {summary.decisions.map((decision) => <div key={decision.key}>
              <code>{decision.key}</code> · attendu : {decision.reference ?? 'non renseigné'}
              {' · '}réponses : {decision.choices.join(', ')}
              {decision.stableAndResolved ? ' · stable' : ''}
            </div>)}
          </div>
        </div>)}
      </details>
    </div>}
  </section>;
}
