import { useEffect, useRef, useState } from 'react';
import type { AiModelConfiguration, AiModelProfile } from '../../domain/aiModelProfiles.ts';
import type { GradingProposal } from '../../domain/grading.ts';
import { getRubricSubcriteria, validateRubric, type Rubric } from '../../domain/rubric.ts';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC, parseScientificDiagramProtocolRubric } from '../../domain/scientificDiagramProtocol.ts';
import type { ImageInput } from '../../ports/aiProvider.ts';
import { isLoopbackDiagramEndpoint, type DirectScientificDiagramRequest } from '../../application/directScientificDiagramCorrection.ts';
import { Button, Checkbox, TextArea } from '../design-system/index.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';
import { FilePicker } from './FilePicker.tsx';
import './ScientificDiagramTeacherPanel.css';

export interface ScientificDiagramTeacherPanelProps {
  profiles: readonly AiModelProfile[];
  currentConfiguration: AiModelConfiguration;
  onPrepareImages: (files: File[]) => Promise<ImageInput[]>;
  onRun: (request: DirectScientificDiagramRequest) => Promise<GradingProposal>;
  onOpenSettings: () => void;
}

/** A deliberately short teacher journey. It never stores images or auto-accepts
 * scores: this is a standalone evaluation of one scientific drawing.
 */
