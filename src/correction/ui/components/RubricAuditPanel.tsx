import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getRubricSubcriteria, rubricEvaluationSignature, type Rubric } from '../../domain/rubric.ts';
import {
  matchesRubricAudit, parseRubricAudit, validRubricAuditSession,
  type RubricAuditDecision, type RubricAuditIssue, type RubricAuditSession,
} from '../../domain/rubricAudit.ts';
import { cancelRubricAuditTask, getRubricAuditTask, launchRubricAuditTask, rubricAuditStorageKey, subscribeRubricAuditTask } from '../../application/rubricAuditTask.ts';
import { createClarifiedRubricVersion, type ClarifiedRubricVersion } from '../../domain/rubricClarification.ts';
import './RubricAuditPanel.css';

interface Props {
  rubric: Rubric;
  assignmentId: string;
  endpoint: string;
  model: string;
  onApply: (rubric: Rubric) => void;
}

const versionsKey = (assignmentId: string) => 'companion-correcteur:rubric-versions:v1:' + assignmentId;

function loadVersions(assignmentId: string): ClarifiedRubricVersion[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(versionsKey(assignmentId)) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((item): item is ClarifiedRubricVersion =>
      item && typeof item === 'object' && typeof item.appliedAt === 'string'
      && typeof item.originalSignature === 'string' && typeof item.clarifiedSignature === 'string') : [];
  } catch { return []; }
}

function formatElapsed(startedAt: number | undefined, now: number): string {
  const seconds = Math.max(0, Math.floor((now - (startedAt ?? now)) / 1000));
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}

function load(assignmentId: string, rubric: Rubric): RubricAuditSession | null {
  try {
    const saved = window.localStorage.getItem(rubricAuditStorageKey(assignmentId));
    return saved ? validRubricAuditSession(JSON.parse(saved), rubric) : null;
  } catch { return null; }
}

function displayTitle(issue: RubricAuditIssue, rubric: Rubric): string {
  const criterion = rubric.criteria.find((item) => item.id === issue.criterionId);
  const subcriterion = getRubricSubcriteria(criterion!).find((item) => item.id === issue.subcriterionId);
  return [criterion?.title ?? issue.criterionId, subcriterion?.title].filter(Boolean).join(' / ');
}

