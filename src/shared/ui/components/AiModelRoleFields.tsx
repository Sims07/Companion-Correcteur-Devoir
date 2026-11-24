import './AiModelRoleFields.css';
import type { CorrectionMethod } from '../../domain/correctionMethod.ts';
import type { AnalysisReasoningEffort } from '../../domain/aiModelProfiles.ts';
import { isVisualDecisionModel } from '../../domain/decisionModelCapabilities.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';
import { StatusNotice } from '../design-system/index.ts';

interface Props {
  prefix: 'ai' | 'evaluation';
  models: string[];
  generativeModel: string;
  decisionModel: string;
  visionModel: string;
  method: CorrectionMethod;
  apiCompatible: boolean;
  analysisThinking: boolean;
  analysisReasoningEffort?: AnalysisReasoningEffort;
  omitReasoningParameter?: boolean;
  nativeChat?: boolean;
  responses?: boolean;
  smartZoom?: boolean;
  onSmartZoom?: (enabled: boolean) => void;
  contextLength?: number;
  onContextLength?: (length: number | undefined) => void;
  onOmitReasoningParameter?: (omit: boolean) => void;
  gradingOutputTokens?: number;
  analysisTemperature?: number;
  analysisTopP?: number;
  analysisTopK?: number;
  onAnalysisTemperature?: (value: number | undefined) => void;
  onAnalysisTopP?: (value: number | undefined) => void;
  onAnalysisTopK?: (value: number | undefined) => void;
  onGradingOutputTokens?: (value: number | undefined) => void;
  disabled?: boolean;
  onGenerativeModel: (value: string) => void;
  onDecisionModel: (value: string) => void;
  onMethod: (value: CorrectionMethod) => void;
  onAnalysisThinking: (enabled: boolean) => void;
  onAnalysisReasoningEffort?: (effort: AnalysisReasoningEffort) => void;
}

