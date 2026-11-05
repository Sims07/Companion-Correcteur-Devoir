import { FilePicker } from './FilePicker.tsx';
import { Button, Field, StatusNotice, TextInput } from '../design-system/index.ts';
import './TeacherCopyIntake.css';

type Props = {
  grouping: 'each-file' | 'group-files';
  onGroupingChange: (grouping: 'each-file' | 'group-files') => void;
  studentLabel: string;
  onStudentLabelChange: (label: string) => void;
  hasTeacherAnnotations: boolean;
  onTeacherAnnotationsChange: (enabled: boolean) => void;
  onFilesSelected: (files: FileList | null) => void;
  onClose: () => void;
  onOpenDetailedCopy: () => void;
  busy: boolean;
  rubricReady: boolean;
};

/** One teacher entry point for importing one copy or a whole set. */
export function TeacherCopyIntake({
  grouping, onGroupingChange, studentLabel, onStudentLabelChange,
  hasTeacherAnnotations, onTeacherAnnotationsChange, onFilesSelected,
  onClose, onOpenDetailedCopy, busy, rubricReady,
}: Props) {
  return <section id="teacher-copy-intake" className="teacher-copy-intake panel" aria-labelledby="teacher-copy-intake-title">
    <header className="teacher-copy-intake-header">
      <div><h3 id="teacher-copy-intake-title">Ajouter des copies</h3><p>Choisissez comment regrouper vos fichiers : une copie peut contenir plusieurs pages.</p></div>
      <Button variant="secondary" onClick={onClose}>Fermer</Button>
    </header>
    <fieldset className="teacher-copy-intake-grouping">
      <legend>Comment sont organisés vos fichiers ?</legend>
      <label className={grouping === 'each-file' ? 'is-selected' : ''}>
        <input type="radio" name="teacher-copy-grouping" checked={grouping === 'each-file'} onChange={() => onGroupingChange('each-file')} />
        <span><strong>Un fichier par copie</strong><small>Plusieurs PDF ou photos, chacun pour un étudiant. Les pages d’un PDF restent ensemble.</small></span>
      </label>
      <label className={grouping === 'group-files' ? 'is-selected' : ''}>
        <input type="radio" name="teacher-copy-grouping" checked={grouping === 'group-files'} onChange={() => onGroupingChange('group-files')} />
        <span><strong>Plusieurs fichiers pour une copie</strong><small>Regrouper toutes les photos ou pages sélectionnées pour un seul étudiant.</small></span>
      </label>
    </fieldset>
    {(grouping === 'group-files') && <Field label="Nom de l’étudiant (facultatif)" htmlFor="teacher-intake-student-name">
      <TextInput id="teacher-intake-student-name" value={studentLabel} onChange={(event) => onStudentLabelChange(event.target.value)} placeholder="À laisser vide si le nom est sur la copie" />
    </Field>}
    <details className="teacher-copy-intake-advanced">
      <summary>Options pour les copies annotées</summary>
      <label><input type="checkbox" checked={hasTeacherAnnotations} onChange={(event) => onTeacherAnnotationsChange(event.target.checked)} />Ces copies contiennent des annotations du professeur</label>
    </details>
    {!rubricReady ? <StatusNotice tone="warning">Complétez le barème avant d’ajouter les copies.</StatusNotice> : <FilePicker
      id="teacher-copy-intake-files"
      accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
      multiple
      disabled={busy}
      onFilesSelected={onFilesSelected}
      title={grouping === 'group-files' ? 'Choisir les pages de cette copie' : 'Choisir les copies'}
      description={grouping === 'group-files' ? 'Les fichiers sélectionnés formeront une seule copie.' : 'Chaque fichier est une copie. Les PDF multipages restent regroupés.'}
      actionLabel={busy ? 'Ajout en cours…' : 'Ajouter au suivi'}
    />}
    <p className="teacher-copy-intake-footer">Les copies rejoignent le suivi du devoir. Vous pouvez renouveler l’ajout sans perdre celles déjà présentes.</p>
    <button type="button" className="text-button teacher-copy-intake-detailed" onClick={onOpenDetailedCopy}>Préparer manuellement une copie et ses pages</button>
  </section>;
}
