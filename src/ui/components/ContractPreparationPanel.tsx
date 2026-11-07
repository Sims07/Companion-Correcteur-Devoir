import './ContractPreparationPanel.css';
import { useEffect, useRef, useState } from 'react';
import type { CorrectionWorkspaceService } from '../../application/correctionWorkspaceService.ts';
import { transcribeSubjectReference } from '../../application/transcribeSubjectReference.ts';
import { applyContractPreparation, contractFieldNames, suggestionContract, type ContractFieldName, type ContractPreparation, type ContractSources } from '../../domain/contractPreparation.ts';
import type { Rubric } from '../../domain/rubric.ts';
import type { OllamaSettings } from '../../ports/aiProvider.ts';
import { FilePicker } from './FilePicker.tsx';
import { Button, StatusNotice } from '../design-system/index.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';

const labels: Record<ContractFieldName, string> = { questionId: 'Numéro de question', instruction: 'Consigne', expectedRelation: 'Relation ou raisonnement attendu', acceptedAlternatives: 'Équivalences acceptées', contradictions: 'Contradictions' };
const origins = { subject: 'Extrait du sujet', correction: 'Extrait du corrigé', rubric: 'Extrait du barème', suggestion: 'Proposition à valider', missing: 'Non renseigné dans les documents' };
interface Props { rubric: Rubric; service: Pick<CorrectionWorkspaceService, 'prepareQuestionContracts' | 'prepareFiles' | 'createProvider'>; settings: OllamaSettings; assignmentId: string; disabled?: boolean; existingDocument?: string; onApply: (rubric: Rubric) => void }

