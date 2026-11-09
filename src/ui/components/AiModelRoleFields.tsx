import './AiModelRoleFields.css';
import type { CorrectionMethod } from '../../domain/correctionMethod.ts';
import { isVisualDecisionModel } from '../../domain/systemOneDecision.ts';
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
  disabled?: boolean;
  onGenerativeModel: (value: string) => void;
  onDecisionModel: (value: string) => void;
  onMethod: (value: CorrectionMethod) => void;
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
  </>;
}
