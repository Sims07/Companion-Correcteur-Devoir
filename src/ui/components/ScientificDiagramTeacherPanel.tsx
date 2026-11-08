import { useEffect, useRef, useState } from 'react';
import type { AiModelConfiguration, AiModelProfile } from '../../domain/aiModelProfiles.ts';
import type { GradingProposal } from '../../domain/grading.ts';
import { validateRubric, type Rubric } from '../../domain/rubric.ts';
import { buildDiagramReview } from '../../domain/diagramTeacherReview.ts';
import { accumulateClockwiseRotation } from '../../domain/scientificPageOrientation.ts';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, parseScientificDiagramProtocolRubric } from '../../domain/scientificDiagramProtocol.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import { isLoopbackDiagramEndpoint, type DirectScientificDiagramRequest } from '../../application/directScientificDiagramCorrection.ts';
import { Button, Checkbox, TextArea } from '../design-system/index.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';
import { FilePicker } from './FilePicker.tsx';
import { CopyPageViewer } from './CopyPageViewer.tsx';
import './ScientificDiagramTeacherPanel.css';

export interface ScientificDiagramTeacherPanelProps {
  profiles: readonly AiModelProfile[];
  currentConfiguration: AiModelConfiguration;
  onPrepareImages: (files: File[]) => Promise<ImageInput[]>;
  onRotateImage: (image: ImageInput, degrees: 90 | 180 | 270) => Promise<ImageInput>;
  onRun: (request: DirectScientificDiagramRequest) => Promise<GradingProposal>;
  onOpenSettings: () => void;
}

/** A deliberately short teacher journey. It never stores images or auto-accepts
 * scores: this is a standalone evaluation of one scientific drawing.
 */