export function ScientificDiagramTeacherPanel({
  profiles, currentConfiguration, onPrepareImages, onRun, onOpenSettings,
}: ScientificDiagramTeacherPanelProps) {
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [rubric, setRubric] = useState<Rubric>(() => structuredClone(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC));
  const [question, setQuestion] = useState('');
  const [images, setImages] = useState<ImageInput[]>([]);
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

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const configuration = selectedProfile?.configuration ?? currentConfiguration;
  const isLocal = isLoopbackDiagramEndpoint(configuration.endpoint);
  const validation = validateRubric(rubric);
  const compatible = configuration.correctionMethod === 'generative' && Boolean(configuration.analysisModel.trim());
  const canRun = !running && !uploading && images.length > 0 && validation.valid
    && compatible && (isLocal || consent);

  function invalidate() {
    setProposal(null);
    setCompletedAt('');
    setError('');
    setMessage('');
  }

  async function addImages(files: FileList | null) {
    if (!files?.length || running || uploading) return;
    invalidate();
    setImages([]);
    setUploading(true);
    try {
      const prepared = await onPrepareImages(Array.from(files));
      if (!prepared.length) throw new Error('Aucune page exploitable.');
      setImages(prepared);
      setMessage(prepared.length + ' page(s) du schéma prête(s).');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible de préparer les images.');
    } finally { setUploading(false); }
  }

  async function addRubric(files: FileList | null) {
    if (!files?.length || running || uploading) return;
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

  async function start() {
    if (!canRun) return;
    invalidate();
    setRunning(true);
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

  return <div className="diagram-teacher-workspace" aria-label="Correction des schémas scientifiques">
    <div className="diagram-teacher-heading">
      <div>
        <p className="eyebrow">ESPACE ENSEIGNANT · BIOLOGIE</p>
        <h2>Corriger un schéma scientifique</h2>
        <p>Photographiez un dessin, indiquez votre barème et recevez une proposition argumentée. L’IA examine directement l’image : aucune transcription OCR préalable.</p>
      </div>
      <span className="step-count">MODE EXPÉRIMENTAL</span>
    </div>
    <div className="diagram-teacher-grid">
      <section className="panel diagram-teacher-setup" aria-label="Préparer le schéma">
        <h3>1. Préparer le schéma</h3>
        <FilePicker id="teacher-diagram-images" title="Photo ou PDF du dessin"
          description="Une image, ou plusieurs pages d’un même schéma (PNG, JPG, WEBP, PDF)."
          accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" multiple
          disabled={running || uploading} onFilesSelected={(files) => { void addImages(files); }} />
        {uploading ? <p role="status">Préparation des images sur cet appareil…</p> :
          <p className="hint">{images.length ? images.length + ' page(s) sélectionnée(s)' : 'Aucune image sélectionnée.'}</p>}
        {images.length > 0 && <div className="diagram-teacher-previews" aria-label="Aperçu des pages">
          {images.map((image, index) => <img key={index} alt={'Schéma, page ' + (index + 1)}
            src={'data:' + image.mimeType + ';base64,' + image.base64} />)}
        </div>}
        <FilePicker id="teacher-diagram-rubric" title="Importer mon barème (JSON)"
          description="Facultatif : 15 attendus graphiques et 8 points sont proposés par défaut."
          accept=".json,application/json" disabled={running || uploading} onFilesSelected={(files) => { void addRubric(files); }} />
        <div className="diagram-teacher-rubric-summary">
          <strong>{rubric.title}</strong>
          <span>{validation.maximumPoints} points · {rubric.criteria.reduce((count, criterion) => count + getRubricSubcriteria(criterion).length, 0)} attendus</span>
          <p>La compréhension biologique doit être définie explicitement dans votre barème : l’exemple ne la note pas.</p>
        </div>
        <label className="field-label" htmlFor="teacher-diagram-question">Contexte du dessin (facultatif)</label>
        <TextArea id="teacher-diagram-question" rows={3} disabled={running}
          placeholder="Ex. mitose de cellules végétales ; structures attendues…"
          value={question} onChange={(event) => { setQuestion(event.currentTarget.value); invalidate(); }} />
      </section>
      <section className="panel diagram-teacher-run" aria-label="Correction directe de l’image">
        <h3>2. Lancer la correction directe</h3>
        <label className="field-label" htmlFor="teacher-diagram-model">Configuration IA</label>
        <DesignSystemSelect id="teacher-diagram-model" value={selectedProfileId} disabled={running}
          onChange={(event) => { setSelectedProfileId(event.currentTarget.value); setConsent(false); invalidate(); }}>
          <option value="">Configuration actuelle · {currentConfiguration.analysisModel || 'non définie'}</option>
          {profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} · {profile.configuration.analysisModel || 'sans modèle'}</option>)}
        </DesignSystemSelect>
        <p className="hint">Choisissez un modèle génératif qui accepte les images (par exemple Qwen Vision). Un modèle uniquement textuel ne convient pas.</p>
        {!compatible && <div className="diagram-teacher-notice" role="status">
          Cette configuration n’est pas adaptée. Il faut la méthode classique (générative) et un modèle d’analyse visuel.
          <Button variant="secondary" onClick={onOpenSettings}>Configurer l’IA</Button>
        </div>}
        {!isLocal ? <div className="diagram-teacher-remote">
          <p><strong>Serveur non local.</strong> Les photos seront envoyées à l’adresse configurée. Aucun transfert n’a lieu avant votre accord.</p>
          <Checkbox checked={consent} disabled={running} onChange={(event) => setConsent(event.currentTarget.checked)}>
            J’autorise l’envoi de ces images au serveur configuré pour cet essai.
          </Checkbox>
        </div> : <p className="diagram-teacher-local">Serveur sur cet ordinateur (localhost). Les images ne sont pas envoyées à une API cloud.</p>}
        <p className="hint">Une seule correction visuelle par essai, sans OCR et sans enregistrement automatique des photos dans l’historique.</p>
        <div className="diagram-teacher-actions">
          <Button disabled={!canRun} onClick={() => { void start(); }}>
            {running ? 'Correction du schéma en cours…' : 'Corriger directement l’image'}
          </Button>
          {running && <Button variant="secondary" onClick={() => abortRef.current?.abort()}>Arrêter</Button>}
        </div>
        {running && <p role="status">Analyse du dessin en cours. Le modèle peut mettre quelques minutes à répondre.</p>}
        {error && <p className="diagram-teacher-error" role="alert">{error}</p>}
        {message && <p className="diagram-teacher-message" role="status">{message}</p>}
      </section>
    </div>
    {proposal && <section className="panel diagram-teacher-result" aria-label="Proposition de correction du schéma">
      <div className="diagram-teacher-result-head">
        <div><p className="eyebrow">3. VÉRIFICATION PAR L’ENSEIGNANT</p>
          <h3>Note proposée : {proposal.finalScore} / {validation.maximumPoints}</h3>
          <p>{proposal.summary} {proposal.scoreIncomplete ? 'La note est incomplète.' : 'La note n’est pas validée automatiquement.'}</p>
        </div>
        <Button variant="secondary" onClick={exportResult}>Exporter le résultat JSON</Button>
      </div>
      {proposal.criteria.map((criterion) => {
        const defined = rubric.criteria.find((item) => item.id === criterion.criterionId);
        return <article key={criterion.criterionId} className="diagram-teacher-criterion">
          <div><strong>{defined?.title ?? criterion.criterionId}</strong><strong>{criterion.points} / {defined?.maxPoints ?? '—'} pt</strong></div>
          <p>Observation : {criterion.evidence}</p>
          <small>Confiance déclarée : {criterion.confidence === 'high' ? 'élevée' : criterion.confidence === 'medium' ? 'moyenne' : 'faible'}</small>
          {criterion.subcriteria?.length ? <ul>{criterion.subcriteria.map((sub) =>
            <li key={sub.subcriterionId}><span>{sub.title || sub.subcriterionId} · {sub.evidence}</span><strong>{sub.points} / {sub.maxPoints}</strong></li>
          )}</ul> : null}
          {criterion.questionForTeacher && <p className="diagram-teacher-question">À vérifier : {criterion.questionForTeacher}</p>}
        </article>;
      })}
      {proposal.questionsForTeacher.length > 0 && <div className="diagram-teacher-questions">
        <h4>Points à éclaircir</h4><ul>{proposal.questionsForTeacher.map((item, index) => <li key={index}>{item}</li>)}</ul>
      </div>}
      <p className="hint">Comparez les preuves à l’image originale. Le score est indicatif : seul le professeur décide de la note finale. L’export ne contient aucune photo.</p>
    </section>}
  </div>;
}