/** The same vocabulary and model selection in teacher settings and the evaluator. */
export function AiModelRoleFields(props: Props) {
  const { prefix, generativeModel, decisionModel, visionModel, method, apiCompatible, disabled } = props;
  function modelField(id: string, label: string, value: string, onChange: (value: string) => void, hint: string) {
    const choices = Array.from(new Set([value, ...props.models].filter(Boolean)));
    return <div className="evaluation-config-field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {props.models.length > 0
        ? <DesignSystemSelect id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
          <option value="">Choisir un modèle</option>
          {choices.map(model => <option key={model} value={model}>{model}</option>)}
        </DesignSystemSelect>
        : <input id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder={label.startsWith('Modèle génératif') ? 'Ex. qwen3.5:4b' : 'Ex. tev1:4b'} />}
      <p className="hint">{hint}</p>
    </div>;
  }
  const decision = method !== 'generative';
  return <>
    {modelField(prefix === 'ai' ? 'ollama-analysis-model' : 'evaluation-analysis-model', 'Modèle génératif', generativeModel, props.onGenerativeModel,
      'Prépare les barèmes et peut corriger les copies. Choisissez un modèle avec vision pour lire aussi les images, ou configurez une lecture distincte dans les options avancées.')}
    {modelField(`${prefix}-decision-model`, 'Modèle décisionnel (facultatif)', decisionModel, props.onDecisionModel,
      'Évalue les attendus du barème avec System One. Ce choix est mémorisé séparément du modèle génératif.')}
    <div className="evaluation-config-field">
      <label className="field-label" htmlFor={`${prefix}-correction-method`}>Méthode de correction</label>
      <DesignSystemSelect id={`${prefix}-correction-method`} value={decision ? 'decision' : 'generative'} disabled={disabled} onChange={event => props.onMethod(event.target.value as CorrectionMethod)}>
        <option value="generative">Correction générative</option>
        <option value="decision">Correction décisionnelle</option>
      </DesignSystemSelect>
      <p className="hint" role="status">{method === 'visual-decision'
        ? `Images → décisions : ${decisionModel || 'modèle décisionnel à choisir'}`
        : `Lecture : ${visionModel || 'modèle de lecture à choisir'} → ${decision ? 'décisions' : 'correction'} : ${(decision ? decisionModel : generativeModel) || 'modèle à choisir'}`}</p>
      {decision && !decisionModel.trim() && <StatusNotice tone="warning">Choisissez un modèle décisionnel pour cette méthode.</StatusNotice>}
      {decision && apiCompatible && <StatusNotice tone="warning">La correction décisionnelle nécessite une connexion Ollama avec System One. Le modèle génératif reste disponible pour une API compatible OpenAI.</StatusNotice>}
      {decision && <details className="ai-model-advanced"><summary>Options de décision sur image</summary>
        <label className="analysis-thinking-option" htmlFor={`${prefix}-direct-decision`}><input id={`${prefix}-direct-decision`} type="checkbox" checked={method === 'visual-decision'} disabled={disabled} onChange={event => props.onMethod(event.target.checked ? 'visual-decision' : 'decision')} /><span><strong>Envoyer directement les images au décisionnel</strong><small>Sans transcription, avec un modèle compatible : Clef/Clef-Flash ou D1/D3 expérimentaux. TEV1 utilise le texte.</small></span></label>
        {method === 'visual-decision' && !isVisualDecisionModel(decisionModel) && <StatusNotice tone="warning">Ce modèle n’est pas reconnu comme compatible avec les images System One. Utilisez un modèle compatible ou désactivez cette option pour utiliser la transcription.</StatusNotice>}
      </details>}
    </div>
    <div className="evaluation-config-field">
      {apiCompatible && <label className="analysis-thinking-option" htmlFor={`${prefix}-omit-reasoning`}>
        <input id={`${prefix}-omit-reasoning`} type="checkbox" checked={props.omitReasoningParameter === true}
          disabled={disabled} onChange={event => props.onOmitReasoningParameter?.(event.target.checked)} />
        <span><strong>Ne pas envoyer de paramètre Reasoning (modèles Instruct)</strong>
          <small>Omet complètement reasoning_effort (Chat Completions) ou reasoning (Chat LM Studio), même quand Thinking est OFF. Le serveur choisit son comportement par défaut.</small>
        </span>
      </label>}
      <label className="analysis-thinking-option" htmlFor={`${prefix}-analysis-thinking`}>
        <input id={`${prefix}-analysis-thinking`} type="checkbox" checked={props.analysisThinking}
          disabled={disabled || (apiCompatible && props.omitReasoningParameter === true)} onChange={(event) => props.onAnalysisThinking(event.target.checked)} />
        <span><strong>Activer Thinking (raisonnement)</strong>
          <small>{apiCompatible
            ? 'Demande au serveur compatible OpenAI d’activer ou désactiver le raisonnement du modèle. Le résultat dépend du serveur et du modèle. Peut ralentir la correction et consommer plus de tokens.'
            : 'Pour les analyses génératives avec Ollama. Peut améliorer le raisonnement, mais allonger les corrections et consommer davantage de tokens. N’affecte pas la lecture Vision ni la décision System One.'}</small>
        </span>
      </label>
      <p className="hint" id={`${prefix}-analysis-thinking-status`} role="status">
        {apiCompatible && props.omitReasoningParameter ? 'Aucun paramètre Reasoning ne sera transmis. Le serveur ou le modèle choisit le comportement.' : apiCompatible
          ? props.analysisThinking
            ? 'Thinking demandé (effort ' + (props.analysisReasoningEffort ?? 'medium') + ') pour les prochaines analyses génératives, si le serveur et le modèle prennent en charge ce réglage.'
            : 'Thinking désactivé demandé pour les prochaines analyses génératives. Si LM Studio ignore ce paramètre, désactivez aussi Reasoning dans ses réglages du modèle.'
          : props.analysisThinking
            ? 'Thinking activé pour les prochaines analyses génératives.'
            : 'Thinking désactivé pour les prochaines analyses génératives.'}
      </p>
      {apiCompatible && (props.nativeChat || props.responses) && !decision && <label className="analysis-thinking-option" htmlFor={prefix + '-smart-zoom'}>
        <input id={prefix + '-smart-zoom'} type="checkbox" checked={props.smartZoom === true} disabled={disabled}
          onChange={event => props.onSmartZoom?.(event.target.checked)} />
        <span><strong>Zoom intelligent sur demande du LLM (2 par critère maximum)</strong>
          <small>Correction directe des schémas : inspecte une zone de la photo originale seulement si le modèle hésite. LM Studio Responses + outil inspect_region ; aucune amélioration générative de l’image. Les modèles doivent prendre en charge les outils.</small>
        </span>
      </label>}
      <details className="ai-model-advanced"><summary>Réglages avancés de génération</summary>
      {apiCompatible && props.nativeChat && <div className="evaluation-config-field">
        <label className="field-label" htmlFor={`${prefix}-context-length`}>Contexte LM Studio Chat (tokens, facultatif)</label>
        <input id={`${prefix}-context-length`} type="number" min="1" step="1" disabled={disabled}
          value={props.contextLength ?? ''} placeholder="Automatique (serveur)"
          aria-describedby={`${prefix}-context-length-help`} onChange={(event) => {
            if (!event.currentTarget.value) props.onContextLength?.(undefined);
            else if (Number.isSafeInteger(event.currentTarget.valueAsNumber) && event.currentTarget.valueAsNumber > 0) props.onContextLength?.(event.currentTarget.valueAsNumber);
          }} />
        <small id={`${prefix}-context-length-help`}>Vide : aucun context_length envoyé, LM Studio choisit. Un modèle MLX peut nécessiter au minimum 16 384 tokens ; définir ce seuil ne garantit pas que la mémoire disponible suffise. S’applique uniquement aux appels /api/v1/chat. Attention : un bug signalé de MLX/Bionic peut ignorer la valeur demandée et appliquer AutoFit malgré tout. En cas d’échec, essayez GGUF/llama.cpp ou une variante moins gourmande.</small>
      </div>}
      {apiCompatible && !decision && <div className="evaluation-config-field">
        <label className="field-label" htmlFor={prefix + '-grading-output'}>Plafond de sortie par correction (tokens)</label>
        <input id={prefix + '-grading-output'} type="number" min="1" step="1" disabled={disabled}
          placeholder="Automatique" value={props.gradingOutputTokens ?? ''}
          aria-describedby={prefix + '-grading-output-help'} onChange={event => {
            const value = event.target.valueAsNumber;
            if (!event.target.value) props.onGradingOutputTokens?.(undefined);
            else if (Number.isSafeInteger(value) && value > 0) props.onGradingOutputTokens?.(value);
          }} />
        <small id={prefix + '-grading-output-help'}>Budget par appel pour la réflexion et la réponse finale, dès le premier essai. Laissez vide pour le calcul automatique. Les images et le barème occupent aussi une partie du contexte chargé dans LM Studio.</small>
      </div>}
      {!decision && <details className="ai-model-advanced">
        <summary>Échantillonnage de l’analyse (facultatif)</summary>
        <p className="hint">Laissez les champs vides pour ne rien envoyer et conserver les valeurs du modèle. Ces options concernent les corrections et radars, pas la lecture OCR.</p>
        <label className="field-label" htmlFor={prefix + '-temperature'}>Température</label>
        <input id={prefix + '-temperature'} type="number" min="0" max="2" step="0.05" placeholder="Défaut du modèle"
          disabled={disabled} value={props.analysisTemperature ?? ''} onChange={event => {
            if (event.target.value === '') props.onAnalysisTemperature?.(undefined);
            else if (Number.isFinite(event.target.valueAsNumber) && event.target.valueAsNumber >= 0 && event.target.valueAsNumber <= 2)
              props.onAnalysisTemperature?.(event.target.valueAsNumber);
          }} />
        <label className="field-label" htmlFor={prefix + '-top-p'}>Top-p (0–1)</label>
        <input id={prefix + '-top-p'} type="number" min="0.01" max="1" step="0.01" placeholder="Défaut du modèle"
          disabled={disabled} value={props.analysisTopP ?? ''} onChange={event => {
            if (event.target.value === '') props.onAnalysisTopP?.(undefined);
            else if (Number.isFinite(event.target.valueAsNumber) && event.target.valueAsNumber > 0 && event.target.valueAsNumber <= 1)
              props.onAnalysisTopP?.(event.target.valueAsNumber);
          }} />
        <label className="field-label" htmlFor={prefix + '-top-k'}>Top-k (entier)</label>
        <input id={prefix + '-top-k'} type="number" min="1" max="1000" step="1" placeholder="Défaut du modèle"
          disabled={disabled} value={props.analysisTopK ?? ''} onChange={event => {
            if (event.target.value === '') props.onAnalysisTopK?.(undefined);
            else if (Number.isSafeInteger(event.target.valueAsNumber) && event.target.valueAsNumber >= 1 && event.target.valueAsNumber <= 1000)
              props.onAnalysisTopK?.(event.target.valueAsNumber);
          }} />
        <p className="hint">Top-k fonctionne via Ollama et Chat natif LM Studio (/api/v1/chat) ; il n’est pas envoyé à Chat Completions compatible OpenAI.</p>
      </details>}
      </details>
      {apiCompatible && props.analysisThinking && !props.omitReasoningParameter && <div className="evaluation-config-field">
        <label className="field-label" htmlFor={`${prefix}-reasoning-effort`}>Effort de raisonnement</label>
        <DesignSystemSelect id={`${prefix}-reasoning-effort`}
          value={props.analysisReasoningEffort ?? 'medium'} disabled={disabled}
          onChange={(event) => props.onAnalysisReasoningEffort?.(event.target.value as AnalysisReasoningEffort)}>
          <option value="low">Faible (low)</option>
          <option value="medium">Moyen (medium)</option>
          <option value="high">Élevé (high)</option>
        </DesignSystemSelect>
        <p className="hint">Niveau demandé à l’API pour les analyses, y compris les tests de biologie. Le serveur ou le modèle peut ignorer ce paramètre.</p>
      </div>}
    </div>
  </>;
}
