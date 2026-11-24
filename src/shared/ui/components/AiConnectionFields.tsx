import { aiTransport, type AiTransport } from '../../domain/lmStudioTransport.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';

interface Props {
  prefix: 'ai' | 'evaluation';
  endpoint: string;
  apiCompatible: boolean;
  apiKey: string;
  disabled?: boolean;
  connecting: boolean;
  onTransport: (transport: AiTransport) => void;
  onEndpoint: (value: string) => void;
  onApiKey: (value: string) => void;
  onConnect: () => void;
}

export function AiConnectionFields(props: Props) {
  const { prefix, endpoint, apiCompatible, disabled, connecting } = props;
  const transport = aiTransport(apiCompatible, endpoint);
  const lmStudio = transport === 'lmstudio-chat' || transport === 'lmstudio-responses';
  const providerId = prefix === 'ai' ? 'ai-provider-type' : 'evaluation-provider';
  const endpointId = prefix === 'ai' ? 'ollama-endpoint' : 'evaluation-ollama-endpoint';
  return <>
    <div className="evaluation-config-field">
      <label className="field-label" htmlFor={providerId}>Connexion IA</label>
      <DesignSystemSelect id={providerId} disabled={disabled}
        value={lmStudio ? 'lmstudio-chat' : transport} onChange={event => props.onTransport(event.target.value as AiTransport)}>
        <option value="ollama">Ollama local</option>
        <option value="lmstudio-chat">LM Studio</option>
        <option value="openai">Serveur compatible OpenAI</option>
      </DesignSystemSelect>
    </div>
    <div className="evaluation-config-field">
      <label className="field-label" htmlFor={endpointId}>{apiCompatible ? 'URL de l’API IA' : 'Adresse du serveur Ollama'}</label>
      <input id={endpointId} value={endpoint} disabled={disabled} onChange={event => props.onEndpoint(event.target.value)}
        placeholder={lmStudio ? 'http://localhost:1234/api/v1/chat' : apiCompatible ? 'https://serveur/v1/chat/completions' : 'http://localhost:11434'} />
    </div>
    {apiCompatible && <details className="ai-model-advanced">
      <summary>Options de connexion</summary>
      <div className="evaluation-config-field">
        <label className="field-label" htmlFor={prefix + '-api-key'}>Jeton API (facultatif)</label>
        <input id={prefix + '-api-key'} type="password" autoComplete="new-password" disabled={disabled}
          value={props.apiKey} onChange={event => props.onApiKey(event.target.value)} />
      </div>
      {lmStudio && <div className="evaluation-config-field">
        <label className="field-label" htmlFor={prefix + '-diagram-api'}>API des schémas</label>
        <DesignSystemSelect id={prefix + '-diagram-api'} value={transport} disabled={disabled}
          onChange={event => props.onTransport(event.target.value as AiTransport)}>
          <option value="lmstudio-chat">Chat natif LM Studio</option>
          <option value="lmstudio-responses">LM Studio Responses</option>
        </DesignSystemSelect>
        <p className="hint">Les deux API conservent la conversation. Avec le zoom activé, les schémas utilisent Responses. La lecture des copies et les autres appels utilisent Chat Completions.</p>
      </div>}
    </details>}
    <div className="evaluation-config-field">
      <button type="button" className="secondary-button" disabled={disabled} aria-busy={connecting} onClick={props.onConnect}>
        {connecting ? 'Connexion en cours…' : 'Tester la connexion et détecter les modèles'}
      </button>
    </div>
  </>;
}
