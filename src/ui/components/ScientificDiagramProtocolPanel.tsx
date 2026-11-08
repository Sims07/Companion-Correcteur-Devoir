import { useState } from 'react';
import type { AiModelProfile } from '../../domain/aiModelProfiles.ts';
import type { Rubric } from '../../domain/rubric.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import { getRubricSubcriteria, validateRubric } from '../../domain/rubric.ts';
import { Button, TextArea } from '../design-system/index.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';
import { FilePicker } from './FilePicker.tsx';
import cleanDiagramUrl from '../../assets/pilot/scientific-mitosis-10.webp';
import intermediateDiagramUrl from '../../assets/pilot/scientific-mitosis-5.webp';
import poorDiagramUrl from '../../assets/pilot/scientific-mitosis-0.webp';
import correctPointerDiagramUrl from '../../assets/pilot/scientific-mitosis-labels-control.svg';
import swappedPointerDiagramUrl from '../../assets/pilot/scientific-mitosis-labels-swapped.svg';
import { SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, SCIENTIFIC_DIAGRAM_FIXTURES, SCIENTIFIC_DIAGRAM_BASE_CASE_IDS, SCIENTIFIC_DIAGRAM_POINTER_CASE_IDS, type ScientificDiagramFixtureId, type buildScientificDiagramFixtureReport } from '../../domain/scientificDiagramFixtures.ts';
import {
  SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, diagramMethodIssue, diagramMethodLabels, selectDiagramMethods,
  diagramTargetKey, parseScientificDiagramProtocolRubric, type DiagramMethodSelection,
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
  methodSelection: DiagramMethodSelection;
}
type DiagramReport = ReturnType<typeof buildScientificDiagramProtocolReport>;
type FixtureReport = ReturnType<typeof buildScientificDiagramFixtureReport>;

