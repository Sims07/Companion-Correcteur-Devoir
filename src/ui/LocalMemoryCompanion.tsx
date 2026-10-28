import { useEffect, useMemo, useRef, useState } from 'react';
import type { LocalCorrectionService } from '../application/localCorrectionService.ts';
import { fingerprintRubric, type LocalMemoryEntry } from '../domain/localMemory.ts';
import type { LocalCorrection } from '../domain/localCorrection.ts';
import { buildLocalMemoryContext, createTeacherMemoryEntry } from '../domain/localMemoryContext.ts';
import './localMemory.css';

const CORRECTION_ID_KEY = 'companion-current-correction-id';
const CORRECTION_LABEL_KEY = 'companion-current-correction-label';

function getOrCreateCorrectionId(): string {
  const existing = window.localStorage.getItem(CORRECTION_ID_KEY);
  if (existing) return existing;
  const id = `correction-${crypto.randomUUID()}`;
  window.localStorage.setItem(CORRECTION_ID_KEY, id);
  return id;
}

function readRubricFingerprint(): { title: string; fingerprint: string } {
  const titleElement = document.getElementById('rubric-title') as HTMLInputElement | null;
  const title = titleElement?.value.trim() || 'Barème sans nom';
  const rubricEditor = document.querySelector('.rubric-editor');
  const inputs = rubricEditor ? Array.from(rubricEditor.querySelectorAll('input')) : [];
  const rubricJson = JSON.stringify(inputs.map((input) => input.value));
  return { title, fingerprint: fingerprintRubric(title, rubricJson) };
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
      setStatus(cause instanceof Error ? cause.message : 'Impossible de lire la mémoire locale.');
    }
  }

  useEffect(() => {
    void refresh();
    void refreshCorrections();
    const updateRubric = () => setRubric(readRubricFingerprint());
    document.addEventListener('input', updateRubric);
    return () => document.removeEventListener('input', updateRubric);
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
    window.localStorage.setItem(CORRECTION_ID_KEY, selected.id);
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
    window.localStorage.setItem(CORRECTION_ID_KEY, id);
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
      setStatus(cause instanceof Error ? cause.message : 'Impossible d’enregistrer ce retour localement.');
    }
  }

  async function deleteCurrentMemory() {
    await service.deleteMemoryForCorrection(correctionId);
    setEntries([]);
    setSuggestions([]);
    setStatus('Mémoire de cette correction supprimée de cet appareil.');
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
  const currentCorrection = corrections.find((item) => item.id === correctionId);

  return (
    <>
      <button className="memory-fab" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-controls="local-memory-panel">
        <span aria-hidden="true">✦</span> Mémoire locale {entries.length > 0 && <b>{entries.length}</b>}
      </button>
      {open && <aside id="local-memory-panel" className="memory-panel" aria-label="Mémoire locale de correction">
        <div className="memory-header">
          <div><p className="memory-kicker">APPRENTISSAGE LOCAL</p><h2>Mémoire de correction</h2></div>
          <button className="memory-close" type="button" onClick={() => setOpen(false)} aria-label="Fermer">×</button>
        </div>
        <p className="memory-explainer">Une correction possède un identifiant local indépendant de son titre. Vous pouvez la fermer puis la reprendre plus tard depuis cet appareil.</p>

        <label className="memory-label">Correction en cours
          <select value={correctionId} onChange={(event) => selectCorrection(event.target.value)}>
            {corrections.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.rubricTitle}</option>)}
          </select>
        </label>
        <div className="memory-actions"><button type="button" onClick={startNewCorrection}>Nouvelle correction</button></div>

        {currentCorrection && <div className="memory-scope"><span>Correction sélectionnée</span><strong>{currentCorrection.label}</strong><small>Dernière utilisation : {new Date(currentCorrection.updatedAt).toLocaleString('fr-FR')}</small></div>}
        <label className="memory-label">Nom de la correction<input value={label} onChange={(event) => persistLabel(event.target.value)} /></label>
        <div className="memory-scope"><span>Barème</span><strong>{rubric.title}</strong><small>{entries.length} retour(s) dans cette correction · les règles promues de ce barème sont réutilisables</small></div>

        <label className="memory-label">Votre retour<textarea value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Ex. Cette formulation doit être acceptée dans ce barème…" rows={4} /></label>
        <label className="memory-checkbox"><input type="checkbox" checked={promote} onChange={(event) => setPromote(event.target.checked)} /> <span><strong>Enregistrer comme règle du barème</strong><small>Réutilisable avec le même barème lors d’une prochaine correction.</small></span></label>
        <button className="memory-primary" type="button" disabled={!feedback.trim()} onClick={() => void saveFeedback()}>Enregistrer le retour</button>

        {suggestions.length > 0 && <section className="memory-suggestions"><h3>Déjà rencontré</h3>{suggestions.map((entry) => <div className="memory-entry" key={entry.id}><span>{entry.promotedToRubric ? 'RÈGLE DU BARÈME' : 'RETOUR DE CETTE CORRECTION'}</span><p>{entry.text}</p></div>)}</section>}

        <div className="memory-actions"><button type="button" onClick={exportMemory} disabled={!entries.length}>Exporter</button><button type="button" onClick={() => importRef.current?.click()}>Importer</button><button type="button" onClick={() => void deleteCurrentMemory()} disabled={!entries.length}>Effacer les retours</button><button type="button" onClick={() => void removeCorrection(correctionId)}>Supprimer cette correction</button></div>
        <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importMemory(event.currentTarget.files?.[0])} />
        {status && <p className="memory-status" role="status">{status}</p>}
        <details className="memory-details"><summary>Contexte prêt pour l’analyse IA</summary><p>{promptContext || 'Aucun retour sélectionné pour l’instant. Les retours validés pourront être injectés dans le contexte d’analyse.'}</p></details>
      </aside>}
    </>
  );
}
