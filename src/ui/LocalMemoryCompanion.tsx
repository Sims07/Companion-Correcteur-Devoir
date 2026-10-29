import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocalCorrectionService } from '../application/localCorrectionService.ts';
import { fingerprintRubric, LOCAL_MEMORY_CORRECTION_ID_KEY, LOCAL_MEMORY_RUBRIC_FINGERPRINT_KEY, LOCAL_MEMORY_RUBRIC_UPDATED_EVENT, type LocalMemoryEntry } from '../domain/localMemory.ts';
import type { LocalCorrection } from '../domain/localCorrection.ts';
import { buildLocalMemoryContext, createTeacherMemoryEntry } from '../domain/localMemoryContext.ts';
import './localMemory.css';

const CORRECTION_LABEL_KEY = 'companion-current-correction-label';

function getOrCreateCorrectionId(): string {
  const existing = window.localStorage.getItem(LOCAL_MEMORY_CORRECTION_ID_KEY);
  if (existing) return existing;
  const id = `correction-${crypto.randomUUID()}`;
  window.localStorage.setItem(LOCAL_MEMORY_CORRECTION_ID_KEY, id);
  return id;
}

function readRubricFingerprint(): { title: string; fingerprint: string } {
  const titleElement = document.getElementById('rubric-title') as HTMLInputElement | null;
  const title = titleElement?.value.trim() || 'Barème sans nom';
  const rubricEditor = document.querySelector('.rubric-editor');
  const inputs = rubricEditor ? Array.from(rubricEditor.querySelectorAll('input')) : [];
  const rubricJson = JSON.stringify(inputs.map((input) => input.value));
  const storedFingerprint = window.localStorage.getItem(LOCAL_MEMORY_RUBRIC_FINGERPRINT_KEY);
  return { title, fingerprint: storedFingerprint || fingerprintRubric(title, rubricJson) };
}