/** Export remains available from the AI tools even when this panel is unmounted. */
export function downloadScientificDiagramJson(report: DiagramReport | FixtureReport, filename: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Safari may need the object URL to survive the current click task.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fixtureImageUrls: Record<ScientificDiagramFixtureId, string> = {
  A: cleanDiagramUrl, B: intermediateDiagramUrl, C: poorDiagramUrl,
  D: correctPointerDiagramUrl, E: swappedPointerDiagramUrl,
};

/** Vector test images are rasterized on this device before entering the
 * normal image-preparation path. Models receive PNG pixels, not SVG markup. */
async function prepareBundledDiagramFile(id: ScientificDiagramFixtureId): Promise<File> {
  const response = await fetch(fixtureImageUrls[id], { cache: 'force-cache' });
  if (!response.ok) throw new Error('Image intégrée indisponible pour le cas ' + id);
  const blob = await response.blob();
  if (id !== 'D' && id !== 'E') {
    return new File([blob], 'mitose-' + id + '.webp', { type: 'image/webp' });
  }
  const blobUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = blobUrl;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Dimensions du dessin impossibles à lire.');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Conversion locale du dessin impossible.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (result) => result ? resolve(result) : reject(new Error('Conversion PNG impossible.')), 'image/png',
    ));
    return new File([png], 'mitose-' + id + '.png', { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export interface ScientificDiagramProtocolPanelProps {
  selectedProfiles: readonly AiModelProfile[];
  busy: boolean;
  progress: string;
  onPrepareImages: (files: File[]) => Promise<ImageInput[]>;
  onRun: (request: DiagramProtocolRequest) => Promise<DiagramReport>;
  onRunFixtures: (request: {
    cases: Array<{ id: ScientificDiagramFixtureId; images: ImageInput[] }>;
    repetitions: DiagramProtocolCount;
    methodSelection: DiagramMethodSelection;
  }) => Promise<FixtureReport>;
  onStop: () => void;
  report: DiagramReport | null;
  fixtureReport: FixtureReport | null;
  onClearReport: () => void;
  onClearFixtureReport: () => void;
}

export function ScientificDiagramProtocolPanel({
  selectedProfiles, busy, progress, onPrepareImages, onRun, onRunFixtures, onStop,
  report, fixtureReport, onClearReport, onClearFixtureReport,
}: ScientificDiagramProtocolPanelProps) {
  const [rubric, setRubric] = useState<Rubric>(() => structuredClone(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC));
  const [context, setContext] = useState('');
  const [images, setImages] = useState<ImageInput[]>([]);
  const [uploading, setUploading] = useState(false);
  const [repetitions, setRepetitions] = useState<DiagramProtocolCount>(3);
  const [gold, setGold] = useState<DiagramGold>({});
  const [message, setMessage] = useState('');
  const [fixtureCount, setFixtureCount] = useState<DiagramProtocolCount>(1);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [fixtureMessage, setFixtureMessage] = useState('');
  const [methodSelection, setMethodSelection] = useState<DiagramMethodSelection>('compare');
  const targets = rubric.criteria.flatMap((criterion) =>
    getRubricSubcriteria(criterion).map((item) => ({ criterion, item, key: diagramTargetKey(criterion.id, item.id) })));
  const validation = validateRubric(rubric);
  const profileIssues = selectedProfiles.map((profile) => diagramMethodIssue(profile, methodSelection)).filter((issue): issue is string => Boolean(issue));
  const hasRemote = selectedProfiles.some((profile) => {
    try { return !['localhost', '127.0.0.1', '[::1]'].includes(new URL(profile.configuration.endpoint).hostname); }
    catch { return true; }
  });
  const canRun = !busy && !uploading && !fixtureLoading && images.length > 0 && validation.valid && selectedProfiles.length > 0 && profileIssues.length === 0;
  const canRunFixtures = !busy && !uploading && !fixtureLoading && selectedProfiles.length > 0 && profileIssues.length === 0;

  async function runPreparedFixtures(ids: readonly ScientificDiagramFixtureId[]) {
    if (!canRunFixtures) return;
    setFixtureLoading(true);
    onClearFixtureReport();
    setFixtureMessage('Chargement des schémas intégrés…');
    try {
      const cases: Array<{ id: ScientificDiagramFixtureId; images: ImageInput[] }> = [];
      for (const id of ids) {
        // Vite bundles and precaches the images with the application. Nothing
        // is fetched from a third-party image service or sent to a cloud here.
        const file = await prepareBundledDiagramFile(id);
        const prepared = await onPrepareImages([file]);
        if (!prepared.length) throw new Error('Le schéma ' + id + ' n’a pas pu être préparé.');
        cases.push({ id, images: prepared });
      }
      setFixtureMessage('');
      const result = await onRunFixtures({ cases, repetitions: fixtureCount, methodSelection });
      const completed = result.cases.reduce((sum, item) => sum + item.experiments.length, 0);
      setFixtureMessage(completed + ' passage(s) terminés. Comparez les notes et les verdicts, puis exportez le rapport.');
    } catch (cause) {
      setFixtureMessage('Protocole interrompu : ' + (cause instanceof Error ? cause.message : String(cause)));
    } finally {
      setFixtureLoading(false);
    }
  }

  function downloadFixtureReport() {
    if (fixtureReport) downloadScientificDiagramJson(fixtureReport, 'companion-trois-schemas-scientifiques.json');
  }

  async function copyFixtureReport() {
    if (!fixtureReport) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(fixtureReport, null, 2));
      setFixtureMessage('Rapport des trois dessins copié : collez-le dans notre conversation.');
    } catch {
      setFixtureMessage('Copie bloquée : utilisez « Exporter le rapport JSON ».');
    }
  }

  async function importRubric(files: FileList | null) {
    if (!files?.length || busy || uploading) return;
    try {
      const imported = parseScientificDiagramProtocolRubric(JSON.parse(await files[0]!.text()) as unknown);
      setRubric(imported);
      setGold({});
      onClearReport();
      setMessage('Barème importé localement : ' + imported.criteria.length + ' critères. Les critères de compréhension sans sous-critères ont été exclus.');
    } catch (cause) {
      setMessage('Import refusé : ' + (cause instanceof Error ? cause.message : String(cause)));
    }
  }

  async function importImages(files: FileList | null) {
    if (!files?.length || busy || uploading) return;
    setUploading(true);
    setImages([]);
    onClearReport();
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
    onClearReport();
    setMessage('');
    try {
      const completed = await onRun({
        rubric: structuredClone(rubric), context: context.trim(),
        images, gold: { ...gold }, repetitions, methodSelection,
      });
      setMessage(completed.experiments.length ? 'Mesures disponibles : le rapport ne contient aucune photographie.' : 'Aucun essai terminé.');
    } catch (cause) {
      setMessage('Erreur du protocole : ' + (cause instanceof Error ? cause.message : String(cause)));
    }
  }

  function exportReport() {
    if (report) downloadScientificDiagramJson(report, 'companion-protocole-schema-scientifique.json');
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
        <p className="eyebrow">LABORATOIRE · SCHÉMA SCIENTIFIQUE</p>
        <h3>Mode expérimental — schéma scientifique</h3>
        <p>Comparez les méthodes de correction sur les mêmes dessins et les mêmes critères : lecture puis analyse, analyse générative directe sur image, et décision System One directe lorsque compatible. Aucun changement au parcours de correction des copies.</p>
      </div>
    </div>
    <div className="diagram-fixture-run-controls">
      <label htmlFor="diagram-method-selection">Méthode de correction scientifique à tester</label>
      <DesignSystemSelect id="diagram-method-selection" value={methodSelection} disabled={busy || fixtureLoading || uploading}
        onChange={(event) => {
          setMethodSelection(event.currentTarget.value as DiagramMethodSelection);
          onClearReport();
          onClearFixtureReport();
        }}>
        <option value="compare">Comparer toutes les méthodes compatibles (recommandé)</option>
        <option value="vision-then-analysis">Vision puis analyse — 2 étapes</option>
        <option value="direct-image-generative">Image → modèle génératif — sans OCR</option>
        <option value="direct-image-systemone">Image → décisionnel System One — sans OCR</option>
      </DesignSystemSelect>
      <p className="pilot-evaluation-hint">Les méthodes sont choisies dans ce laboratoire uniquement. Un profil génératif peut comparer deux étapes et image directe ; D1/D3 compatibles peuvent comparer deux étapes et System One image. TEV1 n’utilise l’image que via la transcription préalable. Le modèle et la méthode figurent séparément dans l’export.</p>
    </div>
    <section className="diagram-protocol-fixtures" aria-label="Schémas de référence intégrés">
      <div className="diagram-protocol-fixtures-heading">
        <div>
          <h4>Cinq schémas prêts à tester — dont deux pièges de légendes</h4>
          <p>A/B/C : difficulté progressive. D/E : <strong>mêmes mots et mêmes structures</strong>, mais quatre flèches volontairement inversées en E. Barème sur 10 points et références provisoires à valider par un enseignant. La différence attendue ne sera jamais envoyée au modèle.</p>
        </div>
      </div>
      <div className="diagram-fixture-grid">
        {SCIENTIFIC_DIAGRAM_FIXTURES.map((fixture) => <article key={fixture.id} className="diagram-fixture-card">
          <img src={fixtureImageUrls[fixture.id]} alt={'Schéma de mitose végétale — ' + fixture.label} loading="lazy" />
          <div className="diagram-fixture-card-body">
            <div className="diagram-fixture-card-title">
              <strong>{fixture.label}</strong>
              <span>{fixture.referenceScore}/10 attendu</span>
            </div>
            <p>{fixture.description}</p>
            {fixture.labelPointerChallenge && <details>
              <summary>Voir les correspondances à vérifier</summary>
              <p>{fixture.labelPointerChallenge.expected === 'incorrect' ? 'Flèches erronées attendues :' : 'Témoin sans erreur de flèche :'}</p>
              <ul>{fixture.labelPointerChallenge.descriptions.map((description) => <li key={description}>{description}</li>)}</ul>
            </details>}
            {fixture.referenceReview && <details>
              <summary>Voir le détail de la référence provisoire</summary>
              <p>Revue visuelle du {fixture.referenceReview.reviewedOn} — à valider par un enseignant. Les points partiels restent des appréciations.</p>
              <ul>{SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.flatMap(criterion => (criterion.subcriteria ?? []).map(sub =>
                <li key={sub.id}><strong>{sub.title} : {fixture.referencePoints[criterion.id + '::' + sub.id]}/{sub.maxPoints}</strong> — {fixture.referenceReview?.notes[sub.id]}</li>
              ))}</ul>
            </details>}
            <Button variant="secondary" disabled={!canRunFixtures}
              onClick={() => { void runPreparedFixtures([fixture.id]); }}>
              Tester ce schéma
            </Button>
          </div>
        </article>)}
      </div>
      <div className="diagram-fixture-run-controls">
        <div className="pilot-evaluation-actions">
          <label htmlFor="diagram-fixture-repeat-count">Passages par schéma</label>
          <DesignSystemSelect id="diagram-fixture-repeat-count" value={fixtureCount} disabled={busy || fixtureLoading}
            onChange={(event) => setFixtureCount(event.currentTarget.value === '5' ? 5 : event.currentTarget.value === '3' ? 3 : 1)}>
            <option value={1}>1 passage rapide</option>
            <option value={3}>3 répétitions</option>
            <option value={5}>5 répétitions</option>
          </DesignSystemSelect>
          <Button disabled={!canRunFixtures} onClick={() => { void runPreparedFixtures(SCIENTIFIC_DIAGRAM_BASE_CASE_IDS); }}>
            Tester les 3 schémas en un clic
          </Button>
          <Button variant="secondary" disabled={!canRunFixtures}
            onClick={() => { void runPreparedFixtures(SCIENTIFIC_DIAGRAM_POINTER_CASE_IDS); }}>
            Tester les flèches D/E en un clic
          </Button>
          {(busy || fixtureLoading) && <Button variant="secondary" onClick={onStop} disabled={!busy}>Arrêter après l’appel en cours</Button>}
        </div>
        <p className="pilot-evaluation-hint">Choisissez 1 à 3 configurations ci-dessous. Pour une comparaison équitable, le même barème et les mêmes images sont utilisés à chaque passage, par méthode et par profil. Exécution séquentielle. Un seul passage ne mesure pas la répétabilité.</p>
        {hasRemote && <p className="pilot-evaluation-hint" role="status">Une configuration distante est sélectionnée : les photos seront envoyées uniquement à son serveur configuré.</p>}
        {profileIssues.map((issue) => <p className="pilot-evaluation-hint" role="status" key={'fixture-' + issue}>{issue}</p>)}
        {(fixtureMessage || (busy && progress)) && <p role="status" className="pilot-evaluation-message">{fixtureMessage || progress}</p>}
      </div>
      {fixtureReport && <section className="pilot-evaluation-report" aria-label="Résultats des schémas A B C">
        <div className="pilot-evaluation-report-head">
          <div><h4>Comparaison aux notes de référence</h4><p>{busy || fixtureLoading ? 'Rapport partiel : les passages terminés sont déjà exportables. ' : ''}La note reste « Non noté » lorsque le modèle demande une revue. Les décisions System One sont mesurées séparément, même si la note finale reste indisponible.</p></div>
          <div className="pilot-evaluation-report-actions">
            <Button variant="secondary" onClick={() => { void copyFixtureReport(); }}>Copier le rapport pour ChatGPT</Button>
            <Button variant="secondary" onClick={downloadFixtureReport}>Exporter le rapport JSON</Button>
          </div>
        </div>
        <div className="pilot-evaluation-table-scroll">
          <table className="pilot-evaluation-table">
            <thead><tr><th>Schéma</th><th>Configuration</th><th>Parcours</th><th>Attendu</th><th>Notes obtenues</th><th>Exécution</th><th>Décisions récupérées</th><th>Justesse stricte</th><th>Légendes et flèches</th><th>Stabilité</th><th>Temps moyen</th></tr></thead>
            <tbody>{fixtureReport.cases.flatMap((caseResult) => caseResult.summaries.map((summary) => {
              const experiments = caseResult.experiments.filter((experiment) => experiment.profileId === summary.profileId && experiment.method === summary.method);
              return <tr key={caseResult.caseId + '-' + summary.profileId + '-' + summary.method}>
                <th scope="row">{caseResult.label}</th>
                <td>{summary.profileName}</td>
                <td>{diagramMethodLabels[summary.method]}</td>
                <td>{caseResult.referenceScore}/10</td>
                <td>{experiments.map((experiment) => experiment.score === null ? 'Non noté' : experiment.score + '/10').join(' · ')}</td>
                <td>
                  {experiments.map((experiment) => {
                    if (experiment.status !== 'success') {
                      return experiment.failureCategory === 'model-unavailable' ? 'Modèle indisponible'
                        : experiment.failureCategory === 'connection' ? 'Connexion échouée'
                        : experiment.failureCategory === 'system-one-unavailable' ? 'System One indisponible'
                        : experiment.failureCategory === 'generation-limit' ? 'Limite de génération atteinte'
                        : experiment.failureCategory === 'invalid-or-incomplete-output' ? 'Réponse JSON invalide ou incomplète'
                        : experiment.failureCategory === 'timeout' ? 'Délai dépassé'
                        : 'Échec de traitement (cause à consulter localement)';
                    }
                    return experiment.scoreStatus === 'scored' ? 'Notée'
                      : experiment.scoreStatus === 'teacher-review-required' ? 'Arbitrage nécessaire'
                      : 'Réponse non notée';
                  }).join(' · ')}
                  {experiments.some((experiment) => experiment.status !== 'success' && experiment.diagnostics.analysisCalls > 0)
                    && <small className="diagram-protocol-diagnostic">
                      {experiments.filter((experiment) => experiment.status !== 'success' && experiment.diagnostics.analysisCalls > 0)
                        .map((experiment) => experiment.diagnostics.analysisCalls + ' appel(s) IA, '
                          + experiment.diagnostics.repairCalls + ' réparation(s)'
                          + (experiment.diagnostics.generationLimitHits
                            ? ', ' + experiment.diagnostics.generationLimitHits + ' arrêt(s) sur limite' : '')
                          + (experiment.diagnostics.generationBudgetTokens
                            ? ', plafond ' + experiment.diagnostics.generationBudgetTokens + ' tokens/appel' : '')
                        ).join(' · ')}
                    </small>}
                </td>
                <td>{summary.resolvedDecisions}/{summary.totalDecisions}</td>
                <td>{summary.accuracyPercent === null ? 'Non mesurable' : summary.accuracyPercent + ' %'}</td>
                <td>{caseResult.labelPointerChallenge
                  ? (() => {
                    const target = summary.decisions.find((decision) => decision.key === caseResult.labelPointerChallenge?.criterionKey);
                    if (!target) return 'Non mesurable';
                    const expected = caseResult.labelPointerChallenge.expected === 'correct' ? 'present' : 'absent';
                    const correct = target.choices.filter((choice) => choice === expected).length;
                    return correct + '/' + target.choices.length + ' détection(s)';
                  })() : '—'}</td>
                <td>{summary.stableResolvedTargets === null ? 'Non mesurée' : summary.stableResolvedTargets + '/' + summary.totalTargets}</td>
                <td>{summary.meanDurationMs === null ? '—' : (summary.meanDurationMs / 1000).toFixed(1) + ' s'}</td>
              </tr>;
            }))}</tbody>
          </table>
        </div>
        <details className="pilot-evaluation-reference">
          <summary>Voir les décisions attendues et obtenues sur chaque dessin</summary>
          {fixtureReport.cases.filter((item) => item.summaries.length).map((caseResult) => <div key={caseResult.caseId}>
            <strong>{caseResult.label} — référence {caseResult.referenceScore}/10</strong>
            {caseResult.summaries.map((summary) => <div key={summary.profileId + '-' + summary.method} className="diagram-protocol-decision-list">
              <strong>{summary.profileName} — {summary.model} · {diagramMethodLabels[summary.method]}</strong>
              {summary.decisions.map((decision) => <div key={decision.key}>
                <code>{decision.key}</code> · référence : {decision.reference ?? 'non renseignée'}
                {' · '}réponses : {decision.choices.join(', ')}
              </div>)}
            </div>)}
          </div>)}
        </details>
        <p className="pilot-evaluation-hint">Une exécution « Réussie » sans note peut contenir des choix utilisables ; inspectez « Décisions récupérées ». Une configuration échouée avant lecture peut être indisponible ou mal paramétrée : l’erreur précise figure dans Observabilité, pas dans cet export sans informations de connexion.</p>
        <p className="pilot-evaluation-hint">{fixtureReport.limitations}</p>
      </section>}
    </section>
    <div className="diagram-protocol-inputs">
      <div className="diagram-protocol-import">
        <h4>1. Schéma et barème</h4>
        <FilePicker id="diagram-protocol-photos" title="Schéma à analyser" description="Photo(s) ou PDF du même schéma ; pages conservées ensemble dans un seul essai" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" multiple disabled={busy || uploading} onFilesSelected={(files) => { void importImages(files); }} />
        <p className="pilot-evaluation-hint">{uploading ? 'Préparation locale…' : images.length ? images.length + ' page(s) prêtes' : 'Aucune image fournie.'}</p>
        <FilePicker id="diagram-protocol-rubric" title="Barème du professeur (JSON)" description="Par défaut : 15 attendus visuels, 8 points. Importez un barème propre au sujet pour évaluer aussi la compréhension." accept=".json,application/json" disabled={busy || uploading} onFilesSelected={(files) => { void importRubric(files); }} />
        <p className="pilot-evaluation-hint">Barème actif : <strong>{rubric.title}</strong> — {validation.maximumPoints} points, {targets.length} attendu{targets.length > 1 ? 's' : ''}. Les 2 points « Compréhension » de l’exemple sont exclus par défaut : ils nécessitent des structures attendues propres au schéma.</p>
        <label htmlFor="diagram-protocol-context">Contexte biologique du dessin (facultatif pour les seuls critères de présentation)</label>
        <TextArea id="diagram-protocol-context" rows={2} disabled={busy} value={context}
          onChange={(event) => { setContext(event.currentTarget.value); onClearReport(); }}
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
                    onClearReport();
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
        profile.name + ' (' + selectDiagramMethods(profile, methodSelection).map((method) => diagramMethodLabels[method]).join(' / ') + ')').join(' · ') :
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
          <tbody>{report.summaries.map((summary) => <tr key={summary.profileId + '-' + summary.method}>
            <th scope="row">{summary.profileName} · {summary.model}</th>
            <td>{diagramMethodLabels[summary.method]}</td>
            <td>{summary.runsCompleted}/{summary.plannedRepetitions}</td>
            <td>{summary.accuracyPercent === null ? 'Non mesurable' : summary.accuracyPercent + ' %'}{summary.labelledTargets ? ' (' + summary.labelledTargets + ' références)' : ''}</td>
            <td>{summary.coveragePercent === null ? '—' : summary.coveragePercent + ' %'}</td>
            <td>{summary.stableResolvedTargets === null ? 'Série incomplète' : summary.stableResolvedTargets + '/' + summary.totalTargets}</td>
            <td>{summary.meanDurationMs === null ? '—' : (summary.meanDurationMs / 1000).toFixed(1) + ' s'}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="pilot-evaluation-hint">{report.limitations} Le rapport n’exporte ni images, ni réponses brutes, ni clés API, ni adresses de serveur.</p>
      <details className="pilot-evaluation-reference">
        <summary>Voir les décisions par sous-critère et par passage</summary>
        {report.summaries.map((summary) => <div key={summary.profileId + '-' + summary.method}>
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