export function ScientificDiagramTeacherPanel({
  profiles, currentConfiguration, onPrepareImages, onRotateImage, onRun, onOpenSettings,
}: ScientificDiagramTeacherPanelProps) {
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [rubric, setRubric] = useState<Rubric>(() => structuredClone(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC));
  const [question, setQuestion] = useState('');
  const [images, setImages] = useState<ImageInput[]>([]);
  const originals = useRef<ImageInput[]>([]);
  const rotationBusyRef = useRef(false);
  const [angles, setAngles] = useState<Record<number, number>>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [viewerPage, setViewerPage] = useState<number | null>(null);
  const [rotating, setRotating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [consent, setConsent] = useState(false);
  const [proposal, setProposal] = useState<GradingProposal | null>(null);
  const [completedAt, setCompletedAt] = useState('');
  const [usedModel, setUsedModel] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const interval = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [running]);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const configuration = selectedProfile?.configuration ?? currentConfiguration;
  const isLocal = isLoopbackDiagramEndpoint(configuration.endpoint);
  const validation = validateRubric(rubric);
  const review = buildDiagramReview(rubric, proposal);
  const compatible = configuration.correctionMethod === 'generative' && Boolean(configuration.analysisModel.trim());
  const canRun = !running && !uploading && !rotating && images.length > 0 && validation.valid
    && compatible && (isLocal || consent);

  function invalidate() {
    setProposal(null);
    setCompletedAt('');
    setError('');
    setMessage('');
  }

  async function addImages(files: FileList | null) {
    if (!files?.length || running || uploading || rotating || rotationBusyRef.current) return;
    invalidate();
    setImages([]);
    originals.current = [];
    setAngles({});
    setPageIndex(0);
    setViewerPage(null);
    setUploading(true);
    try {
      const prepared = await onPrepareImages(Array.from(files));
      if (!prepared.length) throw new Error('Aucune page exploitable.');
      originals.current = prepared;
      setImages(prepared);
      setMessage(prepared.length + ' page(s) du schéma prête(s).');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de préparer les images.');
    } finally { setUploading(false); }
  }

  async function addRubric(files: FileList | null) {
    if (!files?.length || running || uploading || rotating || rotationBusyRef.current) return;
    invalidate();
    try {
      const parsed = JSON.parse(await files[0]!.text()) as unknown;
      const imported = parseScientificDiagramProtocolRubric(parsed);
      setRubric(imported);
      setMessage('Barème chargé : ' + imported.title + '.');
    } catch (cause) {
      setError('Barème non chargé : ' + (cause instanceof Error ? cause.message : 'JSON invalide.'));
    }
  }

  async function rotatePage(index: number, degrees: 90 | 270) {
    const original = originals.current[index];
    if (!original || running || uploading || rotating || rotationBusyRef.current) return;
    const angle = accumulateClockwiseRotation(angles[index] ?? 0, degrees);
    rotationBusyRef.current = true;
    invalidate();
    setRotating(true);
    try {
      // Always rotate original pixels. The preview and grading request share the same working image.
      const next = angle === 0 ? original : await onRotateImage(original, angle as 90 | 180 | 270);
      setImages((current) => current.map((image, page) => page === index ? next : image));
      setAngles((current) => ({ ...current, [index]: angle }));
      setMessage('Orientation modifiée : la prochaine correction utilisera cette image.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La rotation a échoué.');
    } finally { rotationBusyRef.current = false; setRotating(false); }
  }

  async function start() {
    if (!canRun || rotationBusyRef.current) return;
    invalidate();
    setRunning(true);
    setElapsed(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const evaluated = await onRun({
        images, rubric: structuredClone(rubric), question, configuration: { ...configuration },
        remoteConsent: isLocal ? false : consent, signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setProposal(evaluated);
      setUsedModel(configuration.analysisModel);
      setCompletedAt(new Date().toISOString());
      setMessage('Proposition disponible. Vérifiez chaque observation avant de retenir la note.');
    } catch (cause) {
      if (controller.signal.aborted) setMessage('Correction interrompue : aucune note proposée.');
      else setError(cause instanceof Error ? cause.message : 'La correction du schéma a échoué.');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  function exportResult() {
    if (!proposal) return;
    // The export intentionally includes neither the original images, their
    // filenames, server addresses, credentials nor model network traces.
    const report = {
      format: 'companion-teacher-diagram-direct-v1',
      completedAt, model: usedModel,
      method: 'image-direct-generative', pageCount: images.length,
      question, rubric, proposal,
      teacherValidated: false,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'companion-correction-schema-' + completedAt.slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const currentPage = images[pageIndex];
  const phase = uploading || rotating ? 'Préparation du schéma'
    : running ? 'Analyse directe en cours'
      : proposal ? 'À vérifier par l’enseignant'
        : error ? 'Correction à reprendre'
          : images.length ? 'Prêt à corriger' : 'En attente d’une copie';

  return <div className="diagram-teacher-workspace" aria-label="Correction des schémas scientifiques">
    <header className="diagram-teacher-heading">
      <div><p className="eyebrow">ESPACE ENSEIGNANT · BIOLOGIE</p>
        <h2>Corriger un schéma scientifique</h2>
        <p>Le schéma reste visible pendant la correction et la relecture des critères.</p>
      </div>
      <span className="step-count">MODE EXPÉRIMENTAL</span>
    </header>
    <section className="panel diagram-teacher-controls" aria-label="Préparer la correction du schéma">
      <div className="diagram-teacher-grid">
        <div className="diagram-teacher-setup">
          <h3>1. Préparer le schéma</h3>
          <FilePicker id="teacher-diagram-images" title="Photo ou PDF du dessin"
            description="Une image ou plusieurs pages d’un même schéma."
            accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" multiple
            disabled={running || uploading || rotating} onFilesSelected={(files) => { void addImages(files); }} />
          <p className="hint">{uploading ? 'Préparation des images sur cet appareil…'
            : images.length ? images.length + ' page(s) sélectionnée(s)' : 'Aucune image sélectionnée.'}</p>
          <details className="diagram-teacher-options">
            <summary>Barème personnel et contexte <span>Facultatif</span></summary>
            <FilePicker id="teacher-diagram-rubric" title="Importer mon barème (JSON)"
              description="Sans import, le barème de 8 points est utilisé."
              accept=".json,application/json" disabled={running || uploading || rotating}
              onFilesSelected={(files) => { void addRubric(files); }} />
            <label className="field-label" htmlFor="teacher-diagram-question">Contexte du dessin</label>
            <TextArea id="teacher-diagram-question" rows={3} disabled={running}
              placeholder="Ex. mitose de cellules végétales ; structures attendues…"
              value={question} onChange={(event) => { setQuestion(event.currentTarget.value); invalidate(); }} />
          </details>
        </div>
        <div className="diagram-teacher-run">
          <h3>2. Corriger le schéma</h3>
          <label className="field-label" htmlFor="teacher-diagram-model">Configuration IA</label>
          <DesignSystemSelect id="teacher-diagram-model" value={selectedProfileId} disabled={running}
            onChange={(event) => { setSelectedProfileId(event.currentTarget.value); setConsent(false); invalidate(); }}>
            <option value="">Configuration actuelle · {currentConfiguration.analysisModel || 'non définie'}</option>
            {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.configuration.analysisModel || 'sans modèle'}</option>)}
          </DesignSystemSelect>
          {!compatible && <div className="diagram-teacher-notice" role="status">
            Choisissez une configuration générative avec un modèle visuel.
            <Button variant="secondary" onClick={onOpenSettings}>Configurer l’IA</Button>
          </div>}
          {!isLocal ? <div className="diagram-teacher-remote">
            <p><strong>Serveur non local.</strong> Les photos seront envoyées au serveur configuré après votre accord.</p>
            <Checkbox checked={consent} disabled={running} onChange={(event) => setConsent(event.currentTarget.checked)}>
              J’autorise l’envoi de ces images au serveur configuré pour cet essai.
            </Checkbox>
          </div> : <p className="diagram-teacher-local">Serveur sur cet ordinateur (localhost). Aucune API cloud.</p>}
          <div className="diagram-teacher-actions">
            <Button disabled={!canRun} onClick={() => { void start(); }}>
              {running ? 'Correction du schéma en cours…' : proposal ? 'Relancer la correction' : 'Corriger directement l’image'}
            </Button>
            {running && <Button variant="secondary" onClick={() => abortRef.current?.abort()}>Arrêter</Button>}
          </div>
          <p className="hint">Une analyse visuelle directe, sans OCR ni sauvegarde automatique des photos.</p>
        </div>
      </div>
      {error && <p className="diagram-teacher-error" role="alert">{error}</p>}
      {message && <p className="diagram-teacher-message" role="status">{message}</p>}
    </section>
    <div className="diagram-teacher-review-layout">
      <section className="panel diagram-teacher-copy" aria-label="Schéma original">
        <header className="diagram-teacher-section-head">
          <div><p className="eyebrow">COPIE À EXAMINER</p><h3>Schéma de l’étudiant</h3></div>
          <span>{images.length} page{images.length > 1 ? 's' : ''}</span>
        </header>
        {currentPage ? <>
          <div className="diagram-teacher-image-tools">
            <span>Page {pageIndex + 1} / {images.length}</span>
            <div>
              <Button variant="secondary" aria-label="Tourner le schéma à gauche de 90 degrés"
                disabled={running || rotating} onClick={() => { void rotatePage(pageIndex, 270); }}>↶ 90°</Button>
              <Button variant="secondary" aria-label="Tourner le schéma à droite de 90 degrés"
                disabled={running || rotating} onClick={() => { void rotatePage(pageIndex, 90); }}>↷ 90°</Button>
              <Button variant="secondary" onClick={() => setViewerPage(pageIndex)}>Agrandir</Button>
            </div>
          </div>
          <button type="button" className="diagram-teacher-image-stage"
            aria-label={'Agrandir le schéma page ' + (pageIndex + 1)}
            onClick={() => setViewerPage(pageIndex)}>
            <img src={'data:' + currentPage.mimeType + ';base64,' + currentPage.base64}
              alt={'Schéma scientifique, page ' + (pageIndex + 1)} />
          </button>
          <div className="diagram-teacher-image-caption">
            <span>{currentPage.fileName || 'Page ' + (pageIndex + 1)}</span>
            <span>{rotating ? 'Rotation en cours…' : angles[pageIndex] ? 'Orientation ' + angles[pageIndex] + '°' : 'Orientation d’origine'}</span>
          </div>
          {images.length > 1 && <nav className="diagram-teacher-previews" aria-label="Pages du schéma">
            {images.map((image, index) => <button type="button" key={index}
              className={index === pageIndex ? 'is-selected' : ''} aria-current={index === pageIndex ? 'page' : undefined}
              aria-label={'Afficher la page ' + (index + 1)} onClick={() => setPageIndex(index)}>
              <img src={'data:' + image.mimeType + ';base64,' + image.base64} alt={'Miniature page ' + (index + 1)} />
              <span>Page {index + 1}</span>
            </button>)}
          </nav>}
          <p className="hint">Cliquez sur l’image pour l’agrandir et zoomer. Les rotations s’appliquent aussi à la copie transmise au modèle.</p>
        </> : <div className="diagram-teacher-empty-copy">
          <strong>Votre schéma apparaîtra ici.</strong>
          <p>Ajoutez une photo ou un PDF pour comparer la copie au barème détaillé.</p>
        </div>}
      </section>
      <aside className="panel diagram-teacher-activity" aria-label="Suivi des critères">
        <header className="diagram-teacher-section-head">
          <div><p className="eyebrow">BARÈME ET VÉRIFICATION</p><h3>Critères de correction</h3></div>
          <span className="diagram-teacher-total">{validation.maximumPoints} points</span>
        </header>
        <p className="diagram-teacher-rubric-title">{rubric.title}</p>
        <div className="diagram-teacher-progress" role="status" aria-live="polite">
          <span className={running ? 'diagram-teacher-progress-dot is-running' : 'diagram-teacher-progress-dot'} aria-hidden="true" />
          <div><strong>{phase}</strong>
            <small>{running ? elapsed + ' secondes écoulées'
              : proposal ? review.assessedCount + ' / ' + review.items.length + ' critères évalués'
                : images.length ? 'Prêt pour l’analyse visuelle' : 'Chargez une copie pour commencer'}</small>
          </div>
        </div>
        {running && <p className="diagram-teacher-running-note" role="status">
          Le modèle analyse directement l’image en un seul appel. Les résultats des critères apparaîtront ensemble à la fin, et non progressivement.
        </p>}
        {!validation.valid && <p className="diagram-teacher-error" role="alert">{validation.errors.join(' ')}</p>}
        <section className="diagram-teacher-result" aria-label={proposal ? 'Proposition de correction du schéma' : 'Détail du barème'}>
          {proposal ? <header className="diagram-teacher-result-head">
            <div><p className="eyebrow">3. VÉRIFICATION ENSEIGNANTE</p>
              <h3>Note proposée : {proposal.finalScore} / {validation.maximumPoints}</h3>
              <p>{proposal.summary} {proposal.scoreIncomplete ? 'La note est incomplète.' : 'La note n’est pas validée automatiquement.'}</p>
            </div>
            <Button variant="secondary" onClick={exportResult}>Exporter le résultat JSON</Button>
          </header> : <p className="diagram-teacher-rubric-intro">
            {review.subcriterionCount} attendus · barème détaillé, total cumulé.
            La compréhension biologique doit être définie explicitement pour être notée.
          </p>}
          <ol className="diagram-teacher-criteria">
            {review.items.map((item) => <li key={item.id} className="diagram-teacher-criterion">
              <div className="diagram-teacher-criterion-head">
                <strong>{item.title}</strong>
                <strong>{item.result ? item.result.points + ' / ' + item.maxPoints : item.maxPoints + ' pt max'}</strong>
              </div>
              <p className="diagram-teacher-cumulative">Barème cumulé : {item.cumulativeMaximum} / {validation.maximumPoints} pts</p>
              {item.result && <><p>Observation : {item.result.evidence}</p>
                <small>Confiance déclarée : {item.result.confidence === 'high' ? 'élevée' : item.result.confidence === 'medium' ? 'moyenne' : 'faible'}</small></>}
              <ul className="diagram-teacher-subcriteria">
                {item.subcriteria.map((sub) => <li key={sub.id}>
                  <span><span>{sub.title}</span>{sub.result && <small>{sub.result.evidence}</small>}</span>
                  <strong>{sub.result ? sub.result.points + ' / ' : ''}{sub.maxPoints}</strong>
                </li>)}
              </ul>
              {item.result?.questionForTeacher && <p className="diagram-teacher-question">À vérifier : {item.result.questionForTeacher}</p>}
            </li>)}
          </ol>
          {proposal && <>
            {proposal.questionsForTeacher.length > 0 && <div className="diagram-teacher-questions">
              <h4>Points à éclaircir</h4><ul>{proposal.questionsForTeacher.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>}
            <p className="hint">Comparez les preuves à l’image originale. Seul le professeur décide de la note finale. L’export ne contient aucune photo.</p>
          </>}
        </section>
      </aside>
    </div>
    {viewerPage !== null && images[viewerPage] && <CopyPageViewer
      pages={images} pageIndex={viewerPage} onPageChange={setViewerPage}
      onRotate={(index, degrees) => { void rotatePage(index, degrees); }}
      onClose={() => setViewerPage(null)} copyLabel="Schéma scientifique"
      rotationDisabled={running || rotating} rotationDegrees={angles[viewerPage] ?? 0}
    />}
  </div>;
}