export function LocalMemoryCompanion({ service }: { service: LocalCorrectionService }) {
  const [open, setOpen] = useState(false);
  const [correctionId, setCorrectionId] = useState(getOrCreateCorrectionId);
  const [label, setLabel] = useState(() => window.localStorage.getItem(CORRECTION_LABEL_KEY) ?? 'Correction actuelle');
  const [rubric, setRubric] = useState(readRubricFingerprint);
  const [corrections, setCorrections] = useState<LocalCorrection[]>([]);
  const [feedback, setFeedback] = useState('');
  const [promote, setPromote] = useState(false);
  const [entries, setEntries] = useState<LocalMemoryEntry[]>([]);
  const [suggestions, setSuggestions] = useState<LocalMemoryEntry[]>([]);
  const [status, setStatus] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const scope = useMemo(() => ({ correctionId, rubricFingerprint: rubric.fingerprint }), [correctionId, rubric.fingerprint]);

  async function refreshCorrections() {
    setCorrections(await service.listCorrections());
  }

  async function refresh() {
    try {
      const current = await service.listMemory(scope);
      const rubricRules = (await service.listMemory({ rubricFingerprint: rubric.fingerprint }))
        .filter((entry) => entry.promotedToRubric && entry.correctionId !== correctionId);
      setEntries(current);
      const candidateEntries = [...current, ...rubricRules];
      if (feedback.trim()) {
        setSuggestions(await service.findRelevantMemory(feedback, {}, 8).then((all) => all.filter((entry) => candidateEntries.some((candidate) => candidate.id === entry.id)).slice(0, 5)));
      } else {
        setSuggestions(candidateEntries.slice(0, 5));
      }
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Impossible de charger vos règles de correction.');
    }
  }

  useEffect(() => {
    void refresh();
    void refreshCorrections();
    const updateRubric = () => setRubric(readRubricFingerprint());
    document.addEventListener('input', updateRubric);
    window.addEventListener(LOCAL_MEMORY_RUBRIC_UPDATED_EVENT, updateRubric);
    return () => {
      document.removeEventListener('input', updateRubric);
      window.removeEventListener(LOCAL_MEMORY_RUBRIC_UPDATED_EVENT, updateRubric);
    };
  }, [correctionId]);

  useEffect(() => {
    const now = new Date().toISOString();
    void service.saveCorrection({ id: correctionId, label, rubricTitle: rubric.title, rubricFingerprint: rubric.fingerprint, createdAt: now, updatedAt: now })
      .then(refreshCorrections)
      .catch(() => undefined);
  }, [correctionId]);

  useEffect(() => {
    const current = corrections.find((item) => item.id === correctionId);
    if (!current) return;
    if (current.label === label && current.rubricFingerprint === rubric.fingerprint && current.rubricTitle === rubric.title) return;
    void service.saveCorrection({ ...current, label, rubricTitle: rubric.title, rubricFingerprint: rubric.fingerprint, updatedAt: new Date().toISOString() })
      .then(refreshCorrections)
      .catch(() => undefined);
  }, [label, rubric.fingerprint, rubric.title]);

  function persistLabel(value: string) {
    setLabel(value);
    window.localStorage.setItem(CORRECTION_LABEL_KEY, value);
  }

  function selectCorrection(id: string) {
    const selected = corrections.find((item) => item.id === id);
    if (!selected) return;
    window.localStorage.setItem(LOCAL_MEMORY_CORRECTION_ID_KEY, selected.id);
    window.localStorage.setItem(CORRECTION_LABEL_KEY, selected.label);
    setCorrectionId(selected.id);
    setLabel(selected.label);
    setFeedback('');
    setSuggestions([]);
    setStatus(`Correction « ${selected.label} » reprise. Les retours de cette correction sont à nouveau actifs.`);
  }

  function startNewCorrection() {
    const id = `correction-${crypto.randomUUID()}`;
    const newLabel = 'Nouvelle correction';
    window.localStorage.setItem(LOCAL_MEMORY_CORRECTION_ID_KEY, id);
    window.localStorage.setItem(CORRECTION_LABEL_KEY, newLabel);
    setCorrectionId(id);
    setLabel(newLabel);
    setFeedback('');
    setSuggestions([]);
    setStatus('Nouvelle correction : les retours précédents ne seront pas utilisés automatiquement. Les règles explicitement promues au barème restent disponibles.');
  }

  async function saveFeedback() {
    const text = feedback.trim();
    if (!text) return;
    setStatus('');
    try {
      await service.saveMemory(createTeacherMemoryEntry({ correctionId, rubricFingerprint: rubric.fingerprint, text, promotedToRubric: promote }));
      setFeedback('');
      setPromote(false);
      setStatus(promote ? 'Règle enregistrée pour ce barème.' : 'Retour enregistré pour cette correction.');
      await refresh();
      await refreshCorrections();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Impossible d’enregistrer cette décision sur cet appareil.');
    }
  }

  async function deleteCurrentMemory() {
    await service.deleteMemoryForCorrection(correctionId);
    setEntries([]);
    setSuggestions([]);
    setStatus('Les retours de cette correction ont été effacés de cet appareil.');
  }

  async function removeCorrection(id: string) {
    const selected = corrections.find((item) => item.id === id);
    if (!selected || !window.confirm(`Supprimer la correction « ${selected.label} » et ses retours locaux ?`)) return;
    await service.deleteCorrection(id);
    if (id === correctionId) startNewCorrection();
    await refreshCorrections();
    setStatus(`Correction « ${selected.label} » supprimée.`);
  }

  function exportMemory() {
    const payload = JSON.stringify({ version: 1, correctionId, label, rubric, entries }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${label.toLowerCase().replace(/[^a-z0-9]+/gi, '-') || 'correction'}-memoire.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importMemory(file: File | undefined) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as { entries?: LocalMemoryEntry[] };
      const imported = (payload.entries ?? []).filter((entry) => entry.text && entry.rubricFingerprint === rubric.fingerprint);
      for (const entry of imported) await service.saveMemory({ ...entry, correctionId });
      setStatus(`${imported.length} retour(s) importé(s) pour ce barème.`);
      await refresh();
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Fichier de mémoire invalide.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  const promptContext = buildLocalMemoryContext(suggestions);

  return (
    <>
      <button className="memory-fab" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="local-memory-panel">
        <span aria-hidden="true">✦</span> Règles de correction {entries.length > 0 && <b>{entries.length}</b>}
      </button>
      {open && <aside id="local-memory-panel" className="memory-panel" aria-label="Règles de correction">
        <div className="memory-header">
          <div><p className="memory-kicker">DÉCISIONS DE L’ENSEIGNANT</p><h2>Règles de correction</h2></div>
          <button className="memory-close" type="button" onClick={() => setOpen(false)} aria-label="Fermer">×</button>
        </div>
        <p className="memory-explainer">Ici, vous indiquez à l’assistant comment appliquer votre correction. Deux niveaux sont possibles : un retour valable pour ce devoir, ou une règle que vous souhaitez réutiliser avec ce barème.</p>

        <section className="memory-section memory-correction-section" aria-labelledby="memory-correction-heading">
          <div className="memory-section-heading">
            <div><span className="memory-step">1</span><div><h3 id="memory-correction-heading">Correction active</h3><p>Choisissez le devoir auquel vos décisions s’appliquent.</p></div></div>
            <span className="memory-count">{corrections.length} correction{corrections.length > 1 ? 's' : ''}</span>
          </div>
          <label className="memory-label" htmlFor="memory-correction-select">Correction sélectionnée
            <select id="memory-correction-select" className="memory-correction-select" value={correctionId} onChange={(event) => selectCorrection(event.target.value)}>
              {corrections.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.rubricTitle}</option>)}
            </select>
          </label>
          <p className="memory-selection-hint">Les retours enregistrés ici restent associés à cette correction. Ils ne sont pas appliqués automatiquement à un autre devoir.</p>
          <div className="memory-correction-actions">
            <label className="memory-label" htmlFor="memory-correction-label">Nom de la correction
              <input id="memory-correction-label" value={label} onChange={(event) => persistLabel(event.target.value)} />
            </label>
            <button className="memory-secondary" type="button" onClick={startNewCorrection}>+ Nouvelle correction</button>
          </div>
        </section>

        <section className="memory-section" aria-labelledby="memory-rubric-heading">
          <div className="memory-section-heading"><div><span className="memory-step">2</span><div><h3 id="memory-rubric-heading">Barème utilisé</h3><p>Les règles peuvent être réutilisées uniquement avec ce même barème.</p></div></div></div>
          <div className="memory-rubric-card"><span>BARÈME ACTIF</span><strong>{rubric.title}</strong><small>{entries.length} retour{entries.length > 1 ? 's' : ''} enregistré{entries.length > 1 ? 's' : ''} pour cette correction</small></div>
        </section>

        <section className="memory-section memory-decision-section" aria-labelledby="memory-decision-heading">
          <div className="memory-section-heading"><div><span className="memory-step">3</span><div><h3 id="memory-decision-heading">Décision à conserver</h3><p>Notez une décision que l’assistant pourra retrouver plus tard.</p></div></div></div>
          <label className="memory-label" htmlFor="memory-feedback">Votre décision
            <textarea id="memory-feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Ex. Accepter cette formulation : le mécanisme biologique est correct, même si les mots diffèrent du corrigé." rows={4} />
          </label>
          <label className="memory-checkbox"><input type="checkbox" checked={promote} onChange={(event) => setPromote(event.target.checked)} /> <span><strong>Réutiliser cette décision avec le barème</strong><small>Sinon, elle reste limitée à la correction active.</small></span></label>
          <button className="memory-primary" type="button" disabled={!feedback.trim()} onClick={() => void saveFeedback()}>Enregistrer la décision</button>
        </section>

        {suggestions.length > 0 && <section className="memory-section memory-suggestions" aria-labelledby="memory-suggestions-heading"><div className="memory-section-heading"><div><span className="memory-step memory-step-muted">4</span><div><h3 id="memory-suggestions-heading">Décisions déjà enregistrées</h3><p>Les notes pertinentes pour cette correction.</p></div></div></div>{suggestions.map((entry) => <div className="memory-entry" key={entry.id}><span>{entry.promotedToRubric ? 'RÈGLE DU BARÈME' : 'RETOUR POUR CE DEVOIR'}</span><p>{entry.text}</p></div>)}</section>}

        <section className="memory-tools" aria-label="Gestion des règles locales">
          <div><strong>Gérer les données locales</strong><p>Exporter, importer ou effacer les décisions conservées sur cet appareil.</p></div>
          <div className="memory-actions"><button type="button" onClick={exportMemory} disabled={!entries.length}>Exporter</button><button type="button" onClick={() => importRef.current?.click()}>Importer</button><button type="button" onClick={() => void deleteCurrentMemory()} disabled={!entries.length}>Effacer les retours de ce devoir</button><button type="button" onClick={() => void removeCorrection(correctionId)}>Supprimer cette correction</button></div>
        </section>
        <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importMemory(event.currentTarget.files?.[0])} />
        {status && <p className="memory-status" role="status">{status}</p>}
        <details className="memory-details"><summary>Voir les notes utilisées pour aider l’IA</summary><p>{promptContext || 'Aucune note pertinente sélectionnée pour cette analyse. Les règles du barème et les retours de ce devoir peuvent être transmis au modèle local comme contexte complémentaire.'}</p></details>
      </aside>}
    </>
  );
}
