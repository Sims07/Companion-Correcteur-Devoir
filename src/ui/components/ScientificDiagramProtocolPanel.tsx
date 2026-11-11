import { BlindGraphRunDetails } from './BlindGraphRunDetails.tsx';
import { useEffect, useRef, useState } from 'react';
import type { AiModelProfile } from '../../domain/aiModelProfiles.ts';
import { radarPlanDescription, RADAR_TEST_PROTOCOL_NAMES, type RadarMissingTestRequest, type RadarTestStep } from '../../domain/diagramLabRadarLaunch.ts';
import { isLoopbackPilotEndpoint } from '../../domain/pilotEvaluationProtocol.ts';
import { buildBlindVisualObservationReport, blindGraphProfileIssue, blindGraphVisionModel, type BlindGraphPromptVariant } from '../../domain/scientificDiagramBlindGraph.ts';
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
import { DIAGRAM_SENSITIVITY_CASES, DIAGRAM_SENSITIVITY_CASE_IDS, scientificDiagramSensitivitySvg, scientificDiagramSensitivityPreviewUrl, diagramSensitivityContext,
  type DiagramSensitivityCaseId, type DiagramSensitivityPromptMode, type buildScientificDiagramSensitivityReport } from '../../domain/scientificDiagramSensitivity.ts';
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
type SensitivityReport = ReturnType<typeof buildScientificDiagramSensitivityReport>;
type BlindGraphReport = ReturnType<typeof buildBlindVisualObservationReport>;

