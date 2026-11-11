import { useState } from 'react';
import type { AiModelProfile } from '../../domain/aiModelProfiles.ts';
import { Button, Dialog } from '../design-system/index.ts';
import './EvaluationProfilesDialog.css';

interface EvaluationProfilesDialogProps {
  profiles: readonly AiModelProfile[];
  selectedIds: readonly string[];
  busy: boolean;
  onChange: (ids: string[]) => void;
  onCreate: () => void;
  onEditCurrent: () => void;
  onEdit: (profile: AiModelProfile) => void;
  onManageDeletion: () => void;
  onClose: () => void;
}

const maxSelection = 3;

/** Model selection and editing are secondary tasks, not another permanent panel above tests. */
export function EvaluationProfilesDialog({
  profiles, selectedIds, busy, onChange, onCreate, onEditCurrent, onEdit, onManageDeletion, onClose,
}: EvaluationProfilesDialogProps) {
  const [search, setSearch] = useState('');
  const visibleProfiles = profiles.filter((profile) =>
    (profile.name + ' ' + profile.configuration.visionModel + ' ' + profile.configuration.analysisModel)
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  function toggle(id: string, checked: boolean) {
    if (busy) return;
    const next = checked
      ? [...selectedIds.filter((value) => value !== id), id].slice(0, maxSelection)
      : selectedIds.filter((value) => value !== id);
    onChange(next);
  }

  return <Dialog title="Gérer les configurations IA" subtitle="Sélection, création et modification des modèles" size="wide"
    onClose={onClose} actions={<Button variant="primary" onClick={onClose}>Terminer</Button>}>
    <div className="evaluation-profiles-dialog">
      <p className="evaluation-profiles-dialog-intro">Sélectionnez jusqu’à trois configurations pour les tests. La sélection est enregistrée sur cet appareil et utilisée par les batteries.</p>
      <div className="evaluation-profiles-dialog-toolbar">
        <label className="evaluation-profiles-search">
          <span>Rechercher</span>
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Nom ou modèle IA" aria-label="Rechercher une configuration" />
        </label>
        <Button variant="secondary" disabled={busy} onClick={onCreate}>+ Nouvelle configuration</Button>
        <Button variant="secondary" disabled={busy} onClick={onEditCurrent}>Modifier les réglages courants</Button>
        <Button variant="secondary" disabled={busy || profiles.length === 0} onClick={onManageDeletion}>Supprimer des configurations</Button>
      </div>
      <fieldset className="evaluation-profiles-dialog-list" aria-label="Configurations à exécuter">
        <legend>Modèles pour les tests <span aria-live="polite">{selectedIds.length} / {maxSelection}</span></legend>
        {visibleProfiles.map((profile) => {
          const checked = selectedIds.includes(profile.id);
          const disabled = busy || (!checked && selectedIds.length >= maxSelection);
          return <div key={profile.id} className={checked ? 'evaluation-profiles-dialog-item is-selected' : 'evaluation-profiles-dialog-item'}>
            <label className="evaluation-profiles-dialog-choice">
              <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => toggle(profile.id, event.target.checked)} />
              <span>
                <strong>{profile.name}</strong>
                <small>{profile.configuration.visionModel || 'Vision non définie'} · {profile.configuration.analysisModel || 'Analyse non définie'} · {profile.configuration.apiCompatible ? 'API compatible' : 'Ollama'}</small>
              </span>
            </label>
            <Button variant="secondary" disabled={busy} onClick={() => onEdit(profile)}>Modifier</Button>
          </div>;
        })}
        {profiles.length === 0 && <p className="evaluation-profiles-dialog-empty">Aucune configuration enregistrée. Créez votre premier modèle pour commencer les tests.</p>}
        {profiles.length > 0 && visibleProfiles.length === 0 && <p className="evaluation-profiles-dialog-empty">Aucune configuration ne correspond à cette recherche.</p>}
      </fieldset>
      {selectedIds.length >= maxSelection && <p className="evaluation-profiles-dialog-limit">Trois modèles sélectionnés : décochez-en un pour en choisir un autre.</p>}
    </div>
  </Dialog>;
}
