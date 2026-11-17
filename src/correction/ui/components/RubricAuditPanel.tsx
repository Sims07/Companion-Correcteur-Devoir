import { useEffect, useState } from 'react';
import { getRubricSubcriteria, rubricEvaluationSignature, type Rubric } from '../../domain/rubric.ts';
import {
  matchesRubricAudit, validRubricAuditSession,
  type RubricAuditDecision, type RubricAuditIssue, type RubricAuditSession,
} from '../../domain/rubricAudit.ts';
import { auditRubricWithOllama } from '../../adapters/ai/rubricAuditOllama.ts';
import { createClarifiedRubricVersion, type ClarifiedRubricVersion } from '../../domain/rubricClarification.ts';
import './RubricAuditPanel.css';

interface Props {
  rubric: Rubric;
  assignmentId: string;
  endpoint: string;
  model: string;
  onApply: (rubric: Rubric) => void;
}

const storageKey = (assignmentId: string) => 'companion-correcteur:rubric-audit:v1:' + assignmentId;
const versionsKey = (assignmentId: string) => 'companion-correcteur:rubric-versions:v1:' + assignmentId;

function loadVersions(assignmentId: string): ClarifiedRubricVersion[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem(versionsKey(assignmentId)) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((item): item is ClarifiedRubricVersion =>
      item && typeof item === 'object' && typeof item.appliedAt === 'string'
      && typeof item.originalSignature === 'string' && typeof item.clarifiedSignature === 'string') : [];
  } catch { return []; }
}

function load(assignmentId: string, rubric: Rubric): RubricAuditSession | null {
  try {
    const saved = window.localStorage.getItem(storageKey(assignmentId));
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [versions, setVersions] = useState<ClarifiedRubricVersion[]>(() => loadVersions(assignmentId));

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
  const items = showAll ? issues : issues.slice(0, 3);

  function persist(next: RubricAuditSession) {
    try {
      window.localStorage.setItem(storageKey(assignmentId), JSON.stringify(next));
      setSession(next);
      setMessage('');
    } catch {
      setSession(next);
      setMessage('Vos réponses restent visibles, mais le stockage local est indisponible : exportez votre barème avant de fermer.');
    }
  }

  async function runAudit() {
    setBusy(true);
    setMessage('');
    try {
      const report = await auditRubricWithOllama(rubric, { endpoint, model });
      // A changed rubric must never receive findings from a previous version.
      if (!matchesRubricAudit(report, rubric)) return;
      persist({ report, decisions: [] });
      setShowAll(false);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Impossible de vérifier le barème.');
    } finally {
      setBusy(false);
    }
  }

  function record(issue: RubricAuditIssue, decision: 'accepted' | 'kept') {
    if (!current) return;
    const choice = decision === 'kept' ? '' : (custom[issue.id]?.trim() || answers[issue.id] || issue.suggestion);
    if (decision === 'accepted' && !choice.trim()) {
      setMessage('Indiquez la règle souhaitée par le professeur.');
      return;
    }
    const next: RubricAuditDecision = { issueId: issue.id, choice, decision };
    persist({ report: current.report, decisions: [...current.decisions.filter((value) => value.issueId !== issue.id), next] });
  }

  function applyDecisions() {
    if (!current) return;
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

  return <section className="panel rubric-audit-panel" aria-label="Vérifier et clarifier le barème">
    <div className="rubric-audit-heading">
      <div><p className="eyebrow">FIABILISER LE BARÈME</p><h3>Vérifier et clarifier le barème</h3>
        <p>L'IA locale repère les formulations susceptibles de modifier une note. Vous décidez des précisions à conserver.</p>
      </div>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => { void runAudit(); }}>
        {busy ? 'Analyse en cours…' : current ? 'Relancer la vérification' : 'Vérifier avec l’IA locale'}
      </button>
    </div>
    <p className="hint">Seul le barème est transmis au modèle Ollama local « {model || 'non configuré'} » ; aucune copie d'étudiant n'est envoyée. Cette vérification est facultative.</p>
    {message && <p role="alert" className="rubric-audit-alert">{message}</p>}
    {current && <div aria-live="polite" className="rubric-audit-progress">
      <strong>{issues.length === 0 ? 'Aucune ambiguïté signalée' : issues.length + ' point(s) à examiner'}</strong>
      <span>{answered} / {issues.length} décision(s) enregistrée(s)</span>
    </div>}
    {items.length > 0 && <ol className="rubric-audit-issues">
      {items.map((issue) => {
        const selected = decisions.find((value) => value.issueId === issue.id);
        const options = issue.options;
        const original = rubric.criteria.find((item) => item.id === issue.criterionId);
        const source = getRubricSubcriteria(original!).find((item) => item.id === issue.subcriterionId) ?? original;
        return <li key={issue.id}>
          <div className="rubric-audit-issue-heading"><strong>{displayTitle(issue, rubric)}</strong><small>{issue.priority === 'high' ? 'Impact potentiellement important' : 'Précision conseillée'}</small></div>
          <p>{issue.reason}</p>
          <p><strong>{issue.question}</strong></p>
          <fieldset><legend>Votre décision pédagogique</legend>
            {options.map((option) => <label key={option} className="rubric-audit-radio">
              <input type="radio" name={'audit-choice-' + issue.id} checked={(answers[issue.id] ?? selected?.choice) === option} onChange={() => { setAnswers((curr) => ({ ...curr, [issue.id]: option })); setCustom((curr) => ({ ...curr, [issue.id]: '' })); }} />
              <span>{option}</span>
            </label>)}
          </fieldset>
          <label className="field-label">Ou préciser votre propre règle
            <textarea rows={2} value={custom[issue.id] ?? ''} onChange={(event) => setCustom((curr) => ({ ...curr, [issue.id]: event.target.value }))} placeholder="Votre précision (facultatif)" />
          </label>
          <details><summary>Comparer avec le barème et la suggestion de l'IA</summary>
            <p><strong>Actuel :</strong> {source?.title} — {source?.description || 'Aucune précision'}.</p>
            <p><strong>Proposition :</strong> {issue.suggestion}</p>
          </details>
          <div className="rubric-audit-actions">
            <button type="button" className="primary-button" onClick={() => record(issue, 'accepted')}>Enregistrer ma précision</button>
            <button type="button" className="secondary-button" onClick={() => record(issue, 'kept')}>Conserver le barème actuel</button>
          </div>
          {selected && <p className="rubric-audit-saved">{selected.decision === 'accepted' ? '✓ Décision enregistrée : ' + selected.choice : '✓ Barème conservé sans modification'}</p>}
        </li>;
      })}
    </ol>}
    {!showAll && issues.length > 3 && <button type="button" className="text-button" onClick={() => setShowAll(true)}>
      Voir les {issues.length - 3} autres suggestions
    </button>}
    {current && answered > 0 && <div className="rubric-audit-apply">
      <p className="hint">Les règles choisies ne sont pas encore appliquées au barème de correction. Leur application créera une nouvelle version locale, avec conservation de l’original.</p>
      <button type="button" className="primary-button" disabled={!decisions.some((item) => item.decision === 'accepted')} onClick={applyDecisions}>Appliquer {decisions.filter((item) => item.decision === 'accepted').length} précision(s) validée(s)</button>
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
