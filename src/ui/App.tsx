import { useEffect, useMemo, useState } from 'react';
import { checkOllamaReady, createOllamaProvider, listOllamaModels } from '../adapters/ai/ollamaProvider.ts';
import { prepareLocalFiles } from '../adapters/files/localFiles.ts';
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

export function App() {
  const [rubric, setRubric] = useState<Rubric>(initialRubric);
  const [question, setQuestion] = useState(defaultQuestion);
  const [endpoint, setEndpoint] = useState('http://localhost:11434');
  const [model, setModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStage, setAnalysisStage] = useState<'checking' | 'grading'>('checking');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [streamedOutput, setStreamedOutput] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [error, setError] = useState('');
  const [proposal, setProposal] = useState<GradingProposal | null>(null);
  const [review, setReview] = useState<ReviewedCriterion[]>([]);
  const [teacherQuestions, setTeacherQuestions] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
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

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    setReviewMessage('');
    try {
      const prepared = await prepareLocalFiles(files);
      setImages((current) => [...current, ...prepared]);
      setProposal(null);
      setReview([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Échec de préparation des fichiers en local.');
    }
  }

  async function connectOllama() {
    setBusy(true);
    setError('');
    setConnectionMessage('');
    try {
      const models = await listOllamaModels(endpoint);
      setAvailableModels(models.map((item) => item.name));
      if (!model && models[0]) setModel(models[0].name);
      setConnectionMessage(models.length ? `Connexion réussie · ${models.length} modèle(s) disponible(s).` : 'Connexion réussie, mais aucun modèle installé. Installez un modèle de vision compatible avec les images.');
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
    try {
      if (!validation.valid) throw new Error(validation.errors.join(' '));
      if (!images.length) throw new Error('Importez au moins une photo ou un PDF.');
      await checkOllamaReady({ endpoint, model });
      setAnalysisStage('grading');
      const provider = createOllamaProvider({ endpoint, model });
      const raw = await provider.generate({ question, rubric: rubricAsJson(rubric), images }, (chunk) => setStreamedOutput((current) => current + chunk));
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
    setReview((current) => current.map((item) => item.criterionId === id ? { ...item, ...patch } : item));
  }

  function decideAll() {
    setReview((current) => current.map((item) => ({ ...item, decision: item.decision === 'adjusted' ? 'adjusted' : 'accepted' })));
    setReviewMessage('Les propositions non modifiées sont marquées comme acceptées par l’enseignant. Pensez à traiter les questions ouvertes.');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">CC</div>
        <div><p className="eyebrow">ASSISTANT PÉDAGOGIQUE LOCAL</p><h1>Companion Correcteur Devoir</h1></div>
        <span className="local-badge"><span /> Mode local prioritaire</span>
      </header>

      <section className="welcome">
        <div className="welcome-copy">
          <p className="eyebrow">ESPACE ENSEIGNANT · BIOLOGIE</p>
          <h2>Une correction plus claire.<br /><em>Vous gardez la décision.</em></h2>
          <p className="intro">Importez les copies, appliquez votre barème et révisez chaque proposition. L’assistant signale ses incertitudes ; aucune note n’est validée automatiquement.</p>
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

      <div className="workspace-heading"><div><p className="eyebrow">ÉTAPE 2</p><h2>Importer les copies et configurer l’IA</h2></div><span className="step-count">{images.length} IMAGE(S) PRÉPARÉE(S)</span></div>
      <section className="setup-grid">
        <article className="panel copy-panel">
          <div className="panel-heading"><span className="number">02</span><div><h3>Copies à corriger</h3><p>Photos, scans ou PDF multipages.</p></div></div>
          <label className="upload-placeholder" htmlFor="copy-files"><span className="upload-icon">↑</span><strong>Choisir les copies</strong><p>JPG, PNG, WebP ou PDF · 15 Mo maximum par fichier</p><span className="primary-button">Sélectionner les fichiers</span><span className="upload-note">Les PDF sont convertis en images dans ce navigateur (10 pages max).</span></label>
          <input id="copy-files" className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple onChange={(event) => { void importFiles(event.target.files); event.currentTarget.value = ''; }} />
          {images.length > 0 && <div className="file-list"><strong>{images.length} page(s) prête(s) à analyser</strong>{images.map((image, index) => <div className="file-row" key={`${image.fileName}-${index}`}><span>{image.fileName}</span><button className="text-button" onClick={() => setImages((current) => current.filter((_, imageIndex) => imageIndex !== index))}>Retirer</button></div>)}<button className="text-button" onClick={() => setImages([])}>Retirer toutes les pages</button></div>}
        </article>
        <article className="panel ollama-panel">
          <div className="panel-heading"><span className="number">03</span><div><h3>Modèle local Ollama</h3><p>Configurez votre serveur et vérifiez les modèles installés.</p></div></div>
          <label className="field-label" htmlFor="ollama-endpoint">Adresse du serveur</label>
          <input id="ollama-endpoint" value={endpoint} onChange={(event) => { setEndpoint(event.target.value); setAvailableModels([]); setConnectionMessage(''); }} placeholder="http://localhost:11434" />
          <label className="field-label" htmlFor="ollama-model">Modèle vision</label>
          {availableModels.length > 0 ? <select id="ollama-model" value={model} onChange={(event) => setModel(event.target.value)}>{availableModels.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input id="ollama-model" value={model} onChange={(event) => setModel(event.target.value)} placeholder="ex. llava, qwen2.5vl" />}
          <button className="secondary-button full-button" disabled={busy} onClick={() => void connectOllama()}>{busy ? 'Connexion…' : 'Tester la connexion et lister les modèles'}</button>
          {connectionMessage && <p className="validation valid" role="status">{connectionMessage}</p>}
          <p className="hint">Utilisez un modèle qui accepte les images. Si le navigateur bloque la connexion, configurez les origines CORS d’Ollama pour votre adresse locale. Aucun basculement cloud n’a lieu en cas d’échec.</p>
        </article>
      </section>

      <section className="panel question-panel">
        <label className="field-label" htmlFor="grading-question">Consigne / question de l’exercice</label>
        <textarea id="grading-question" rows={3} value={question} onChange={(event) => setQuestion(event.target.value)} />
        <button className="primary-button grade-button" disabled={busy || !images.length || !model.trim() || !validation.valid} onClick={() => void gradeCopies()}>{busy ? 'Analyse locale en cours…' : 'Analyser les copies avec Ollama'}</button>
      </section>

      {isAnalyzing && <section className="analysis-progress" role="status" aria-live="polite" aria-atomic="true">
        <div className="analysis-spinner" aria-hidden="true" />
        <div className="analysis-progress-copy">
          <p className="eyebrow">TRAITEMENT LOCAL</p>
          <h3>{analysisStage === 'checking' ? 'Vérification du modèle Ollama…' : 'Le modèle répond : analyse des copies…'}</h3>
          <p>{analysisStage === 'checking' ? 'J’envoie un court message de test, sans copie jointe, pour vérifier que le modèle sélectionné répond bien. Le modèle peut avoir besoin de se charger en mémoire.' : 'Le modèle a répondu au test de disponibilité. Les copies sont maintenant envoyées pour préparer la proposition de correction. Gardez cette page ouverte.'}</p>
          {streamedOutput && <div className="streaming-preview" aria-live="polite"><strong>Réponse reçue en streaming</strong><pre>{streamedOutput}</pre></div>}
          {elapsedSeconds >= 30 && <p className="analysis-long-wait">Cette analyse prend du temps : certains modèles locaux nécessitent plusieurs minutes, notamment avec plusieurs pages. Le temps affiché continue de mesurer l’attente.</p>}
        </div>
        <div className="analysis-timer" aria-label={`Temps écoulé : ${formatElapsed(elapsedSeconds)}`}>
          <span>TEMPS ÉCOULÉ</span><strong>{formatElapsed(elapsedSeconds)}</strong>
        </div>
      </section>}

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
            {item.questionForTeacher && <p className="teacher-question"><strong>Question de l’assistant :</strong> {item.questionForTeacher}</p>}
            <div className="review-controls">
              <label><span className="field-label">Votre note</span><input type="number" min="0" max={criterion?.maxPoints ?? 0} step="0.5" value={item.teacherPoints} onChange={(event) => updateReview(item.criterionId, { teacherPoints: Number(event.target.value), decision: 'adjusted' })} /></label>
              <label className="comment-field"><span className="field-label">Commentaire enseignant</span><input value={item.teacherComment} onChange={(event) => updateReview(item.criterionId, { teacherComment: event.target.value })} placeholder="Précision ou correction éventuelle" /></label>
              <button className={item.decision === 'accepted' ? 'decision-button accepted' : 'decision-button'} onClick={() => updateReview(item.criterionId, { decision: item.decision === 'accepted' ? 'pending' : 'accepted' })}>{item.decision === 'accepted' ? '✓ Accepté' : item.decision === 'adjusted' ? 'Note ajustée' : 'Accepter'}</button>
            </div>
          </article>;
        })}
        <div className="panel final-review"><div><span className="eyebrow">RÉCAPITULATIF ENSEIGNANT</span><h3>{reviewedTotal} / {validation.maximumPoints} points</h3><p>{pendingCount} critère(s) encore en attente de validation.</p></div><label className="questions-field"><span className="field-label">Questions à résoudre avant validation</span><textarea rows={3} value={teacherQuestions} onChange={(event) => setTeacherQuestions(event.target.value)} placeholder="Questions signalées par l’assistant…" /></label><button className="primary-button" onClick={decideAll}>Accepter les propositions non modifiées</button><button className="secondary-button" onClick={() => { const payload = { rubric, question, summary: proposal.summary, criteria: review, questionsForTeacher: teacherQuestions.split('\n').map((line) => line.trim()).filter(Boolean), total: reviewedTotal, exportedAt: new Date().toISOString() }; const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'proposition-correction.json'; link.click(); URL.revokeObjectURL(url); setReviewMessage('Récapitulatif JSON exporté sur votre appareil. Vérifiez les questions ouvertes avant toute utilisation de la note.'); }}>Exporter le récapitulatif JSON</button>{reviewMessage && <p className="validation valid" role="status">{reviewMessage}</p>}</div>
      </section>}

      <footer><span>Companion Correcteur Devoir</span><span>Une suggestion d’IA reste une suggestion. <strong>La décision est humaine.</strong></span></footer>
    </main>
  );
}