export function RubricAuditPanel({ rubric, assignmentId, endpoint, model, onApply }: Props) {
  const signature = rubricEvaluationSignature(rubric);
  const [session, setSession] = useState<RubricAuditSession | null>(() => load(assignmentId, rubric));
  const subscribe = useCallback((listener: () => void) => subscribeRubricAuditTask(assignmentId, listener), [assignmentId]);
  const getSnapshot = useCallback(() => getRubricAuditTask(assignmentId), [assignmentId]);
  const task = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const busy = task.state === 'running';
  const taskIsCurrent = task.signature === signature;
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState('');
  const [recoveryText, setRecoveryText] = useState('');
  const [activeIssueIndex, setActiveIssueIndex] = useState(0);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [versions, setVersions] = useState<ClarifiedRubricVersion[]>(() => loadVersions(assignmentId));

  useEffect(() => {
    if (!busy) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [busy, task.startedAt]);

  useEffect(() => {
    if (task.state !== 'success' || !taskIsCurrent || !task.report) return;
    // Keep the teacher's saved choices after navigation; if local storage is
    // unavailable, the in-memory report is still visible.
    setSession(load(assignmentId, rubric) ?? { report: task.report, decisions: [] });
  // The rubric is matched by its content signature, not its object identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, signature, task.state, task.report]);

  useEffect(() => {
    setSession(load(assignmentId, rubric));
    setMessage('');
    setAnswers({});
    setCustom({});
    setVersions(loadVersions(assignmentId));
  // Loading depends on the rubric's actual content, not its object identity.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId, signature]);

  const current = session && matchesRubricAudit(session.report, rubric) ? session : null;
  const issues = current?.report.issues ?? [];
  const decisions = current?.decisions ?? [];
  const answered = decisions.length;
  const activeIssue = issues[Math.min(activeIssueIndex, issues.length - 1)] ?? null;
  const acceptedCount = decisions.filter((decision) => decision.decision === 'accepted').length;
  const allReviewed = issues.length > 0 && decisions.length === issues.length;

  useEffect(() => {
    if (task.state !== 'success' || !taskIsCurrent || !current) return;
    // A teacher may have been looking at network diagnostics when Ollama completed.
    // Bring them to their questions instead of leaving the result below the fold.
    const frame = window.requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  // Do not scroll the page again each time the teacher changes an answer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.state, task.report, taskIsCurrent, current?.report.signature]);

  function persist(next: RubricAuditSession) {
    try {
      window.localStorage.setItem(rubricAuditStorageKey(assignmentId), JSON.stringify(next));
      setSession(next);
      setMessage('');
    } catch {
      setSession(next);
      setMessage('Vos réponses restent visibles, mais le stockage local est indisponible : exportez votre barème avant de fermer.');
    }
  }

  function runAudit() {
    if (busy) return;
    setMessage('');
    setActiveIssueIndex(0);
    void launchRubricAuditTask({ assignmentId, rubric, endpoint, model });
  }

  function recoverAudit() {
    if (busy || !recoveryText.trim()) return;
    try {
      const source = recoveryText.trim();
      let content = source;
      let sourceModel = model || 'modèle Ollama local';
      try {
        const envelope = JSON.parse(source) as unknown;
        if (envelope && typeof envelope === 'object' && !Array.isArray(envelope)) {
          const wrapped = envelope as Record<string, unknown>;
          const message = wrapped.message && typeof wrapped.message === 'object'
            ? wrapped.message as Record<string, unknown> : null;
          if (typeof message?.content === 'string') content = message.content;
          else if (typeof wrapped.response === 'string') content = wrapped.response;
          if (typeof wrapped.model === 'string' && wrapped.model.trim()) sourceModel = wrapped.model;
        }
      } catch { /* A raw model JSON object is also accepted. */ }
      const report = parseRubricAudit(content, rubric, sourceModel);
      persist({ report, decisions: [] });
      setActiveIssueIndex(0);
      setRecoveryText('');
      setMessage('Résultat récupéré : les questions de l’IA sont disponibles ci-dessous.');
      window.requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (cause) {
      setMessage('Impossible de récupérer cette réponse : ' +
        (cause instanceof Error ? cause.message : 'format non reconnu.'));
    }
  }

  function record(issue: RubricAuditIssue, decision: 'accepted' | 'kept') {
    if (!current || busy) return;
    const choice = decision === 'kept' ? '' : (custom[issue.id]?.trim() || answers[issue.id] || '');
    if (decision === 'accepted' && !choice.trim()) {
      setMessage('Indiquez la règle souhaitée par le professeur.');
      return;
    }
    const next: RubricAuditDecision = { issueId: issue.id, choice, decision };
    persist({ report: current.report, decisions: [...current.decisions.filter((value) => value.issueId !== issue.id), next] });
    const nextIndex = current.report.issues.findIndex((entry, index) => index > activeIssueIndex && entry.id !== issue.id && !current.decisions.some((saved) => saved.issueId === entry.id));
    if (nextIndex >= 0) setActiveIssueIndex(nextIndex);
    else if (activeIssueIndex < current.report.issues.length - 1) setActiveIssueIndex(activeIssueIndex + 1);
  }

  function applyDecisions() {
    if (!current || busy) return;
    try {
      const version = createClarifiedRubricVersion(rubric, current.report, current.decisions, new Date().toISOString());
      // Save the previous and new rubric before changing the active assignment.
      const next = [...loadVersions(assignmentId), version].slice(-20);
      window.localStorage.setItem(versionsKey(assignmentId), JSON.stringify(next));
      setVersions(next);
      onApply(version.clarified);
      setMessage('La version clarifiée est appliquée. Les anciennes corrections gardent leur barème historique.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Impossible d’appliquer ces précisions.');
    }
  }

  return <section className={busy ? "panel rubric-audit-panel is-running" : "panel rubric-audit-panel"} aria-label="Vérifier et clarifier le barème">
    <div className="rubric-audit-heading">
      <div><p className="eyebrow">FIABILISER LE BARÈME</p><h3>Vérifier et clarifier le barème</h3>
        <p>Détectez les ambiguïtés <strong>avant de corriger les copies</strong>. Vous décidez des précisions à conserver.</p>
      </div>
    </div>
    <div className="rubric-audit-toolbar">
      <button type="button" className="primary-button rubric-audit-launch" disabled={busy} aria-disabled={busy} onClick={runAudit}>
        {busy && <span className="rubric-audit-spinner" aria-hidden="true" />}
        <span>{busy ? 'Vérification en cours…' : current ? 'Relancer la vérification du barème' : 'Vérifier avec l’IA locale'}</span>
      </button>
      {busy && <button type="button" className="secondary-button rubric-audit-stop" onClick={() => cancelRubricAuditTask(assignmentId)}>Arrêter la vérification</button>}
    </div>
    <p className="hint rubric-audit-privacy">Seul le barème est transmis au modèle Ollama local « {model || 'non configuré'} » ; aucune copie d'étudiant n'est envoyée. Cette vérification est facultative.</p>
    {!busy && <details className="rubric-audit-recover">
      <summary>Récupérer une analyse déjà terminée dans le diagnostic</summary>
      <p>Si Ollama a répondu mais que les questions n’ont pas été affichées, copiez la réponse JSON depuis « Suivi & diagnostic » puis collez-la ici. Aucune nouvelle requête Ollama n’est envoyée.</p>
      <label className="field-label">Réponse du modèle (JSON brut ou réponse complète Ollama)
        <textarea rows={5} value={recoveryText} onChange={(event) => setRecoveryText(event.target.value)}
          placeholder='{"message":{"content":"{\\\"issues\\\":[...]}"}}' />
      </label>
      <button type="button" className="secondary-button" disabled={!recoveryText.trim()} onClick={recoverAudit}>Charger les questions déjà générées</button>
    </details>}
    {busy && <div className="rubric-audit-live" role="status" aria-live="polite">
      <div className="rubric-audit-live-heading">
        <span className="rubric-audit-spinner" aria-hidden="true" />
        <div>
          <strong>Vérification du barème en cours</strong>
          <p>{!taskIsCurrent ? 'Le barème a été modifié depuis le lancement. Arrêtez cette analyse pour vérifier la nouvelle version.'
            : task.phase === 'validating' ? 'Réponse du modèle reçue · validation des suggestions…'
            : 'Requête envoyée · en attente de la réponse du modèle local…'}</p>
        </div>
        <span className="rubric-audit-elapsed" aria-hidden="true">{formatElapsed(task.startedAt, now)}</span>
      </div>
      <div className="rubric-audit-indeterminate" aria-hidden="true"><span /></div>
      <p className="rubric-audit-live-hint">Le modèle « {task.model} » peut prendre du temps à répondre. Vous pouvez consulter le diagnostic puis revenir : l'analyse restera visible. Aucun pourcentage artificiel n'est affiché.</p>
    </div>}
    {taskIsCurrent && task.state === 'error' && <div className="rubric-audit-feedback is-error" role="alert">
      <strong>La vérification n’a pas abouti.</strong><p>{task.error}</p>
      <p>Votre barème et les précédentes décisions sont conservés. Vous pouvez relancer l’analyse.</p>
    </div>}
    {taskIsCurrent && task.state === 'canceled' && <div className="rubric-audit-feedback" role="status">
      <strong>Vérification arrêtée.</strong><p>Le barème et les résultats précédents restent disponibles.</p>
    </div>}
    {taskIsCurrent && task.state === 'success' && <div className="rubric-audit-feedback is-success" role="status">
      <strong>Vérification terminée</strong>
      <p>{task.report?.issues.length ? task.report.issues.length + ' point(s) à examiner. Les questions sont affichées ci-dessous.' : 'Aucune ambiguïté signalée par le modèle. Vous pouvez poursuivre vers les copies.'}
      {task.startedAt && task.finishedAt ? ' · Durée : ' + formatElapsed(task.startedAt, task.finishedAt) : ''}</p>
      {task.storageWarning && <p role="alert">{task.storageWarning}</p>}
    </div>}
    {message && <p role="alert" className="rubric-audit-alert">{message}</p>}
    {current && <div className="rubric-audit-review" ref={resultRef} aria-label="Questions de clarification du barème">
      <div className="rubric-audit-review-header">
        <div>
          <p className="eyebrow">RÉSULTAT DE L'ANALYSE</p>
          <h3>{issues.length === 0 ? 'Barème examiné' : 'Questions à discuter avec le professeur'}</h3>
          <p>{issues.length === 0
            ? 'Le modèle n’a signalé aucune ambiguïté sur ce barème. Vous pouvez corriger les copies ou relancer la vérification.'
            : 'L’IA a identifié ' + issues.length + ' point(s) qui pourraient modifier la notation. Examinez ses propositions une à une ; aucune règle n’est modifiée sans votre validation.'}</p>
        </div>
        {issues.length > 0 && <span className="rubric-audit-review-count" role="status">{answered} / {issues.length} questions traitées</span>}
      </div>
      {issues.length > 0 && <div className="rubric-audit-review-body">
        <nav className="rubric-audit-question-nav" aria-label="Questions détectées">
          {issues.map((issue, index) => {
            const decision = decisions.find((entry) => entry.issueId === issue.id);
            return <button type="button" key={issue.id} disabled={busy}
              aria-current={index === activeIssueIndex ? 'step' : undefined}
              className={index === activeIssueIndex ? 'rubric-audit-question-tab active' : 'rubric-audit-question-tab'}
              onClick={() => setActiveIssueIndex(index)}>
              <span>Question {index + 1} · {displayTitle(issue, rubric)}</span>
              <small>{decision ? decision.decision === 'accepted' ? '✓ Précision enregistrée' : '✓ Barème conservé'
                : issue.priority === 'high' ? 'À examiner · impact important' : 'À examiner'}</small>
            </button>;
          })}
        </nav>
        {activeIssue && (() => {
          const selected = decisions.find((entry) => entry.issueId === activeIssue.id);
          const original = rubric.criteria.find((entry) => entry.id === activeIssue.criterionId);
          const source = getRubricSubcriteria(original!).find((entry) => entry.id === activeIssue.subcriterionId) ?? original;
          const chosenOption = answers[activeIssue.id] ?? selected?.choice ?? '';
          const chosenCustom = custom[activeIssue.id] ?? '';
          const canAccept = Boolean(chosenCustom.trim() || activeIssue.options.includes(chosenOption));
          return <div className="rubric-audit-conversation" key={activeIssue.id}>
            <div className="rubric-audit-conversation-heading">
              <span className="rubric-audit-step-number">Question {activeIssueIndex + 1} sur {issues.length}</span>
              <strong>{displayTitle(activeIssue, rubric)}</strong>
            </div>
            <div className="rubric-audit-original">
              <strong>Barème du professeur</strong>
              <p>{source?.title} — {source?.description || 'Aucune précision'}</p>
            </div>
            <div className="rubric-audit-assistant">
              <span className="rubric-audit-speaker">Assistant IA · Point à clarifier</span>
              <p>{activeIssue.reason}</p>
              <h4>{activeIssue.question}</h4>
            </div>
            <fieldset disabled={busy} className="rubric-audit-options">
              <legend>Quelle règle souhaitez-vous appliquer ?</legend>
              {activeIssue.options.map((option) =>
                <label key={option} className="rubric-audit-choice">
                  <input type="radio" name={'audit-choice-' + activeIssue.id}
                    checked={!chosenCustom && chosenOption === option}
                    onChange={() => { setAnswers((curr) => ({ ...curr, [activeIssue.id]: option })); setCustom((curr) => ({ ...curr, [activeIssue.id]: '' })); }} />
                  <span>{option}</span>
                </label>)}
            </fieldset>
            <label className="field-label rubric-audit-custom">Ou formulez votre propre règle
              <textarea rows={3} disabled={busy} value={chosenCustom}
                onChange={(event) => setCustom((curr) => ({ ...curr, [activeIssue.id]: event.target.value }))}
                placeholder="Précisez votre intention pédagogique…" />
            </label>
            <div className="rubric-audit-ai-suggestion">
              <strong>Proposition de reformulation par l’IA</strong>
              <p>{activeIssue.suggestion}</p>
              <button type="button" className="text-button" disabled={busy}
                onClick={() => { setAnswers((curr) => ({ ...curr, [activeIssue.id]: '' })); setCustom((curr) => ({ ...curr, [activeIssue.id]: activeIssue.suggestion })); }}>
                Utiliser cette reformulation comme réponse
              </button>
            </div>
            {selected && <p className="rubric-audit-saved" role="status">
              {selected.decision === 'accepted' ? '✓ Règle retenue : ' + selected.choice : '✓ Le barème initial a été conservé pour ce point.'}
            </p>}
            <div className="rubric-audit-actions">
              <button type="button" className="primary-button" disabled={busy || !canAccept}
                onClick={() => record(activeIssue, 'accepted')}>Valider ma réponse</button>
              <button type="button" className="secondary-button" disabled={busy}
                onClick={() => record(activeIssue, 'kept')}>Conserver le critère actuel</button>
            </div>
            <div className="rubric-audit-navigation">
              <button type="button" className="secondary-button" disabled={busy || activeIssueIndex === 0}
                onClick={() => setActiveIssueIndex((index) => Math.max(0, index - 1))}>Question précédente</button>
              <button type="button" className="secondary-button" disabled={busy || activeIssueIndex === issues.length - 1}
                onClick={() => setActiveIssueIndex((index) => Math.min(issues.length - 1, index + 1))}>Question suivante</button>
            </div>
          </div>;
        })()}
      </div>}
      {allReviewed && <div className="rubric-audit-summary" role="status">
        <h4>Récapitulatif des décisions</h4>
        <p>{acceptedCount} précision(s) retenue(s), {issues.length - acceptedCount} critère(s) conservé(s). Votre barème n’a pas encore été modifié.</p>
        <ul>{issues.map((issue) => {
          const decision = decisions.find((entry) => entry.issueId === issue.id)!;
          return <li key={issue.id}><strong>{displayTitle(issue, rubric)} :</strong> {decision.decision === 'accepted' ? decision.choice : 'Texte initial conservé'}</li>;
        })}</ul>
      </div>}
      {acceptedCount > 0 && <div className="rubric-audit-apply">
        <p>Après vérification de vos réponses, vous pouvez appliquer les précisions. Une nouvelle version est conservée avec l’original.</p>
        <button type="button" className="primary-button" disabled={busy} onClick={applyDecisions}>
          Appliquer {acceptedCount} précision(s) validée(s) au barème
        </button>
      </div>}
      {issues.length > 0 && !allReviewed && <p className="hint">Les questions non traitées ne sont jamais ajoutées automatiquement au barème.</p>}
    </div>}
    {versions.length > 0 && <details><summary>Historique des clarifications ({versions.length})</summary>
      <ol>{versions.map((version, index) => <li key={version.appliedAt + index}>
        <strong>{new Date(version.appliedAt).toLocaleDateString('fr-FR')}</strong> — {version.decisions.length} précision(s) ; modèle {version.model}
        <details><summary>Comparer le barème initial et la version appliquée</summary>
          <div className="rubric-audit-versions"><div><strong>Avant</strong><pre>{JSON.stringify(version.original, null, 2)}</pre></div><div><strong>Après</strong><pre>{JSON.stringify(version.clarified, null, 2)}</pre></div></div>
        </details>
      </li>)}</ol>
    </details>}
  </section>;
}
