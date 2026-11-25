import { DEFAULT_ZOOM_BUDGET } from '../../domain/smartZoomBudget.ts';
import './AiModelRoleFields.css';
import { useState } from 'react';
import type { AiModelOption, AnalysisReasoningEffort } from '../../domain/aiModelProfiles.ts';
import type { CorrectionMethod } from '../../domain/correctionMethod.ts';
import { isVisualDecisionModel } from '../../domain/decisionModelCapabilities.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';
import { StatusNotice } from '../design-system/index.ts';

interface Props {
  prefix: 'ai' | 'evaluation';
  models: AiModelOption[];
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
  smartZoomBudget?: number;
  onSmartZoomBudget?: (budget: number) => void;
  contextLength?: number;
  onContextLength?: (length: number | undefined) => void;
  onReasoning: (mode: ReasoningMode) => void;
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
}

export type ReasoningMode = 'default' | 'off' | AnalysisReasoningEffort;

/** The same vocabulary and model selection in teacher settings and the evaluator. */
export function AiModelRoleFields(props: Props) {
  const { prefix, generativeModel, decisionModel, visionModel, method, apiCompatible, disabled } = props;
  const [manualModel, setManualModel] = useState(false);
  const generativeId = prefix === 'ai' ? 'ollama-analysis-model' : 'evaluation-analysis-model';
  function modelField(id: string, label: string, value: string, onChange: (value: string) => void, hint: string) {
    const choices = Array.from(new Set([value, ...props.models.map(model => model.name)].filter(Boolean)));
    const canToggleManual = id === generativeId && apiCompatible && props.models.length > 0;
    return <div className="evaluation-config-field">
      <label className="field-label" htmlFor={id}>{label}</label>
      {props.models.length > 0 && !(canToggleManual && manualModel)
        ? <DesignSystemSelect id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)}>
          <option value="">Choisir un modèle</option>
          {choices.map(model => {
            const label = props.models.find(item => item.name === model)?.label;
            return <option key={model} value={model}>{label && label !== model ? label + ' · ' : ''}{model}</option>;
          })}
        </DesignSystemSelect>
        : <input id={id} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} placeholder={label.startsWith('Modèle génératif') ? 'Ex. qwen3.5:4b' : 'Ex. tev1:4b'} />}
      {canToggleManual && <button type="button" className="secondary-button" disabled={disabled}
        onClick={() => setManualModel(!manualModel)}>{manualModel ? 'Afficher les modèles détectés' : 'Saisir un identifiant'}</button>}
      <p className="hint">{hint}</p>
    </div>;
  }
  const decision = method !== 'generative';
  const selectedModel = props.models.find(model => model.name === generativeModel);
  const diagramUsesResponses = props.responses || (props.nativeChat && props.smartZoom);
  const mode: ReasoningMode = props.omitReasoningParameter && apiCompatible ? 'default'
    : props.analysisThinking ? apiCompatible ? props.analysisReasoningEffort ?? 'medium' : 'on'
    : 'off';
  const nativeOptions = props.nativeChat && !diagramUsesResponses ? selectedModel?.reasoningOptions : undefined;
  const efforts = (['low', 'medium', 'high'] as const).filter(effort =>
    !nativeOptions || nativeOptions.includes(effort) || mode === effort);
  const effortLabels = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };
  return <>
    {modelField(generativeId, 'Modèle génératif', generativeModel, props.onGenerativeModel,
      'Prépare les barèmes et peut corriger les copies. Choisissez un modèle avec vision pour lire aussi les images, ou configurez une lecture distincte dans les options avancées.')}
    {props.models.length > 0 && generativeModel && !selectedModel && <p className="hint">Ce modèle est absent du catalogue détecté.</p>}
    {selectedModel && (selectedModel.vision !== undefined || selectedModel.tools !== undefined) &&
      <p className="hint" role="status">LM Studio indique {[selectedModel.vision === undefined ? '' : selectedModel.vision ? 'vision prise en charge' : 'vision indisponible',
        selectedModel.tools === undefined ? '' : selectedModel.tools ? 'modèle entraîné aux appels d’outils' : 'modèle sans entraînement aux appels d’outils'].filter(Boolean).join(' · ')}.</p>}
    <details className="ai-model-advanced" open={decision || undefined}><summary>Méthode de correction et modèle décisionnel</summary>
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
    </details>
    <div className="evaluation-config-field">
      <label className="field-label" htmlFor={prefix + '-reasoning'}>Raisonnement</label>
      <DesignSystemSelect id={prefix + '-reasoning'} value={mode} disabled={disabled}
        onChange={event => props.onReasoning(event.target.value as ReasoningMode)}>
        {apiCompatible && <option value="default">Par défaut du modèle</option>}
        {(!nativeOptions || nativeOptions.includes('off') || mode === 'off') && <option value="off">Désactivé</option>}
        {(!apiCompatible || nativeOptions?.includes('on') || mode === 'on') && <option value="on">Activé</option>}
        {apiCompatible && efforts.map(effort => <option key={effort} value={effort}>{effortLabels[effort]}</option>)}
      </DesignSystemSelect>
      {props.responses && <p className="hint">Le mode « Désactivé » transmet reasoning.effort = none à LM Studio Responses. « Par défaut du modèle » n’envoie pas de réglage.</p>}
      {props.nativeChat && props.smartZoom && mode === 'off' &&
        <p className="hint">Avec le zoom, les schémas suivent le réglage de raisonnement du modèle dans LM Studio.</p>}
      {apiCompatible && (props.nativeChat || props.responses) && !decision && <label className="analysis-thinking-option" htmlFor={prefix + '-smart-zoom'}>
        <input id={prefix + '-smart-zoom'} type="checkbox" checked={props.smartZoom === true} disabled={disabled}
          onChange={event => props.onSmartZoom?.(event.target.checked)} />
        <span><strong>Zoom intelligent sur demande</strong>
          <small>Pour les schémas, le modèle peut examiner une zone de la photo originale quand il hésite. Le test de cadrage du laboratoire permet de vérifier les appels de zoom.</small>
        </span>
      </label>}
      {apiCompatible && (props.nativeChat || props.responses) && !decision && props.smartZoom && <div className="evaluation-config-field">
        <label className="field-label" htmlFor={prefix + '-zoom-budget'}>Zooms maximum par critère</label>
        <DesignSystemSelect id={prefix + '-zoom-budget'} value={String(props.smartZoomBudget ?? DEFAULT_ZOOM_BUDGET)} disabled={disabled}
          onChange={event => props.onSmartZoomBudget?.(Number(event.target.value))}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}{n === DEFAULT_ZOOM_BUDGET ? ' (recommandé)' : ''}</option>)}
        </DesignSystemSelect>
        <p className="hint">Les recadrages invalides ou répétés disposent d’un budget distinct. Un dernier tour sans outil permet au modèle de conclure.</p>
      </div>}
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
        <p className="hint">Top-k s’applique avec Ollama et Chat natif LM Studio, hors mode Responses.</p>
      </details>}
      </details>
    </div>
  </>;
}
