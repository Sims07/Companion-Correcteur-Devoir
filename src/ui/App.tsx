import { useEffect, useMemo, useState } from 'react';
import { FilePicker } from './components/FilePicker.tsx';
import type { CorrectionWorkspaceService } from '../application/correctionWorkspaceService.ts';
import { parseGradingProposal, toReviewedCriteria, type GradingProposal, type ReviewedCriterion } from '../domain/grading.ts';
import { validateRubric, type Rubric, type RubricCriterion } from '../domain/rubric.ts';
import type { ImageInput } from '../ports/aiProvider.ts';

const initialRubric: Rubric = {
  title: 'Barème de biologie — exemple',
  criteria: [
    { id: 'knowledge', title: 'Connaissances scientifiques', description: 'Exactitude des notions et du vocabulaire.', maxPoints: 8 },
    { id: 'reasoning', title: 'Raisonnement', description: 'Qualité de l’argumentation et des liens logiques.', maxPoints: 7 },
    { id: 'clarity', title: 'Clarté de la réponse', description: 'Structure et lisibilité de la réponse.', maxPoints: 5 },
  ],
};

const defaultQuestion = 'Évaluez la réponse manuscrite à la question de biologie. Justifiez chaque attribution de points à partir des éléments visibles de la copie.';

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
  const remainingSeconds = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function rubricAsJson(rubric: Rubric): string {
  return JSON.stringify(rubric, null, 2);
}

