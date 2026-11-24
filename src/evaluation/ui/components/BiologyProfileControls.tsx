import type { AiModelProfile, AnalysisReasoningEffort } from '../../../shared/domain/aiModelProfiles.ts';

export interface BiologyProfileSelection {
  preferredProfileId?: string;
  onChooseProfile?: (id: string) => void;
  onReasoningChange?: (profile: AiModelProfile, mode: AnalysisReasoningEffort | 'off' | 'default') => void;
}

export function BiologyProfileControls({ profiles, profile, busy, onChooseProfile, onReasoningChange }:
  BiologyProfileSelection & { profiles: AiModelProfile[]; profile?: AiModelProfile; busy: boolean }) {
  if (!profile) return null;
  const config = profile.configuration;
  return <>
    {profiles.length > 1 && onChooseProfile && <label>Profil du prochain essai
      <select value={profile.id} disabled={busy} onChange={event => onChooseProfile(event.target.value)}>
        {profiles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>}
    {config.apiCompatible && config.correctionMethod === 'generative' && onReasoningChange &&
      <label>Raisonnement du profil {profile.name}
        <select value={config.omitReasoningParameter ? 'default' : config.analysisThinking ? config.analysisReasoningEffort ?? 'medium' : 'off'}
          disabled={busy} onChange={event => onReasoningChange(profile, event.target.value as AnalysisReasoningEffort | 'off' | 'default')}>
          <option value="default">Par défaut du modèle</option>
          <option value="off">Désactivé</option>
          {config.analysisReasoningEffort === 'on' && <option value="on">Activé</option>}
          <option value="low">Faible</option>
          <option value="medium">Moyen</option>
          <option value="high">Élevé</option>
        </select>
      </label>}
  </>;
}
