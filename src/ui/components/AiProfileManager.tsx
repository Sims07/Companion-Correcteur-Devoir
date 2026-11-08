import { useState } from 'react';
import type { AiModelProfile } from '../../domain/aiModelProfiles.ts';
import { Button, Checkbox, Dialog } from '../design-system/index.ts';
import './AiProfileManager.css';

export interface AiProfileManagerProps {
  profiles: readonly AiModelProfile[];
  activeProfileId: string;
  selectedEvaluationProfileIds: readonly string[];
  busy: boolean;
  onDelete: (profileIds: readonly string[]) => boolean;
  onClose: () => void;
}

/** A single accessible workspace to prune a long local profile list.
 * Nothing is deleted until the user confirms the explicit set of names. */
export function AiProfileManager({
  profiles, activeProfileId, selectedEvaluationProfileIds, busy, onDelete, onClose,
}: AiProfileManagerProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const selected = profiles.filter((profile) => selectedIds.includes(profile.id));
  const remaining = profiles.length - selected.length;

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => checked
      ? [...current.filter((value) => value !== id), id]
      : current.filter((value) => value !== id));
    setError('');
  }

  function confirmDelete() {
    if (busy || selected.length === 0) return;
    const ids = selected.map((profile) => profile.id);
    if (onDelete(ids)) onClose();
    else setError('La suppression n’a pas été enregistrée. Aucune configuration n’a été retirée de la liste.');
  }

  return (
    <Dialog
      title={confirming ? 'Confirmer la suppression des configurations' : 'Gérer mes configurations IA'}
      subtitle={confirming ? selected.length + ' configuration(s) sélectionnée(s)' : profiles.length + ' configurations enregistrées sur cet appareil'}
      size="wide"
      onClose={onClose}
      actions={confirming ? <>
        <Button variant="secondary" disabled={busy} onClick={() => { setConfirming(false); setError(''); }}>Retour à la liste</Button>
        <Button variant="danger" disabled={busy || selected.length === 0} onClick={confirmDelete}>
          Confirmer la suppression de {selected.length} configuration(s)
        </Button>
      </> : <>
        <Button variant="secondary" onClick={onClose}>Fermer</Button>
        <Button variant="danger" disabled={busy || selected.length === 0}
          onClick={() => { setConfirming(true); setError(''); }}>
          Supprimer {selected.length} configuration(s)…
        </Button>
      </>}
    >
      {confirming ? <>
        <p>Les configurations ci-dessous seront retirées <strong>uniquement de cet appareil</strong>. Cette opération ne peut pas être annulée.</p>
        <ul className="ai-profile-manager-confirm-list">
          {selected.map((profile) => <li key={profile.id}>{profile.name}</li>)}
        </ul>
        <p><strong>{remaining} configuration(s) conservée(s).</strong> Les réglages actuellement chargés, les devoirs, les copies et l’historique des évaluations ne sont pas supprimés. Les profils supprimés disparaîtront des sélections futures.</p>
      </> : <>
        <p>Sélectionnez les profils à <strong>supprimer</strong>. Pour n’en garder que trois, utilisez « Tout sélectionner », puis décochez les trois à conserver.</p>
        <div className="ai-profile-manager-toolbar">
          <Button variant="secondary" disabled={busy || profiles.length === 0} onClick={() => {
            setSelectedIds(profiles.map((profile) => profile.id)); setError('');
          }}>Tout sélectionner</Button>
          <Button variant="secondary" disabled={busy || selected.length === 0} onClick={() => {
            setSelectedIds([]); setError('');
          }}>Tout désélectionner</Button>
          <span aria-live="polite">{selected.length} à supprimer · {remaining} à conserver</span>
        </div>
        <fieldset className="ai-profile-manager-list">
          <legend>Configurations à supprimer</legend>
          {profiles.map((profile) => <div className="ai-profile-manager-item" key={profile.id}>
            <Checkbox checked={selectedIds.includes(profile.id)} disabled={busy}
              onChange={(event) => toggle(profile.id, event.target.checked)}>
              <span className="ai-profile-manager-item-detail">
                <strong>{profile.name}</strong>
                <small>{profile.configuration.visionModel || 'Vision non définie'} → {profile.configuration.analysisModel || 'Analyse non définie'} · {profile.configuration.correctionMethod === 'visual-decision' ? 'Vision + Décisionnel direct' : profile.configuration.correctionMethod === 'decision' ? 'Décisionnelle' : 'Classique'} · {profile.configuration.apiCompatible ? 'API compatible' : 'Ollama'}</small>
                {(activeProfileId === profile.id || selectedEvaluationProfileIds.includes(profile.id)) && <small className="ai-profile-manager-item-hint">
                  {activeProfileId === profile.id ? 'Configuration chargée' : ''}
                  {activeProfileId === profile.id && selectedEvaluationProfileIds.includes(profile.id) ? ' · ' : ''}
                  {selectedEvaluationProfileIds.includes(profile.id) ? 'Sélectionnée pour les évaluations' : ''}
                </small>}
              </span>
            </Checkbox>
          </div>)}
        </fieldset>
        {profiles.length === 0 && <p>Aucune configuration enregistrée à supprimer.</p>}
        <p className="ai-profile-manager-note">La suppression d’une configuration ne désinstalle pas son modèle Ollama et ne supprime aucun historique. Les configurations sont stockées dans le navigateur utilisé.</p>
      </>}
      {error && <p role="alert" className="ai-profile-manager-error">{error}</p>}
    </Dialog>
  );
}