/** Export remains available from the AI tools even when this panel is unmounted. */
export function downloadScientificDiagramJson(report: DiagramReport | FixtureReport | SensitivityReport | BlindGraphReport, filename: string) {
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

/** Always rasterize synthetic SVGs in the browser before sending pixels to the
 * ordinary evaluator. Never send an SVG as a prompt or to a model endpoint. */
async function prepareSensitivityImage(id: DiagramSensitivityCaseId): Promise<File> {
  const svg = new Blob([scientificDiagramSensitivitySvg(id)], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Schéma vectoriel non lisible.');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Conversion locale impossible.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Création du PNG impossible.')), 'image/png',
    ));
    return new File([png], 'relations-' + id + '.png', { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
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
  onRunSensitivity: (request: {
    cases: Array<{ id: DiagramSensitivityCaseId; images: ImageInput[]; promptMode: DiagramSensitivityPromptMode; context: string }>;
    promptModes: DiagramSensitivityPromptMode[];
    repetitions: DiagramProtocolCount;
    methodSelection: DiagramMethodSelection;
  }) => Promise<SensitivityReport>;
  onRunBlindGraph: (request: {
    cases: Array<{ id: DiagramSensitivityCaseId; images: ImageInput[] }>;
    repetitions: DiagramProtocolCount;
    zoomUncertainArrows?: boolean;
    promptVariant?: BlindGraphPromptVariant;
  }) => Promise<BlindGraphReport>;
  onStop: () => void;
  report: DiagramReport | null;
  fixtureReport: FixtureReport | null;
  sensitivityReport: SensitivityReport | null;
  blindGraphReport: BlindGraphReport | null;
  onClearReport: () => void;
  onClearFixtureReport: () => void;
  onClearSensitivityReport: () => void;
  onClearBlindGraphReport: () => void;
  autoRequest?: RadarMissingTestRequest | null;
  onAutoRequestConsumed?: (id: number) => void;
  onOpenRadar?: () => void;
  onAutoBusyChange?: (busy: boolean) => void;
  onAutoEvaluationFinished?: (request: RadarMissingTestRequest, steps: readonly { protocol: RadarTestStep['protocol']; complete: boolean }[]) => Promise<string>;
  onAutoWasStopped?: () => boolean;
}

export function ScientificDiagramProtocolPanel({
  selectedProfiles, busy, progress, onPrepareImages, onRun, onRunFixtures, onStop,
  report, fixtureReport, sensitivityReport, blindGraphReport,
  onClearReport, onClearFixtureReport, onClearSensitivityReport, onClearBlindGraphReport,
  onRunSensitivity, onRunBlindGraph, autoRequest, onAutoRequestConsumed, onOpenRadar, onAutoBusyChange, onAutoEvaluationFinished, onAutoWasStopped,
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
  const [sensitivityLoading, setSensitivityLoading] = useState(false);
  const [blindGraphLoading, setBlindGraphLoading] = useState(false);
  const [blindGraphMessage, setBlindGraphMessage] = useState('');
  const [blindGraphPromptVariant, setBlindGraphPromptVariant] = useState<BlindGraphPromptVariant>('baseline');
  const [sensitivityMessage, setSensitivityMessage] = useState('');
  const [sensitivityPromptSelection, setSensitivityPromptSelection] = useState<'standard' | 'guided' | 'compare'>('standard');
  const [methodSelection, setMethodSelection] = useState<DiagramMethodSelection>('compare');
  const [activeProtocol, setActiveProtocol] = useState<'reference' | 'arrows' | 'semantic' | 'graph'>('reference');
  const autoClaimed = useRef<number | null>(null);
  const autoStopRequested = useRef(false);
  function stopProtocol() {
    autoStopRequested.current = true;
    onStop();
  }
  const [radarAutoStatus, setRadarAutoStatus] = useState('');
  const [autoSequenceRunning, setAutoSequenceRunning] = useState(false);
  const targets = rubric.criteria.flatMap((criterion) =>
    getRubricSubcriteria(criterion).map((item) => ({ criterion, item, key: diagramTargetKey(criterion.id, item.id) })));
  const validation = validateRubric(rubric);
  const profileIssues = selectedProfiles.map((profile) => diagramMethodIssue(profile, methodSelection)).filter((issue): issue is string => Boolean(issue));
  const hasRemote = selectedProfiles.some((profile) => {
    try { return !['localhost', '127.0.0.1', '[::1]'].includes(new URL(profile.configuration.endpoint).hostname); }
    catch { return true; }
  });
  const canRun = !busy && !uploading && !fixtureLoading && !sensitivityLoading && !blindGraphLoading && images.length > 0 && validation.valid && selectedProfiles.length > 0 && profileIssues.length === 0;
  const canRunFixtures = !busy && !uploading && !fixtureLoading && !sensitivityLoading && !blindGraphLoading && selectedProfiles.length > 0 && profileIssues.length === 0;
  const blindGraphIssue = selectedProfiles.length === 0
    ? 'Sélectionnez au moins une configuration dans « Configurations à exécuter » plus haut.'
    : selectedProfiles.map(blindGraphProfileIssue).find((issue): issue is string => Boolean(issue)) ?? null;
  const canRunBlindGraph = !busy && !uploading && !fixtureLoading && !sensitivityLoading && !blindGraphLoading &&
    !blindGraphIssue;
  const blindGraphUsesRemote = selectedProfiles.some((profile) => !isLoopbackPilotEndpoint(profile.configuration.endpoint));

  async function runBlindObservation(zoomUncertainArrows = false, override?: RadarTestStep): Promise<boolean> {
    if (!override && !canRunBlindGraph) return false;
    setBlindGraphLoading(true);
    onClearBlindGraphReport();
    setBlindGraphMessage('Préparation des six schémas…' +
      (blindGraphUsesRemote ? ' Les images seront envoyées au serveur distant sélectionné.' : ''));
    try {
      const cases: Array<{ id: DiagramSensitivityCaseId; images: ImageInput[] }> = [];
      for (const id of DIAGRAM_SENSITIVITY_CASE_IDS) {
        const prepared = await onPrepareImages([await prepareSensitivityImage(id)]);
        if (!prepared.length) throw new Error('Préparation impossible pour ' + id);
        cases.push({ id, images: prepared });
      }
      const result = await onRunBlindGraph({ cases, repetitions: override?.repetitions ?? fixtureCount,
        zoomUncertainArrows, promptVariant: override?.graphVariant ?? blindGraphPromptVariant });
      setBlindGraphMessage(result.cases.reduce((sum, item) => sum + item.experiments.length, 0) +
        ' observation(s) effectuée(s). Vérifiez les inconnues avant de comparer les méthodes.');
      return result.cases.every((item) =>
        item.experiments.length >= (override?.repetitions ?? fixtureCount)
        && item.experiments.length % (override?.repetitions ?? fixtureCount) === 0
        && item.experiments.every((run) => run.status === 'success'));
    } catch (cause) {
      setBlindGraphMessage('Observation interrompue : ' +
        (cause instanceof Error ? cause.message : String(cause)));
      return false;
    } finally {
      setBlindGraphLoading(false);
    }
  }

  async function runSensitivity(override?: RadarTestStep): Promise<boolean> {
    if (!override && !canRunFixtures) return false;
    setSensitivityLoading(true);
    onClearSensitivityReport();
    setSensitivityMessage('Préparation des six variantes…');
    try {
      const images = new Map<DiagramSensitivityCaseId, ImageInput[]>();
      for (const id of DIAGRAM_SENSITIVITY_CASE_IDS) {
        const prepared = await onPrepareImages([await prepareSensitivityImage(id)]);
        if (!prepared.length) throw new Error('Préparation impossible pour ' + id);
        images.set(id, prepared);
      }
      const requestedMode = override?.promptMode ?? sensitivityPromptSelection;
      const promptModes: DiagramSensitivityPromptMode[] = requestedMode === 'compare'
        ? ['standard', 'guided'] : [requestedMode];
      const cases = promptModes.flatMap((promptMode) =>
        DIAGRAM_SENSITIVITY_CASE_IDS.map((id) => ({
          id, promptMode, context: diagramSensitivityContext(promptMode), images: images.get(id)!,
        })));
      setSensitivityMessage('');
      const completed = await onRunSensitivity({ cases, promptModes,
        repetitions: override?.repetitions ?? fixtureCount, methodSelection: override?.method ?? methodSelection });
      const count = completed.cases.reduce((sum, item) => sum + item.experiments.length, 0);
      setSensitivityMessage(count + ' essai(s) terminés. Vérifiez les écarts, les abstentions et les faux positifs.');
      return completed.cases.every((item) => item.experiments.length >=
        (override?.repetitions ?? fixtureCount) &&
        item.experiments.length % (override?.repetitions ?? fixtureCount) === 0 &&
        item.experiments.every((run) => run.status === 'success'));
    } catch (cause) {
      setSensitivityMessage('Série interrompue : ' + (cause instanceof Error ? cause.message : String(cause)));
      return false;
    } finally {
      setSensitivityLoading(false);
    }
  }

  async function runPreparedFixtures(ids: readonly ScientificDiagramFixtureId[], override?: RadarTestStep): Promise<boolean> {
    if (!override && !canRunFixtures) return false;
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
      const result = await onRunFixtures({ cases, repetitions: override?.repetitions ?? fixtureCount,
        methodSelection: override?.method ?? methodSelection });
      const completed = result.cases.reduce((sum, item) => sum + item.experiments.length, 0);
      setFixtureMessage(completed + ' passage(s) terminés. Comparez les notes et les verdicts, puis exportez le rapport.');
      return ids.every((id) => {
        const experiments = result.cases.find((item) => item.caseId === id)?.experiments ?? [];
        return experiments.length >= (override?.repetitions ?? fixtureCount) &&
          experiments.length % (override?.repetitions ?? fixtureCount) === 0 &&
          experiments.every((run) => run.status === 'success');
      });
    } catch (cause) {
      setFixtureMessage('Protocole interrompu : ' + (cause instanceof Error ? cause.message : String(cause)));
      return false;
    } finally {
      setFixtureLoading(false);
    }
  }

  // A radar action is consumed exactly once. It uses the same bundled images,
  // preparers and runners as the manual test buttons. Wait until the requested
  // saved profile has been selected by the parent before calling any endpoint.
  useEffect(() => {
    if (!autoRequest || autoClaimed.current === autoRequest.id || busy ||
      fixtureLoading || sensitivityLoading || blindGraphLoading || uploading) return;
    if (selectedProfiles.length !== 1 || selectedProfiles[0]?.id !== autoRequest.profileId) return;

    autoClaimed.current = autoRequest.id;
    autoStopRequested.current = false;
    onAutoRequestConsumed?.(autoRequest.id);
    const profile = selectedProfiles[0]!;
    const issue = autoRequest.steps.map((step) =>
      step.protocol === 'graph' ? blindGraphProfileIssue(profile) : diagramMethodIssue(profile, step.method))
      .find((reason): reason is string => Boolean(reason));
    if (issue) {
      setRadarAutoStatus('Lancement impossible pour ' + profile.name + ' : ' + issue);
      return;
    }
    setRadarAutoStatus('Lancement depuis le radar : ' + radarPlanDescription(autoRequest.steps) + '.');
    setAutoSequenceRunning(true);
    onAutoBusyChange?.(true);
    void (async () => {
      const stepResults: Array<{ protocol: RadarTestStep['protocol']; complete: boolean }> = [];
      try {
      for (const [index, step] of autoRequest.steps.entries()) {
        setActiveProtocol(step.protocol);
        setFixtureCount(step.repetitions);
        setMethodSelection(step.method);
        setSensitivityPromptSelection(step.promptMode);
        setBlindGraphPromptVariant(step.graphVariant);
        setRadarAutoStatus('Batterie ' + (index + 1) + '/' + autoRequest.steps.length
          + ' : ' + RADAR_TEST_PROTOCOL_NAMES[step.protocol] + ' pour ' + profile.name + '.');
        const ok = step.protocol === 'reference'
          ? await runPreparedFixtures(SCIENTIFIC_DIAGRAM_BASE_CASE_IDS, step)
          : step.protocol === 'arrows'
            ? await runPreparedFixtures(SCIENTIFIC_DIAGRAM_POINTER_CASE_IDS, step)
            : step.protocol === 'semantic'
              ? await runSensitivity(step)
              : await runBlindObservation(step.zoom, step);
        stepResults.push({ protocol: step.protocol, complete: ok });
        if (autoStopRequested.current || onAutoWasStopped?.()) {
          setRadarAutoStatus('Campagne interrompue après ' + (index + 1) +
            '/' + autoRequest.steps.length + ' batteries. Les résultats déjà enregistrés restent consultables.');
          return;
        }
        // Each battery is independent. An unusable A/B/C run must not prevent
        // a still-needed D/E, semantic or graph measurement from being tried.
      }
      const failed = stepResults.filter((step) => !step.complete).map((step) => RADAR_TEST_PROTOCOL_NAMES[step.protocol]);
      const result = onAutoEvaluationFinished
        ? await onAutoEvaluationFinished(autoRequest, stepResults)
        : failed.length ? 'Campagne partielle pour ' + profile.name + ' : batteries incomplètes : ' +
          failed.join(', ') + '. Consultez les campagnes pour les détails.'
          : 'Batteries terminées pour ' + profile.name + '. Consultez le radar pour vérifier les mesures.';
      setRadarAutoStatus(result);
      } catch (cause) {
        setRadarAutoStatus('Vérification du radar impossible pour ' + profile.name + ' : ' +
          (cause instanceof Error ? cause.message : String(cause)) + '. Consultez les campagnes enregistrées.');
      } finally {
        setAutoSequenceRunning(false);
        onAutoBusyChange?.(false);
      }
    })();
    // Intentional once-per-request orchestration: each caller is bound to the
    // user-selected profile and the request ID is claimed synchronously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRequest, busy, fixtureLoading, sensitivityLoading, blindGraphLoading, uploading, selectedProfiles]);

  function downloadBlindGraphReport() {
    if (blindGraphReport) downloadScientificDiagramJson(blindGraphReport, 'companion-graphe-visuel.json');
  }

  function downloadSensitivityReport() {
    if (sensitivityReport) downloadScientificDiagramJson(sensitivityReport, 'companion-sensibilite-semantique.json');
  }

  function downloadFixtureReport() {
    if (fixtureReport) downloadScientificDiagramJson(fixtureReport, 'companion-schemas-scientifiques.json');
  }

  async function copyFixtureReport() {
    if (!fixtureReport) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(fixtureReport, null, 2));
      setFixtureMessage('Rapport des dessins scientifiques copié : collez-le dans notre conversation.');
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
      setMessage('Barème importé : ' + imported.criteria.length + ' critères. Les critères de compréhension sans sous-critères ont été exclus.');
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
      setMessage(prepared.length + ' page(s) préparée(s). Les mêmes pages serviront aux répétitions.');
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
    <h3 className="evaluation-visually-hidden">Schémas scientifiques · batteries de tests</h3>
    {radarAutoStatus && !autoSequenceRunning && <div className="diagram-radar-return-note" role="status" aria-label="Résultat du lancement depuis le radar">
      <span>{radarAutoStatus}</span>
      {onOpenRadar && <Button variant="secondary" disabled={busy || fixtureLoading || sensitivityLoading || blindGraphLoading} onClick={onOpenRadar}>Revenir au radar</Button>}
    </div>}
    <div className="diagram-lab-catalog" role="tablist" aria-label="Protocoles automatiques des schémas scientifiques">
      {([
        ['reference', 'FORME', 'Qualité graphique', 'A/B/C · Présentation et justesse', '3 dessins'],
        ['arrows', 'FLÈCHES', 'Sens des flèches', 'D/E · Témoin et inversion', '2 dessins'],
        ['semantic', 'BIOLOGIE', 'Compréhension biologique', 'S0–S5 · Relations fausses et témoins', '6 dessins'],
        ['graph', 'GRAPHE', 'Graphe des relations', 'S0–S5 · Lecture sans barème', '6 dessins'],
      ] as const).map(([id, number, title, subtitle, count]) =>
        <button key={id} role="tab" type="button" aria-selected={activeProtocol === id}
          disabled={busy || uploading || fixtureLoading || sensitivityLoading || blindGraphLoading}
          onClick={() => setActiveProtocol(id)}>
          <strong>{title}</strong><small>{number} · {count}</small><span className="diagram-lab-catalog-description">{subtitle}</span>
        </button>)}
    </div>

    <p className="diagram-lab-protocol-summary" role="status">{({ reference: '3 schémas · présentation, légendes et justesse', arrows: '2 schémas · témoin D et flèches inversées E', semantic: '6 variantes · erreurs biologiques et faux rejets', graph: '6 schémas · relations sans barème' } as const)[activeProtocol]}</p>
    {activeProtocol !== 'graph' && <div className="diagram-fixture-run-controls diagram-lab-method">
      <label htmlFor="diagram-method-selection">Méthode de correction scientifique à tester</label>
      <DesignSystemSelect id="diagram-method-selection" value={methodSelection} disabled={busy || fixtureLoading || uploading}
        onChange={(event) => {
          setMethodSelection(event.currentTarget.value as DiagramMethodSelection);
          onClearReport();
          onClearFixtureReport();
        }}>
        <option value="compare">Comparer toutes les méthodes compatibles (recommandé)</option>
        <option value="vision-then-analysis">Vision puis analyse — 2 étapes</option>
        <option value="direct-image-generative">Image → modèle génératif — sans OCR, Think OFF</option>
        <option value="direct-image-generative-thinking">Image → modèle génératif — Think ON (Ollama compatible)</option>
        <option value="compare-thinking">Comparer génératif direct : Think OFF / ON (modèle compatible)</option>
        <option value="direct-image-systemone">Image → décisionnel System One — sans OCR</option>
      </DesignSystemSelect>
      <details className="diagram-lab-explanation"><summary>Compatibilité et limites des méthodes</summary><p className="pilot-evaluation-hint">Les méthodes sont choisies dans ce laboratoire uniquement. Le choix habituel « Comparer toutes les méthodes » n’active jamais Think. L’option OFF / ON fonctionne avec tout modèle génératif Vision sur Ollama local qui prend en charge Think : le serveur est interrogé sur les capacités du modèle avant l’essai. Les niveaux nommés sont respectés quand Ollama en indique un. 4 096 tokens maximum par appel Think et 1 passage par défaut. Pensez à « Arrêter » si l’essai est trop long. Le rapport distingue Thinking demandé et trace réellement émise, sans enregistrer le raisonnement. D1/D3 compatibles peuvent comparer deux étapes et System One image ; TEV1 n’utilise l’image que via la transcription préalable.</p></details>
    </div>}
    {(activeProtocol === 'reference' || activeProtocol === 'arrows') && <section id="evaluation-diagram-fixture-launch" className="diagram-protocol-fixtures" aria-label="Schémas de référence intégrés">
      <div className="diagram-protocol-fixtures-heading">
        <div>
          <h4>{activeProtocol === 'arrows' ? 'Flèches : témoin D et dessin E aux pointes inversées' : 'Qualité graphique : trois niveaux de référence A/B/C'}</h4>
          <p>A/B/C : difficulté progressive. D/E : <strong>mêmes mots et mêmes structures</strong>, mais quatre flèches volontairement inversées en E. Barème sur 10 points et références provisoires à valider par un enseignant. La différence attendue ne sera jamais envoyée au modèle.</p>
        </div>
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
          {activeProtocol === 'reference' && <Button disabled={!canRunFixtures} onClick={() => { void runPreparedFixtures(SCIENTIFIC_DIAGRAM_BASE_CASE_IDS); }}>
            Tester les 3 schémas en un clic
          </Button>}
          {activeProtocol === 'arrows' && <Button variant="secondary" disabled={!canRunFixtures}
            onClick={() => { void runPreparedFixtures(SCIENTIFIC_DIAGRAM_POINTER_CASE_IDS); }}>
            Tester les flèches D/E en un clic
          </Button>}
          {(busy || fixtureLoading) && <Button variant="secondary" onClick={stopProtocol} disabled={!busy}>Arrêter après l’appel en cours</Button>}
        </div>
        <details className="diagram-lab-explanation"><summary>Conditions de comparaison</summary><p className="pilot-evaluation-hint">Choisissez 1 à 3 configurations dans la sélection au-dessus. Pour une comparaison équitable, le même barème et les mêmes images sont utilisés à chaque passage, par méthode et par profil. Exécution séquentielle. Un seul passage ne mesure pas la répétabilité.</p></details>
        {hasRemote && <p className="pilot-evaluation-hint" role="status">Une configuration distante est sélectionnée : les photos seront envoyées uniquement à son serveur configuré.</p>}
        {profileIssues.map((issue) => <p className="pilot-evaluation-hint" role="status" key={'fixture-' + issue}>{issue}</p>)}
        {(fixtureMessage || (busy && progress)) && <p role="status" className="pilot-evaluation-message">{fixtureMessage || progress}</p>}
      </div>
      <div className="diagram-fixture-grid">
        {SCIENTIFIC_DIAGRAM_FIXTURES.filter((fixture) => activeProtocol === 'reference'
          ? fixture.id === 'A' || fixture.id === 'B' || fixture.id === 'C'
          : fixture.id === 'D' || fixture.id === 'E').map((fixture) => <article key={fixture.id} className="diagram-fixture-card">
          <img src={fixtureImageUrls[fixture.id]} alt={'Schéma de mitose végétale — ' + fixture.label} loading="lazy" />
          <div className="diagram-fixture-card-body">
            <div className="diagram-fixture-card-title">
              <strong>{fixture.label}</strong>
              <span>{fixture.referenceScore}/10 attendu</span>
            </div>
            <p>{fixture.description}</p>
            {fixture.layoutObservation && <p>
              <strong>Alignement en colonne : {fixture.layoutObservation.points}/{fixture.layoutObservation.maximumPoints} pt.</strong>{' '}
              {fixture.layoutObservation.reason}
            </p>}
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
      {fixtureReport && <section id="evaluation-diagram-fixture-results" className="pilot-evaluation-report" aria-label="Résultats des schémas scientifiques">
        <div className="pilot-evaluation-report-head">
          <div><h4>Comparaison aux notes de référence</h4><p>{busy || fixtureLoading ? 'Rapport partiel : les passages terminés sont déjà exportables. ' : ''}La note reste « Non noté » lorsque le modèle demande une revue. Les décisions System One sont mesurées séparément, même si la note finale reste indisponible.</p></div>
          <div className="pilot-evaluation-report-actions">
            <Button variant="secondary" onClick={() => { void copyFixtureReport(); }}>Copier le rapport pour ChatGPT</Button>
            <Button variant="secondary" onClick={downloadFixtureReport}>Exporter le rapport JSON</Button>
          </div>
        </div>
        <div className="pilot-evaluation-table-scroll">
          <table className="pilot-evaluation-table">
            <thead><tr><th>Schéma</th><th>Configuration</th><th>Parcours</th><th>Attendu</th><th>Notes obtenues</th><th>Exécution</th><th>Décisions récupérées</th><th>Justesse stricte</th><th>Légendes et flèches</th><th>Think (demande / trace)</th><th>Stabilité</th><th>Temps moyen</th></tr></thead>
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
                        : 'Échec de traitement (cause à consulter dans le diagnostic)';
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
                <td>{experiments.map((experiment) => (
                  (experiment.thinkingRequested ? 'ON' : experiment.thinkingRequested === false ? 'OFF' : 'Inconnu')
                  + (typeof experiment.thinkingSetting === 'string' ? ' (' + experiment.thinkingSetting + ')' : '')
                  + ' / ' + (experiment.thinkingObserved === true ? 'émise' : experiment.thinkingObserved === false ? 'non détectée' : 'non mesurée')
                  + (experiment.diagnostics.generatedTokens !== null ? ' · ' + experiment.diagnostics.generatedTokens + ' tokens' : '')
                )).join(' · ')}</td>
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
    </section>}
    {activeProtocol === 'semantic' && <section id="evaluation-diagram-sensitivity-launch" className="diagram-protocol-fixtures diagram-sensitivity-section" aria-label="Sensibilité sémantique">
      <h4>Compréhension biologique · 6 variantes contrôlées</h4>
      <p>Flèche inversée, mauvaise connexion ou structure mal placée : ce protocole mesure la détection des erreurs et les faux rejets de relations correctes.</p>
      <p className="pilot-evaluation-hint">Protocole indépendant de D/E. Même texte sur les six images : le modèle doit réellement examiner les extrémités et le sens des flèches, ainsi que le contour du noyau. Trois attendus biologiques / 3 points. Les références restent provisoires et ne sont pas communiquées au modèle. Aucun changement à la correction des devoirs.</p>
      <div className="diagram-fixture-run-controls">
        <label htmlFor="diagram-sensitivity-prompt-mode">Stratégie de vérification visuelle</label>
        <DesignSystemSelect id="diagram-sensitivity-prompt-mode"
          value={sensitivityPromptSelection} disabled={busy || sensitivityLoading || fixtureLoading}
          onChange={(event) => setSensitivityPromptSelection(event.currentTarget.value as typeof sensitivityPromptSelection)}>
          <option value="standard">Standard — note directement</option>
          <option value="guided">Questions ciblées — examine les relations avant la note</option>
          <option value="compare">Comparer standard / questions ciblées (mêmes images)</option>
        </DesignSystemSelect>
      </div>
      <div className="diagram-fixture-run-controls">
        <label htmlFor="diagram-semantic-repeat-count">Passages par variante</label>
        <DesignSystemSelect id="diagram-semantic-repeat-count" value={fixtureCount} disabled={busy}
          onChange={(event) => setFixtureCount(event.currentTarget.value === '5' ? 5 : event.currentTarget.value === '3' ? 3 : 1)}>
          <option value={1}>1 passage rapide</option><option value={3}>3 répétitions</option><option value={5}>5 répétitions</option>
        </DesignSystemSelect>
      </div>
      <div className="pilot-evaluation-actions">
        <Button disabled={!canRunFixtures} onClick={() => { void runSensitivity(); }}>Tester les 6 variantes sémantiques</Button>
        {(busy || sensitivityLoading) && <Button variant="secondary" disabled={!busy} onClick={stopProtocol}>Arrêter après l’appel en cours</Button>}
        <div className="diagram-fixture-grid diagram-sensitivity-grid">
        {DIAGRAM_SENSITIVITY_CASES.map((testCase) => <article className="diagram-fixture-card" key={testCase.id}>
          <img src={scientificDiagramSensitivityPreviewUrl(testCase.id)} alt={'Relations biologiques — ' + testCase.label} loading="lazy" />
          <div className="diagram-fixture-card-body">
            <div className="diagram-fixture-card-title"><strong>{testCase.id} — {testCase.label}</strong><span>{testCase.referenceScore === null ? 'À arbitrer' : testCase.referenceScore + '/3'}</span></div>
            <p>{testCase.description}</p>
          </div>
        </article>)}
      </div>
      {sensitivityReport && <Button variant="secondary" onClick={downloadSensitivityReport}>Exporter les mesures JSON</Button>}
      </div>
      <p className="pilot-evaluation-hint">La méthode et les modèles se choisissent au-dessus ; le nombre de répétitions est celui des schémas intégrés. La comparaison standard / questions ciblées est réalisée par deux séries avec les mêmes PNG préparés une seule fois : ce n’est pas encore une lecture indépendante à l’aveugle. Exécution séquentielle. La variante S5 est indécidable : aucune réponse attendue n’est inventée pour sa première flèche.</p>
      {(sensitivityMessage || (busy && progress)) && <p role="status" className="pilot-evaluation-message">{sensitivityMessage || progress}</p>}
      {sensitivityReport && <section id="evaluation-diagram-sensitivity-results" className="pilot-evaluation-report" aria-label="Résultats de sensibilité sémantique">
        <div className="pilot-evaluation-report-head">
          <div><h4>Mesures de sensibilité</h4><p>Une erreur n’est détectée que si le témoin est reconnu et la variante fautive rejetée. Les résultats indécidables restent hors du dénominateur.</p></div>
        </div>
        <div className="pilot-evaluation-table-scroll">
          <table className="pilot-evaluation-table">
            <thead><tr><th>Configuration</th><th>Parcours</th><th>Consigne</th><th>Mutations détectées</th><th>Non mesurables</th><th>Réponses correctes sur témoins</th><th>Faux positifs témoins</th><th>Disposition préservée</th><th>Abstentions</th></tr></thead>
            <tbody>{sensitivityReport.statistics.map((item) => <tr key={item.profileId + '-' + item.method + '-' + item.promptMode}>
              <th scope="row">{item.profileId}</th>
              <td>{item.method in diagramMethodLabels ? diagramMethodLabels[item.method as keyof typeof diagramMethodLabels] : item.method}</td>
              <td>{item.promptMode === 'guided' ? 'Questions ciblées' : 'Standard'}</td>
              <td>{item.sensitivityHits}/{item.sensitivityTrials}</td>
              <td>{item.sensitivityUnknown}</td>
              <td>{item.correctControls}/{item.controlObservations}</td>
              <td>{item.falsePositiveCount}</td>
              <td>{item.layoutPreserved}/{item.layoutChecks}</td>
              <td>{item.abstentions}/{item.readingsCount}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="pilot-evaluation-hint">{sensitivityReport.limitations}</p>
      </section>}
    </section>}
    {activeProtocol === 'graph' && <section id="evaluation-diagram-graph-launch" className="diagram-protocol-fixtures diagram-sensitivity-section" aria-label="Extraction du graphe de relations">
      <h4>Observer un graphe de relations avant le barème</h4>
      <p>Ce protocole évite d’injecter la réponse scientifique attendue dans la consigne de lecture.</p>
      <p className="pilot-evaluation-hint">Le modèle Vision voit uniquement les PNG et une consigne générique de description : noms dessinés, extrémités/pointe des flèches, inclusion des structures. Il ne reçoit ni la consigne de biologie, ni le barème, ni les trois attendus. Le logiciel compare ensuite le graphe extrait aux références S0–S5. Aucune correction de copie n’est modifiée.</p>
      <div className="diagram-fixture-run-controls">
        <label htmlFor="diagram-blind-prompt-variant">Consigne de lecture du graphe</label>
        <DesignSystemSelect id="diagram-blind-prompt-variant"
          value={blindGraphPromptVariant} disabled={busy || blindGraphLoading}
          onChange={(event) => setBlindGraphPromptVariant(event.currentTarget.value as BlindGraphPromptVariant)}>
          <option value="baseline">Référence actuelle — lecture standard</option>
          <option value="isolated-arrows-outside">Ancienne expérimentation — consigne renforcée (sans gain observé)</option>
          <option value="recheck-arrows">Nouvel essai A — relire chaque flèche séparément</option>
          <option value="recheck-contours">Nouvel essai B — relire uniquement les contours</option>
        </DesignSystemSelect>
      </div>
      <div className="diagram-fixture-run-controls">
        <label htmlFor="diagram-graph-repeat-count">Passages par schéma</label>
        <DesignSystemSelect id="diagram-graph-repeat-count" value={fixtureCount} disabled={busy}
          onChange={(event) => setFixtureCount(event.currentTarget.value === '5' ? 5 : event.currentTarget.value === '3' ? 3 : 1)}>
          <option value={1}>1 passage rapide</option><option value={3}>3 répétitions</option><option value={5}>5 répétitions</option>
        </DesignSystemSelect>
      </div>
      <div className="pilot-evaluation-actions">
        <Button disabled={!canRunBlindGraph} onClick={() => { void runBlindObservation(); }}>
          Extraire les relations des 6 schémas
        </Button>
        <Button variant="secondary" disabled={!canRunBlindGraph || blindGraphPromptVariant === 'recheck-arrows' || blindGraphPromptVariant === 'recheck-contours'} onClick={() => { void runBlindObservation(true); }}>
          Tester avec agrandissement ciblé
        </Button>
        {(busy || blindGraphLoading) && <Button variant="secondary" disabled={!busy} onClick={stopProtocol}>Arrêter après l’appel en cours</Button>}
        {blindGraphReport && <Button variant="secondary" onClick={downloadBlindGraphReport}>Exporter l’analyse du graphe JSON</Button>}
      </div>
      {blindGraphUsesRemote && <p className="pilot-evaluation-hint" role="status">Profil distant : images envoyées au serveur configuré.</p>}
       <details className="diagram-lab-explanation"><summary>Protocole détaillé</summary><p className="pilot-evaluation-hint">Pour comparer avec Qwen 3.5 4B : lancez d'abord « Référence actuelle » (sans agrandissement), puis « Nouvel essai A » et « Nouvel essai B » séparément, avec le même profil et une seule répétition. Chaque méthode exporte son propre JSON. A relit jusqu’à deux flèches, même déclarées certaines ; le recadrage est tenté si Vision fournit une zone, sinon l’image entière est relue et ce repli est compté. B effectue un appel distinct d’inventaire des contours. La correction des devoirs n’est pas affectée.</p>
      <p className="pilot-evaluation-hint">Le mode d’agrandissement peut ajouter jusqu’à deux appels au fournisseur sélectionné. Si une zone n’est pas localisable, elle reste indécidable.</p>
      <p className="pilot-evaluation-hint">Les six schémas sont traités séquentiellement. La conclusion peut rester indécidable si les flèches sont mal lues.</p>
      </details>
       {selectedProfiles.length > 0 && <p className="pilot-evaluation-hint">
        Modèle réellement envoyé aux six schémas : <strong>{selectedProfiles.map((profile) =>
          profile.name + ' → ' + (blindGraphVisionModel(profile) || 'aucun modèle')).join(' · ')}</strong>.
        Pour en changer, modifiez « Modèle de lecture des images » dans les options avancées et enregistrez le profil.
      </p>}
      {blindGraphIssue && !busy && !uploading && !fixtureLoading && !sensitivityLoading && !blindGraphLoading &&
        <p className="pilot-evaluation-hint" role="status">{blindGraphIssue}</p>}
      {(blindGraphMessage || (busy && progress)) &&
        <p role="status" className="pilot-evaluation-message">{blindGraphMessage || progress}</p>}
      {blindGraphReport && <section id="evaluation-diagram-graph-results" className="pilot-evaluation-report" aria-label="Résultats du graphe visuel indépendant">
        <h4>Lecture indépendante — relations effectivement observées</h4>
        <p>Consigne utilisée : <strong>{({
          baseline: 'Référence actuelle',
          'isolated-arrows-outside': 'Ancienne consigne renforcée',
          'recheck-arrows': 'Nouvel essai A — seconde lecture des flèches',
          'recheck-contours': 'Nouvel essai B — seconde lecture des contours',
        } as Record<BlindGraphPromptVariant, string>)[blindGraphReport.promptVariant]}</strong>.</p>
        <p>Sorties valides : {blindGraphReport.cases.flatMap((item) => item.experiments).filter((run) => run.status === 'success').length}
          /{blindGraphReport.cases.flatMap((item) => item.experiments).length}.
          Les rejets et les relations indécidables ne prouvent pas une erreur scientifique. Le total des bonnes relations inclut les liens inchangés des schémas modifiés.</p>
        <div className="pilot-evaluation-table-scroll">
          <table className="pilot-evaluation-table">
            <thead><tr><th>Profil</th><th>Mutations détectées</th><th>Non mesurables</th><th>Bonnes relations rejetées</th><th>Bonnes relations indécidables</th><th>Faux positifs témoins</th><th>Abstentions</th></tr></thead>
            <tbody>{blindGraphReport.statistics.map((item) =>
              <tr key={item.profileId}>
                <th scope="row">{item.profileId}</th>
                <td>{item.sensitivityHits}/{item.sensitivityTrials}</td>
                <td>{item.sensitivityUnknown}</td>
                <td>{item.correctRelationRejections}/{item.correctRelationCount}</td>
                <td>{item.correctRelationAbstentions}/{item.correctRelationCount}</td>
                <td>{item.falsePositiveCount}/{item.controlObservations}</td>
                <td>{item.abstentions}/{item.readingsCount}</td>
              </tr>)}</tbody>
          </table>
        </div>
        <details>
          <summary>Décisions observées par schéma</summary>
          {blindGraphReport.cases.map((item) => <div key={item.caseId}>
            <strong>{item.label}</strong>
            {item.experiments.map((run, index) => <BlindGraphRunDetails
              key={run.profileId + '-' + index} run={run} gold={item.gold} />)}
          </div>)}
        </details>
        <p className="pilot-evaluation-hint">{blindGraphReport.limitations}</p>
      </section>}
    </section>}
    <details className="diagram-lab-legacy">
      <summary>Essai libre avec un schéma personnel (fonction avancée)</summary>
      <p>Fonction historique conservée, distincte des protocoles automatiques. Elle permet un essai avec votre propre image et un barème personnalisé.</p>
    <div className="diagram-protocol-inputs">
      <div className="diagram-protocol-import">
        <h4>1. Schéma et barème</h4>
        <FilePicker id="diagram-protocol-photos" title="Schéma à analyser" description="Photo(s) ou PDF du même schéma ; pages conservées ensemble dans un seul essai" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" multiple disabled={busy || uploading} onFilesSelected={(files) => { void importImages(files); }} />
        <p className="pilot-evaluation-hint">{uploading ? 'Préparation…' : images.length ? images.length + ' page(s) prêtes' : 'Aucune image fournie.'}</p>
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
    <div id="evaluation-diagram-personal-launch" className="diagram-protocol-run">
      <h4>3. Répéter à l’identique</h4>
      <p className="pilot-evaluation-hint">Configurations : {selectedProfiles.length ? selectedProfiles.map((profile) =>
        profile.name + ' (' + selectDiagramMethods(profile, methodSelection).map((method) => diagramMethodLabels[method]).join(' / ') + ')').join(' · ') :
        'Sélectionnez les profils dans « Configurations à exécuter » plus bas.'}</p>
      {hasRemote && <p className="pilot-evaluation-hint" role="status">Attention : une configuration distante est sélectionnée. Les images seront envoyées à son serveur.</p>}
      {profileIssues.map((issue) => <p className="pilot-evaluation-hint" role="status" key={issue}>{issue}</p>)}
      <div className="pilot-evaluation-actions">
        <label htmlFor="diagram-protocol-repeat-count">Répétitions</label>
        <DesignSystemSelect id="diagram-protocol-repeat-count" disabled={busy} value={repetitions}
          onChange={(event) => setRepetitions(event.currentTarget.value === '5' ? 5 : 3)}>
          <option value={3}>3 passages</option><option value={5}>5 passages</option>
        </DesignSystemSelect>
        <Button disabled={!canRun} onClick={() => { void start(); }}>Tester le schéma en un clic</Button>
        {busy && <Button variant="secondary" onClick={stopProtocol}>Arrêter après l’appel en cours</Button>}
      </div>
      {(progress || message) && <p role="status" className="pilot-evaluation-message">{message || progress}</p>}
    </div>
    {report && <div id="evaluation-diagram-personal-results" className="pilot-evaluation-report" aria-label="Résultats du protocole schéma">
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
    </details>
  </section>;
}