export function ContractPreparationPanel({ rubric, service, settings, assignmentId, disabled, existingDocument, onApply }: Props) {
  const storageKey = 'companion-contract-sources:' + assignmentId;
  const [sources, setSources] = useState<ContractSources>(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null'); if (saved && typeof saved.subject === 'string' && typeof saved.correction === 'string') return saved; } catch { /* empty local draft */ }
    return { subject: '', correction: '' };
  });
  const [model, setModel] = useState(settings.correctionMethod === 'decision' ? settings.visionModel ?? '' : settings.analysisModel ?? settings.visionModel ?? '');
  const [preparation, setPreparation] = useState<ContractPreparation | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  function changeSources(next: ContractSources) {
    setSources(next); setPreparation(null); setSelected([]);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { setError('Le texte reste disponible ici, mais sa sauvegarde locale a échoué.'); }
  }
  async function importDocument(files: FileList | null, kind: keyof ContractSources) {
    if (!files?.length) return;
    const controller = new AbortController(); abortRef.current = controller;
    setRunning(true); setError(''); setPreparation(null);
    try {
      const pages: string[] = [];
      for (const [index, file] of Array.from(files).entries()) {
        controller.signal.throwIfAborted();
        if (file.size > 15 * 1024 * 1024) throw new Error('Chaque document doit peser au plus 15 Mo.');
        setMessage(`Lecture du ${kind === 'subject' ? 'sujet' : 'corrigé'} — fichier ${index + 1}/${files.length}`);
        if (/\.(txt|md)$/i.test(file.name)) pages.push(await file.text());
        else {
          const images = await service.prepareFiles([file]);
          controller.signal.throwIfAborted();
          pages.push(await transcribeSubjectReference(service.createProvider({ ...settings, correctionMethod: 'generative', analysisModel: model || settings.visionModel }), images, controller.signal, undefined, true));
        }
      }
      controller.signal.throwIfAborted();
      changeSources({ ...sources, [kind]: pages.join('\n\n') });
      setMessage('Document lu. Son texte sera réutilisé pour préparer les contrats.');
    } catch (cause) { setError(controller.signal.aborted ? 'Lecture arrêtée.' : cause instanceof Error ? cause.message : 'Lecture impossible.'); }
    finally { if (abortRef.current === controller) { setRunning(false); abortRef.current = null; } }
  }
  async function prepare() {
    if (!service.prepareQuestionContracts) return;
    const controller = new AbortController(); abortRef.current = controller;
    setRunning(true); setError(''); setPreparation(null); setSelected([]);
    try {
      const result = await service.prepareQuestionContracts(rubric, sources, { ...settings, correctionMethod: 'generative', analysisModel: model }, setMessage, controller.signal);
      controller.signal.throwIfAborted();
      setPreparation(result);
      setSelected(result.suggestions.filter(s => { try { suggestionContract(s); return !rubric.criteria.find(c => c.id === s.criterionId)?.correctionContract; } catch { return false; } }).map(s => s.criterionId));
      setMessage('Propositions prêtes. Relisez les associations et les informations proposées avant de les appliquer. Les contrats existants ne sont pas sélectionnés automatiquement.');
    } catch (cause) { setError(controller.signal.aborted ? 'Préparation arrêtée. Aucun contrat modifié.' : cause instanceof Error ? cause.message : 'Préparation impossible.'); }
    finally { if (abortRef.current === controller) { setRunning(false); abortRef.current = null; } }
  }
  function apply() {
    if (!preparation) return;
    try { onApply(applyContractPreparation(rubric, preparation, selected)); setPreparation(null); setSelected([]); setMessage('Contrats appliqués. Les critères, sous-critères et points ont été conservés.'); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Application impossible.'); }
  }
  const locked = Boolean(disabled || running);
  return <details className="contract-preparation-panel"><summary>Préparer les contrats depuis la feuille d’examen</summary><section aria-label="Préparation automatique des contrats">
    <p>Importez le sujet, avec ou sans correction type. L’IA propose les questions et contrats à partir des documents et du barème actuel ; vous relisez puis appliquez en une fois. Le corrigé est facultatif. Les informations absentes restent signalées.</p>
    {!rubric.criteria.length && <StatusNotice tone="info">Importez d’abord le barème pour disposer des critères et de leurs points.</StatusNotice>}
    <FilePicker id="contract-subject-file" title="Feuille d’examen" description="PDF, photos, TXT ou Markdown · plusieurs fichiers possibles" accept=".pdf,.txt,.md,image/jpeg,image/png,image/webp" multiple disabled={locked} onFilesSelected={files => void importDocument(files, 'subject')} />
    <FilePicker id="contract-correction-file" title="Correction type (facultative)" description="Laissez vide si vous ne disposez pas de corrigé. Un corrigé inclus dans le sujet convient aussi." accept=".pdf,.txt,.md,image/jpeg,image/png,image/webp" multiple disabled={locked} onFilesSelected={files => void importDocument(files, 'correction')} compact />
    {existingDocument?.trim() && <Button variant="secondary" disabled={locked} onClick={() => changeSources({ ...sources, subject: existingDocument })}>Réutiliser le document déjà lu</Button>}
    <details><summary>Vérifier ou coller le texte des documents</summary><label><span className="field-label">Texte de la feuille d’examen</span><textarea rows={6} value={sources.subject} disabled={locked} onChange={event => changeSources({ ...sources, subject: event.target.value })} /></label><label><span className="field-label">Texte du corrigé facultatif</span><textarea rows={4} value={sources.correction} disabled={locked} onChange={event => changeSources({ ...sources, correction: event.target.value })} /></label></details>
    <label><span className="field-label">Modèle de préparation (génératif)</span><input value={model} disabled={locked} onChange={event => setModel(event.target.value)} /></label><p className="hint">Utilise la connexion IA configurée. Si la correction utilise un modèle décisionnel, choisissez ici un modèle génératif capable de rédiger les propositions. Les critères sont préparés séquentiellement.</p>
    <div className="rubric-actions"><Button disabled={locked || !service.prepareQuestionContracts || !sources.subject.trim() || !model.trim() || !rubric.criteria.length} onClick={() => void prepare()}>Préparer les contrats</Button>{running && <Button variant="secondary" onClick={() => abortRef.current?.abort()}>Arrêter la préparation</Button>}</div>
    {message && <StatusNotice tone="info">{message}</StatusNotice>}{error && <StatusNotice tone="warning">{error}</StatusNotice>}
    {preparation && <section aria-label="Propositions de contrats">{preparation.suggestions.map(suggestion => {
      const criterion = rubric.criteria.find(c => c.id === suggestion.criterionId);
      let validation = ''; try { suggestionContract(suggestion); } catch (cause) { validation = cause instanceof Error ? cause.message : 'À préciser'; }
      return <div key={suggestion.criterionId} className="subcriteria-editor"><label><input type="checkbox" checked={selected.includes(suggestion.criterionId)} disabled={locked || Boolean(validation)} onChange={event => setSelected(current => event.target.checked ? [...current, suggestion.criterionId] : current.filter(id => id !== suggestion.criterionId))} />{criterion?.title ?? suggestion.criterionId}{suggestion.scope === 'question' ? ` — Question ${suggestion.fields.questionId.value}` : suggestion.scope === 'copy' ? ' — Toute la copie' : ' — Rattachement à préciser'}</label>
        {criterion?.correctionContract && <p className="hint">Ce critère possède déjà un contrat. Le sélectionner remplacera ce contrat.</p>}
        <p className="hint">{contractFieldNames.filter(key => suggestion.fields[key].source === 'suggestion').length} proposition(s) à valider · {contractFieldNames.filter(key => suggestion.fields[key].source === 'missing').length} information(s) non renseignée(s)</p>
        {suggestion.warning && <p>{suggestion.warning}</p>}{validation && <p role="alert">{validation}</p>}
        <details><summary>Relire et ajuster la proposition</summary><label><span className="field-label">Portée proposée</span><DesignSystemSelect disabled={locked} value={suggestion.scope} onChange={event => setPreparation(current => current && ({ ...current, suggestions: current.suggestions.map(s => s.criterionId === suggestion.criterionId ? { ...s, scope: event.target.value as typeof s.scope } : s) }))}><option value="question">Une question précise</option><option value="copy">Toute la copie</option><option value="unresolved">À préciser</option></DesignSystemSelect></label>
        {contractFieldNames.map(key => <label key={key}><span className="field-label">{labels[key]} — {origins[suggestion.fields[key].source]}</span><textarea rows={2} disabled={locked} value={suggestion.fields[key].value} onChange={event => setPreparation(current => current && ({ ...current, suggestions: current.suggestions.map(s => s.criterionId === suggestion.criterionId ? { ...s, fields: { ...s.fields, [key]: { value: event.target.value, source: 'suggestion', quote: '' } } } : s) }))} />{suggestion.fields[key].quote && <small>Extrait : {suggestion.fields[key].quote}</small>}</label>)}
        </details>
      </div>;
    })}<Button disabled={locked || !selected.length} onClick={apply}>Appliquer les {selected.length} contrats sélectionnés</Button></section>}
  </section></details>;
}
