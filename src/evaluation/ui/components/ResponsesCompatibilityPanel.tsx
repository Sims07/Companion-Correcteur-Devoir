import { useEffect, useState, useSyncExternalStore } from 'react';
import './ResponsesCompatibilityPanel.css';
import type { AiModelProfile } from '../../../shared/domain/aiModelProfiles.ts';
import { responsesEndpoint } from '../../../shared/domain/lmStudioTransport.ts';
import {
  responsesEffortLabel, responsesEfforts, responsesModeLabel,
  type ResponsesEffort, type ResponsesTestSettings,
} from '../../application/responsesCompatibility.ts';

import {
  getResponsesCompatibilityTask, launchResponsesCompatibilityTask,
  stopResponsesCompatibilityTask, subscribeResponsesCompatibilityTask,
} from '../../application/responsesCompatibilityTask.ts';

export function ResponsesCompatibilityPanel({ profiles, current, visible, evaluationOpen, busy }: {
  profiles: readonly AiModelProfile[]; current: ResponsesTestSettings; visible: boolean; evaluationOpen: boolean; busy: boolean;
}) {
  const choices = [{ id: '', name: 'Réglages courants', configuration: current }, ...profiles]
    .filter(({ configuration }) => configuration.apiCompatible && configuration.analysisModel &&
      responsesEndpoint(configuration.endpoint));
  const [profileId, selectProfile] = useState('');
  const selected = choices.find(choice => choice.id === profileId) ?? choices[0];
  const [efforts, setEfforts] = useState<ResponsesEffort[]>(['none', 'medium']);
  const { model, message, results, startedAt } = useSyncExternalStore(
    subscribeResponsesCompatibilityTask, getResponsesCompatibilityTask);
  const [expanded, setExpanded] = useState(startedAt !== null);
  const [now, setNow] = useState(Date.now);
  const running = startedAt !== null;
  const seconds = startedAt === null ? 0 : Math.floor(Math.max(0, now - startedAt) / 1_000);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [running]);

  return <section className="panel responses-compatibility" hidden={!visible && !(evaluationOpen && running)} aria-label="Compatibilité LM Studio Responses">
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>Comparer la compatibilité LM Studio Responses{running && !expanded && ' · Essais en cours'}</summary>
      <p>Le même modèle reçoit une consigne JSON témoin avec puis sans streaming, pour chaque niveau de Thinking sélectionné. Aucun devoir ni image n’est envoyé.</p>
      {selected ? <label>Profil Responses <select value={selected.id} disabled={running}
        onChange={event => selectProfile(event.target.value)}>
        {choices.map(choice => <option key={choice.id} value={choice.id}>
          {choice.name} · {choice.configuration.analysisModel}
        </option>)}
      </select></label> : <p>Configurez un profil LM Studio et choisissez un modèle d’analyse pour lancer la comparaison.</p>}
      <fieldset disabled={running} className="responses-compatibility-efforts">
        <legend>Niveaux de Thinking à comparer</legend>
        {responsesEfforts.map(effort => <label key={effort}>
          <input type="checkbox" checked={efforts.includes(effort)} onChange={event => {
            const checked = event.target.checked;
            setEfforts(previous => checked ? [...previous, effort] : previous.filter(value => value !== effort));
          }} /> {responsesEffortLabel[effort]}
        </label>)}
      </fieldset>
      <div className="responses-compatibility-actions"><button type="button" className="primary-button" disabled={!selected || !efforts.length || running || busy}
        onClick={() => {
          if (selected) void launchResponsesCompatibilityTask(selected.configuration,
            responsesEfforts.filter(effort => efforts.includes(effort)));
        }}>Lancer la comparaison Responses</button>
      {running && <button type="button" onClick={stopResponsesCompatibilityTask}>Arrêter la comparaison</button>}</div>
      <p role="status">{model && `${model} · `}{message}{running && ` · ${seconds} s`}</p>
      {results.length > 0 && <div className="responses-compatibility-results"><table>
        <caption>Résultats pour {model}</caption>
        <thead><tr><th scope="col">Mode</th><th scope="col">Thinking demandé</th><th scope="col">Résultat</th>
          <th scope="col">HTTP</th><th scope="col">Statut fournisseur</th><th scope="col">Durée</th>
          <th scope="col">Thinking reçu</th><th scope="col">Tokens générés</th><th scope="col">Tokens de raisonnement</th></tr></thead>
        <tbody>{results.map(result => <tr key={result.effort + String(result.stream)}>
          <th scope="row">{responsesModeLabel(result.stream)}</th><td>{responsesEffortLabel[result.effort]}</td><td>{result.result}</td>
          <td>{result.http ?? '—'}</td><td>{result.status ?? '—'}</td><td>{(result.durationMs / 1_000).toFixed(2)} s</td>
          <td>{result.thinking === undefined ? '—' : result.thinking ? 'Oui' : 'Non observé'}</td>
          <td>{result.outputTokens ?? '—'}</td><td>{result.reasoningTokens ?? '—'}</td>
        </tr>)}</tbody>
      </table></div>}
    </details>
  </section>;
}