export function App({ service }: { service: CorrectionWorkspaceService }) {
  const [rubric, setRubric] = useState<Rubric>(initialRubric);
  const [rubricImportMessage, setRubricImportMessage] = useState('');
  const [rubricImageImporting, setRubricImageImporting] = useState(false);
  const [question, setQuestion] = useState(defaultQuestion);
  const [endpoint, setEndpoint] = useState('http://localhost:11434');
  const [visionModel, setVisionModel] = useState('');
  const [analysisModel, setAnalysisModel] = useState('');
  const [analysisThinking, setAnalysisThinking] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [correctionMode, setCorrectionMode] = useState<'integrated' | 'separate'>('integrated');
  const [subjectImages, setSubjectImages] = useState<ImageInput[]>([]);
  const [subjectTranscription, setSubjectTranscription] = useState<string | null>(null);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<'checking' | 'reading' | 'grading'>('checking');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [streamedOutput, setStreamedOutput] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<GradingProposal | null>(null);
  const [review, setReview] = useState<ReviewedCriterion[]>([]);
  const [teacherQuestions, setTeacherQuestions] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const [isFinalized, setIsFinalized] = useState(false);
  const [interfaceMode, setInterfaceMode] = useState<'teacher' | 'diagnostic'>('teacher');
  const validation = useMemo(() => validateRubric(rubric), [rubric]);
  const reviewedTotal = review.reduce((sum, item) => sum + item.teacherPoints, 0);
  const pendingCount = review.filter((item) => item.decision === 'pending').length;

  useEffect(() => {
    if (!isAnalyzing) return;
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isAnalyzing]);

  function updateCriterion(id: string, patch: Partial<RubricCriterion>) {
    setRubric((current) => ({ ...current, criteria: current.criteria.map((criterion) => criterion.id === id ? { ...criterion, ...patch } : criterion) }));
    setProposal(null);
    setReview([]);
  }

  function addCriterion() {
    const id = `criterion-${Date.now()}`;
    setRubric((current) => ({ ...current, criteria: [...current.criteria, { id, title: 'Nouveau critère', description: '', maxPoints: 1 }] }));
  }

  async function importRubricFileFromInput(file: File | undefined) {
    if (!file) return;
    setError('');
    setRubricImportMessage('');
    try {
      const imported = await service.importRubric(file);
      setRubric(imported.rubric);
      setProposal(null);
      setReview([]);
      setTeacherQuestions('');
      setRubricImportMessage(imported.warnings.length ? imported.warnings.join(' ') : `Barème « ${imported.rubric.title} » importé. Vérifiez les critères et le total avant de lancer la correction.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’importer ce barème localement.');
    }
  }

  async function importRubricImageFromInput(file: File | undefined) {
    if (!file) return;
    setError('');
    setRubricImportMessage('');
    setRubricImageImporting(true);
    try {
      if (!visionModel.trim()) throw new Error('Passez en mode Diagnostic IA pour configurer un modèle de vision Ollama.');
      const prepared = await service.prepareFiles([file]);
      if (prepared.length !== 1) throw new Error('Choisissez une seule image de barème à la fois.');
      const imported = await service.importRubricImage(prepared[0], { endpoint, visionModel });
      setRubric(imported.rubric);
      setProposal(null);
      setReview([]);
      setTeacherQuestions('');
      setRubricImportMessage(imported.warnings.join(' ') || `Barème « ${imported.rubric.title} » importé. Vérifiez les critères et le total.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’extraire le barème avec le modèle de vision local.');
    } finally {
      setRubricImageImporting(false);
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    setReviewMessage('');
    try {
      const prepared = await service.prepareFiles(files);
      setImages((current) => [...current, ...prepared]);
      setTranscription(null);
      setProposal(null);
      setReview([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Échec de préparation des fichiers en local.');
    }
  }

  async function importSubjectFiles(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    setReviewMessage('');
    try {
      const prepared = await service.prepareFiles(files);
      setSubjectImages((current) => [...current, ...prepared]);
      setSubjectTranscription(null);
      setTranscription(null);
      setProposal(null);
      setReview([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Échec de préparation du sujet en local.');
    }
  }

  async function connectOllama() {
    setBusy(true);
    setError('');
    setConnectionMessage('');
    try {
      const models = await service.listModels(endpoint);
      setAvailableModels(models.map((item) => item.name));
      if (!visionModel && models[0]) setVisionModel(models[0].name);
      if (!analysisModel && models[0]) setAnalysisModel(models[0].name);
      setConnectionMessage(models.length ? `Connexion réussie · ${models.length} modèle(s) disponible(s). Choisissez un modèle de vision pour la lecture et un modèle textuel pour l’analyse.` : 'Connexion réussie, mais aucun modèle installé. Installez un modèle compatible avec les images et un modèle pour l’analyse.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connexion à Ollama impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function gradeCopies() {
    setBusy(true);
    setIsAnalyzing(true);
    setAnalysisStage('checking');
    setStreamedOutput('');
    setError('');
    setReviewMessage('');
    setIsFinalized(false);
    try {
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      if (!images.length) throw new Error('Importez au moins une photo ou un PDF de la copie.');
      if (correctionMode === 'separate' && !subjectImages.length && !subjectTranscription) throw new Error('Importez le sujet de référence pour ce mode de correction.');
      if ((!transcription || (correctionMode === 'separate' && !subjectTranscription))) await service.checkReady({ endpoint, model: visionModel });
      await service.checkReady({ endpoint, model: analysisModel });
      setAnalysisStage('reading');
      const provider = service.createProvider({ endpoint, visionModel, analysisModel, thinking: analysisThinking });
      const raw = await provider.generate(
        { question, rubric: rubricAsJson(rubric), images, ...(correctionMode === 'separate' ? { subjectImages, ...(subjectTranscription ? { subjectTranscription } : {}) } : {}), ...(transcription ? { transcription } : {}) },
        (chunk) => setStreamedOutput((current) => current + chunk),
        (stage) => { setAnalysisStage(stage); if (stage === 'grading') setStreamedOutput(''); },
        (extracted, kind) => {
          if (kind === 'subject') setSubjectTranscription(extracted);
          else setTranscription(extracted);
        },
      );
      const parsed = parseGradingProposal(raw, rubric);
      setProposal(parsed);
      setReview(toReviewedCriteria(parsed));
      setTeacherQuestions(parsed.questionsForTeacher.join('\n'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'La correction a échoué.');
    } finally {
      setIsAnalyzing(false);
      setBusy(false);
    }
  }

  function updateReview(id: string, patch: Partial<ReviewedCriterion>) {
    setIsFinalized(false);
    setReviewMessage('');
    setReview((current) => current.map((item) => item.criterionId === id ? { ...item, ...patch } : item));
  }

  function finalizeReview() {
    if (pendingCount > 0) {
      setReviewMessage(`Impossible de finaliser : ${pendingCount} critère(s) attendent encore votre décision.`);
      return;
    }
    setIsFinalized(true);
    setReviewMessage(teacherQuestions.trim()
      ? 'Correction finalisée sur cet appareil. Vérifiez les questions ouvertes avant de communiquer la note.'
      : 'Correction finalisée sur cet appareil. Vous pouvez maintenant exporter le résultat en JSON.');
  }

  function decideAll() {
    setIsFinalized(false);
    setReviewMessage('');
    setReview((current) => current.map((item) => ({ ...item, decision: item.decision === 'adjusted' ? 'adjusted' : 'accepted' })));
    setReviewMessage('Les propositions non modifiées sont marquées comme acceptées par l’enseignant. Pensez à traiter les questions ouvertes.');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">CC</div>
        <div><p className="eyebrow">ASSISTANT PÉDAGOGIQUE LOCAL</p><h1>Compagnon Correcteur de Devoirs</h1></div>
        <div className="topbar-actions"><span className="local-badge"><span /> Mode local prioritaire</span><div className="view-switch" role="group" aria-label="Mode d’interface"><button type="button" className={interfaceMode === 'teacher' ? 'view-switch-button active' : 'view-switch-button'} aria-pressed={interfaceMode === 'teacher'} onClick={() => setInterfaceMode('teacher')}>Correction</button><button type="button" className={interfaceMode === 'diagnostic' ? 'view-switch-button active' : 'view-switch-button'} aria-pressed={interfaceMode === 'diagnostic'} onClick={() => setInterfaceMode('diagnostic')}>Diagnostic IA</button></div></div>
      </header>

      <section className="welcome">
        <div className="welcome-copy">
          <p className="eyebrow">{interfaceMode === 'teacher' ? 'ESPACE ENSEIGNANT · BIOLOGIE' : 'ESPACE DE DIAGNOSTIC · IA LOCALE'}</p>
          <h2>{interfaceMode === 'teacher' ? <>Une correction plus claire.<br /><em>Vous gardez la décision.</em></> : <>Comprendre les résultats.<br /><em>Affiner les réglages IA.</em></>}</h2>
          <p className="intro">{interfaceMode === 'teacher' ? 'Importez les copies, appliquez votre barème et révisez chaque proposition. L’assistant signale ses incertitudes ; aucune note n’est validée automatiquement.' : 'Accédez aux réglages Ollama, aux modèles et aux sorties de diagnostic pour analyser le comportement de l’assistant. Les copies restent traitées par le serveur configuré.'}</p>
        </div>
        <div className="illustration" aria-hidden="true"><div className="paper"><span /><span /><span /><b>✓</b></div><div className="leaf leaf-one" /><div className="leaf leaf-two" /></div>
      </section>

      <section className="privacy-strip">
        <span className="privacy-icon">⌂</span>
        <div><strong>Traitement local, sans repli cloud</strong><p>Les fichiers sont lus et préparés dans votre navigateur, puis envoyés uniquement à l’adresse Ollama que vous configurez. Aucun stockage distant ni envoi vers un fournisseur cloud n’est prévu.</p></div>
        <span className="privacy-status">OLLAMA LOCAL</span>
      </section>

      <div className="workspace-heading"><div><p className="eyebrow">ÉTAPE 1</p><h2>Configurer le barème</h2></div><span className="step-count">{validation.maximumPoints} POINTS AU TOTAL</span></div>
      <section className="panel rubric-editor">
        <label className="field-label" htmlFor="rubric-title">Nom du barème</label>
        <input id="rubric-title" value={rubric.title} onChange={(event) => { setRubric((current) => ({ ...current, title: event.target.value })); setProposal(null); }} />
        <div className="rubric-import">
          <label className="field-label" htmlFor="rubric-file">Importer un barème existant (PDF, Word (.docx), Excel (.xlsx), CSV, TXT ou JSON)</label>
          <FilePicker id="rubric-file" accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json" onFilesSelected={(files) => { void importRubricFileFromInput(files?.[0]); }} title="Importer un document de barème" description="PDF, Word, Excel, CSV, TXT, Markdown ou JSON" actionLabel="Parcourir les fichiers" />
          <p className="hint">Les documents texte sont extraits localement dans le navigateur, sans IA. Vérifiez les critères, les points et le total après import.</p>
          <label className="field-label" htmlFor="rubric-image-file">Ou importer une photo / un scan du barème (JPEG, PNG, WebP)</label>
          <FilePicker id="rubric-image-file" accept="image/jpeg,image/png,image/webp" disabled={rubricImageImporting} onFilesSelected={(files) => { void importRubricImageFromInput(files?.[0]); }} title="Importer une photo ou un scan" description="JPEG, PNG ou WebP · une image à la fois" actionLabel={rubricImageImporting ? 'Lecture en cours…' : 'Choisir une image'} compact />
          <p className="hint">{rubricImageImporting ? 'Lecture du barème par le modèle de vision local…' : 'Une seule requête au modèle de vision Ollama sélectionné, avec sortie JSON structurée. L’image n’est envoyée qu’à votre serveur Ollama configuré ; aucun service cloud n’est utilisé. Vérifiez toujours le résultat avant utilisation.'}</p>
          {rubricImportMessage && <p className="validation valid" role="status">{rubricImportMessage}</p>}
        </div>
        <div className="criteria-list">
          {rubric.criteria.map((criterion) => <div className="criterion-editor" key={criterion.id}>
            <div className="criterion-fields">
              <label><span className="field-label">Critère</span><input value={criterion.title} onChange={(event) => updateCriterion(criterion.id, { title: event.target.value })} /></label>
              <label><span className="field-label">Description / attendus</span><input value={criterion.description} onChange={(event) => updateCriterion(criterion.id, { description: event.target.value })} /></label>
            </div>
            <label className="points-field"><span className="field-label">Points max.</span><input type="number" min="0" step="0.5" value={criterion.maxPoints} onChange={(event) => updateCriterion(criterion.id, { maxPoints: Number(event.target.value) })} /></label>
            <button className="icon-button" type="button" aria-label={`Supprimer ${criterion.title}`} onClick={() => setRubric((current) => ({ ...current, criteria: current.criteria.filter((item) => item.id !== criterion.id) }))}>×</button>
          </div>)}
        </div>
        <div className="rubric-actions"><button className="secondary-button" onClick={addCriterion}>+ Ajouter un critère</button><span className={validation.valid ? 'validation valid' : 'validation invalid'}>{validation.valid ? '✓ Barème cohérent' : validation.errors.join(' ')}</span></div>
      </section>

      <div className="workspace-heading"><div><p className="eyebrow">ÉTAPE 2</p><h2>Préparer le sujet et la copie</h2></div><span className="step-count">{images.length} PAGE(S) DE COPIE · {transcription ? 'TRANSCRIPTION DISPONIBLE' : 'À LIRE'}</span></div>
      <section className="panel correction-mode-panel" aria-labelledby="correction-mode-title">
        <div className="panel-heading"><span className="number">02</span><div><h3 id="correction-mode-title">Où se trouvent les questions ?</h3><p>Choisissez le format utilisé pour ce devoir. Vous pourrez corriger les copies une par une.</p></div></div>
        <div className="correction-mode-options" role="group" aria-label="Mode de correction">
          <label className={correctionMode === 'integrated' ? 'correction-mode-option selected' : 'correction-mode-option'}><input type="radio" name="correction-mode" value="integrated" checked={correctionMode === 'integrated'} onChange={() => { setCorrectionMode('integrated'); setSubjectTranscription(null); }} /><span><strong>Questions intégrées à la copie</strong><small>Les questions et les réponses sont sur les mêmes feuilles.</small></span></label>
          <label className={correctionMode === 'separate' ? 'correction-mode-option selected' : 'correction-mode-option'}><input type="radio" name="correction-mode" value="separate" checked={correctionMode === 'separate'} onChange={() => { setCorrectionMode('separate'); setProposal(null); setReview([]); }} /><span><strong>Sujet fourni séparément</strong><small>Le sujet de référence est distinct des pages de réponses manuscrites.</small></span></label>
        </div>
      </section>
      {correctionMode === 'separate' && <section className="panel subject-panel">
        <div className="panel-heading"><span className="number">A</span><div><h3>Sujet de référence</h3><p>Importez les questions et leurs éventuels schémas une seule fois pour ce devoir.</p></div></div>
        <label className="upload-placeholder" htmlFor="subject-files"><span className="upload-icon">↑</span><strong>Choisir les pages du sujet</strong><p>JPG, PNG, WebP ou PDF · 15 Mo maximum par fichier</p><span className="primary-button">Importer le sujet</span><span className="upload-note">Les pages sont préparées dans le navigateur. Elles sont transmises uniquement au serveur Ollama configuré pour en extraire le contenu.</span></label>
        <FilePicker id="subject-files" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple onFilesSelected={(files) => { void importSubjectFiles(files); }} title="Déposer les pages du sujet ici" description="JPG, PNG, WebP ou PDF · 15 Mo maximum par fichier" actionLabel="Parcourir les fichiers" />
        {subjectImages.length > 0 && <div className="file-list"><strong>{subjectImages.length} page(s) de sujet prête(s)</strong>{subjectImages.map((image, index) => <div className="file-row" key={`${image.fileName}-${index}`}><span>{image.fileName || `Page ${index + 1}`}</span><button type="button" className="text-button" onClick={() => { setSubjectImages((current) => current.filter((_, imageIndex) => imageIndex !== index)); setSubjectTranscription(null); }}>Retirer</button></div>)}<button type="button" className="text-button" onClick={() => { setSubjectImages([]); setSubjectTranscription(null); }}>Retirer toutes les pages du sujet</button></div>}
        {subjectTranscription && <p className="validation valid" role="status">Sujet lu localement et prêt à être réutilisé pour les copies suivantes de ce devoir.</p>}
      </section>}
      <section className="setup-grid">
        <article className="panel copy-panel">
          <div className="panel-heading"><span className="number">03</span><div><h3>Copie de l’étudiant</h3><p>Importez les pages d’un seul étudiant à la fois.</p></div></div>
          <label className="upload-placeholder" htmlFor="copy-files"><span className="upload-icon">↑</span><strong>Choisir les pages de la copie</strong><p>JPG, PNG, WebP ou PDF · 15 Mo maximum par fichier</p><span className="primary-button">Sélectionner les pages</span><span className="upload-note">Sélectionnez uniquement les pages d’un même étudiant. Les PDF sont convertis en images dans ce navigateur (10 pages max).</span></label>
          <FilePicker id="copy-files" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple onFilesSelected={(files) => { void importFiles(files); }} title="Déposer les pages de la copie ici" description="JPG, PNG, WebP ou PDF · 15 Mo maximum par fichier" actionLabel="Choisir les fichiers" />
          {images.length > 0 && <div className="file-list"><strong>{images.length} page(s) prête(s) à analyser</strong>{images.map((image, index) => <div className="file-row" key={`${image.fileName}-${index}`}><span>{image.fileName}</span><button className="text-button" onClick={() => { setImages((current) => current.filter((_, imageIndex) => imageIndex !== index)); setTranscription(null); }}>Retirer</button></div>)}<button className="text-button" onClick={() => { setImages([]); setTranscription(null); setProposal(null); setReview([]); setTeacherQuestions(''); setIsFinalized(false); }}>Effacer cette copie et passer à la suivante</button></div>}
        </article>
        {interfaceMode === 'diagnostic' ? <article className="panel ollama-panel">
          <div className="panel-heading"><span className="number">03</span><div><h3>Modèle local Ollama</h3><p>Configurez votre serveur et vérifiez les modèles installés.</p></div></div>
          <label className="field-label" htmlFor="ollama-endpoint">Adresse du serveur</label>
          <input id="ollama-endpoint" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setAvailableModels([]); setConnectionMessage(''); setTranscription(null); }} placeholder="http://localhost:11434" />
          <label className="field-label" htmlFor="ollama-vision-model">Modèle de lecture (vision)</label>
          {availableModels.length > 0 ? <select id="ollama-vision-model" value={visionModel} onChange={(event) => { setVisionModel(event.target.value); setTranscription(null); }}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input id="ollama-vision-model" value={visionModel} onChange={(event) => setVisionModel(event.target.value)} placeholder="ex. gemma3:4b, qwen2.5vl" />}
          <p className="hint">Ce modèle lit les images et transcrit la copie sans la corriger. La transcription reste en mémoire locale pour relancer l’analyse sans refaire cette étape.</p>
          <label className="field-label" htmlFor="ollama-analysis-model">Modèle d’analyse et de notation</label>
          {availableModels.length > 0 ? <select id="ollama-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input id="ollama-analysis-model" value={analysisModel} onChange={(event) => setAnalysisModel(event.target.value)} placeholder="ex. qwen3.5:4b, phi4-mini" />
          }
          <label className="analysis-thinking-option" htmlFor="ollama-analysis-thinking">
            <input id="ollama-analysis-thinking" type="checkbox" checked={analysisThinking} onChange={(event) => setAnalysisThinking(event.target.checked)} />
            <span><strong>Activer le mode thinking pour l’analyse</strong><small>Désactivé par défaut. Peut améliorer le raisonnement, mais allonger fortement le temps de correction et ne fonctionne pas avec tous les modèles.</small></span>
          </label>
          <button className="secondary-button full-button" disabled={busy} onClick={() => void connectOllama()}>{busy ? 'Connexion…' : 'Tester la connexion et lister les modèles'}</button>
          {connectionMessage && <p className="validation valid" role="status">{connectionMessage}</p>}
          <p className="hint">Le modèle de lecture doit accepter les images ; le modèle d’analyse peut être textuel. Si le navigateur bloque la connexion, configurez les origines CORS d’Ollama pour votre adresse locale. Aucun basculement cloud n’a lieu en cas d’échec.</p>
        </article> : <article className="panel ai-summary-panel"><div className="panel-heading"><span className="number"><span aria-hidden="true">✓</span></span><div><h3>IA locale</h3><p>{visionModel && analysisModel ? `Lecture : ${visionModel} · Analyse : ${analysisModel}` : 'Configuration à vérifier avant la première correction.'}</p></div></div><p className="hint">{connectionMessage || 'Les copies ne sont envoyées qu’à votre serveur Ollama configuré. Les réglages techniques restent masqués dans cette vue.'}</p><button type="button" className="secondary-button full-button" onClick={() => setInterfaceMode('diagnostic')}>{visionModel && analysisModel ? 'Modifier les paramètres IA' : 'Configurer Ollama et les modèles'}</button></article>}
      </section>

      <section className="panel question-panel">
        <label className="field-label" htmlFor="grading-question">Consigne / question de l’exercice</label>
        <textarea id="grading-question" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} />
        <button className="primary-button grade-button" disabled={busy || !images.length || !visionModel.trim() || !analysisModel.trim() || !validation.valid} onClick={() => void gradeCopies()}>{busy ? 'Analyse locale en cours…' : transcription ? 'Relancer l’analyse sans relire les images' : 'Lire puis analyser les copies'}</button>
      </section>

      {isAnalyzing && <section className="analysis-progress" role="status" aria-live="polite" aria-atomic="true">
        <div className="analysis-spinner" aria-hidden="true" />
        <div className="analysis-progress-copy">
          <p className="eyebrow">TRAITEMENT LOCAL · 2 ÉTAPES</p>
          <div className="analysis-steps" aria-label="Étapes de la correction">
            <div className={'analysis-step ' + (analysisStage === 'reading' ? 'current' : analysisStage === 'grading' ? 'complete' : '')} aria-current={analysisStage === 'reading' ? 'step' : undefined}>
              <span className="analysis-step-number">{analysisStage === 'grading' ? '✓' : '1'}</span>
              <div><strong>Lire l’image</strong><small>{analysisStage === 'checking' ? 'En attente' : analysisStage === 'reading' ? 'Lecture en cours…' : 'Lecture terminée'}</small></div>
            </div>
            <div className={'analysis-step ' + (analysisStage === 'grading' ? 'current' : '')} aria-current={analysisStage === 'grading' ? 'step' : undefined}>
              <span className="analysis-step-number">2</span>
              <div><strong>Analyser et noter</strong><small>{analysisStage === 'checking' || analysisStage === 'reading' ? 'À venir' : 'Analyse en cours…'}</small></div>
            </div>
          </div>
          <h3>{analysisStage === 'checking' ? 'Vérification des modèles Ollama…' : analysisStage === 'reading' ? 'Étape 1/2 — Lecture des images et transcription…' : 'Étape 2/2 — Analyse du contenu et attribution des points…'}</h3>
          <p>{analysisStage === 'checking' ? 'Je vérifie que les deux modèles répondent, sans joindre de copie.' : analysisStage === 'reading' ? 'Le modèle de lecture transcrit chaque page localement. La transcription s’affiche au fil du streaming.' : 'Le modèle d’analyse applique le barème à la transcription. La proposition de correction arrive en streaming.'}</p>
          {interfaceMode === 'diagnostic' && streamedOutput && <div className="streaming-preview" aria-live="polite"><strong>Réponse reçue en streaming</strong><pre>{streamedOutput}</pre></div>}
          {elapsedSeconds >= 30 && <p className="analysis-long-wait">Cette analyse prend du temps : certains modèles locaux nécessitent plusieurs minutes, notamment avec plusieurs pages. Le temps affiché continue de mesurer l’attente.</p>}
        </div>
        <div className="analysis-timer" aria-label={`Temps écoulé : ${formatElapsed(elapsedSeconds)}`}>
          <span>TEMPS ÉCOULÉ</span><strong>{formatElapsed(elapsedSeconds)}</strong>
        </div>
      </section>}

      {transcription && <p className="validation valid" role="status">✓ Transcription disponible en mémoire locale : vous pouvez relancer l’analyse sans repasser par le modèle de vision.</p>}

      {error && <div className="error-banner" role="alert"><strong>Une action est nécessaire</strong><p>{error}</p></div>}

      {proposal && <section className="review-section">
        <div className="workspace-heading"><div><p className="eyebrow">ÉTAPE 3</p><h2>Réviser la proposition de correction</h2></div><span className="step-count">{pendingCount} À VÉRIFIER</span></div>
        <div className="summary-panel"><strong>Synthèse de l’assistant</strong><p>{proposal.summary}</p><span>Note proposée : {proposal.criteria.reduce((sum, item) => sum + item.points, 0)} / {validation.maximumPoints} points</span></div>
        {review.map((item) => {
          const criterion = rubric.criteria.find((entry) => entry.id === item.criterionId);
          return <article className="panel review-card" key={item.criterionId}>
            <div className="review-card-heading"><div><h3>{criterion?.title ?? item.criterionId}</h3><p>Maximum : {criterion?.maxPoints ?? 0} points</p></div><span className={`confidence confidence-${item.confidence}`}>Confiance {item.confidence === 'high' ? 'élevée' : item.confidence === 'medium' ? 'moyenne' : 'faible'}</span></div>
            <div className="evidence"><span>ÉLÉMENTS REPÉRÉS</span><p>{item.evidence}</p></div>
            <p className="rationale">{item.rationale}</p>
            {item.confidence === 'low' && <p className="teacher-question"><strong>Lecture à vérifier :</strong> {item.questionForTeacher || 'Le modèle est incertain sur ce critère. Vérifiez la preuve citée et la note proposée ; aucune question précise ne peut être formulée automatiquement.'}</p>}
            <div className="review-controls">
              <label><span className="field-label">Votre note</span><input type="number" min="0" max={criterion?.maxPoints ?? 0} step="0.5" value={item.teacherPoints} onChange={(event) => updateReview(item.criterionId, { teacherPoints: Number(event.target.value), decision: 'adjusted' })} /></label>
              <label className="comment-field"><span className="field-label">Commentaire enseignant</span><input value={item.teacherComment} onChange={(event) => updateReview(item.criterionId, { teacherComment: event.target.value })} placeholder="Précision ou correction éventuelle" /></label>
              <button className={item.decision === 'accepted' ? 'decision-button accepted' : 'decision-button'} onClick={() => updateReview(item.criterionId, { decision: item.decision === 'accepted' ? 'pending' : 'accepted' })}>{item.decision === 'accepted' ? '✓ Accepté' : item.decision === 'adjusted' ? 'Note ajustée' : 'Accepter'}</button>
            </div>
          </article>;
        })}
        <div className="panel final-review"><div><span className="eyebrow">RÉCAPITULATIF ENSEIGNANT</span><h3>{reviewedTotal} / {validation.maximumPoints} points</h3><p>{pendingCount} critère(s) encore en attente de validation.</p>{isFinalized && <p className="finalized-status" role="status">✓ Correction finalisée localement</p>}</div><div className="questions-field"><span className="field-label">Points précis à clarifier</span>{teacherQuestions.trim() ? <ul className="teacher-questions-list">{teacherQuestions.split('\n').map((line) => line.trim()).filter(Boolean).map((line, index) => <li key={index}>{line}</li>)}</ul> : <p className="no-teacher-questions">Aucune question précise à vous soumettre. Vérifiez les éléments signalés comme incertains ci-dessus avant validation.</p>}</div><button className="primary-button" onClick={decideAll}>Accepter les propositions non modifiées</button><button className="primary-button" disabled={pendingCount > 0} onClick={finalizeReview}>Finaliser la correction</button><button className="secondary-button" onClick={() => { const payload = { rubric, question, summary: proposal.summary, criteria: review, questionsForTeacher: teacherQuestions.split('\n').map((line) => line.trim()).filter(Boolean), total: reviewedTotal, exportedAt: new Date().toISOString() }; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'proposition-correction.json'; link.click(); URL.revokeObjectURL(url); setReviewMessage('Récapitulatif JSON exporté sur votre appareil. Vérifiez les questions ouvertes avant toute utilisation de la note.'); }}>{isFinalized ? 'Télécharger la correction finale (JSON)' : 'Exporter le récapitulatif provisoire (JSON)'}</button>{reviewMessage && <p className="validation valid" role="status">{reviewMessage}</p>}</div>
      </section>}

      <footer><span>Compagnon Correcteur de Devoirs</span><span>Une suggestion d’IA reste une suggestion. <strong>La décision est humaine.</strong></span></footer>
    </main>
  );
}
