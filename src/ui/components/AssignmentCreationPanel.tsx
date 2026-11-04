import { useState, type FormEvent } from 'react';
import { Button, Field, TextArea, TextInput } from '../design-system/index.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';

export interface NewAssignmentDetails {
  title: string;
  description: string;
  educationLevel: string;
}

interface Props {
  onCreate: (details: NewAssignmentDetails) => void;
  onCancel: () => void;
}

export function AssignmentCreationPanel({ onCreate, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [attempted, setAttempted] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);
    if (!title.trim()) return;
    onCreate({ title: title.trim(), description: description.trim(), educationLevel });
  }

  return <section className="assignment-creation-panel panel" aria-labelledby="assignment-creation-heading">
    <div className="assignment-creation-heading">
      <div><p className="eyebrow">NOUVEAU DEVOIR</p><h3 id="assignment-creation-heading">Préparer une évaluation</h3><p>Donnez un nom au devoir. Vous préparerez ensuite son barème, à partir de zéro ou d’un ancien devoir.</p></div>
    </div>
    <form onSubmit={submit} className="assignment-creation-form" noValidate>
      <Field label="Nom du devoir" htmlFor="new-assignment-title" required error={attempted && !title.trim() ? 'Donnez un nom à ce devoir.' : undefined}>
        <TextInput id="new-assignment-title" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex. Partiel de biologie cellulaire" />
      </Field>
      <Field label="Niveau" htmlFor="new-assignment-level" hint="Facultatif : aide à calibrer le vocabulaire attendu.">
        <DesignSystemSelect id="new-assignment-level" value={educationLevel} onChange={(event) => setEducationLevel(event.target.value)}>
          <option value="">Choisir un niveau</option>
          <option value="Lycée — Seconde">Lycée — Seconde</option>
          <option value="Lycée — Première">Lycée — Première</option>
          <option value="Lycée — Terminale">Lycée — Terminale</option>
          <option value="Université — Licence 1">Université — Licence 1</option>
          <option value="Université — Licence 2">Université — Licence 2</option>
          <option value="Université — Licence 3">Université — Licence 3</option>
          <option value="Université — Master 1">Université — Master 1</option>
          <option value="Université — Master 2">Université — Master 2</option>
          <option value="Université — Doctorat">Université — Doctorat</option>
          <option value="Autre">Autre</option>
        </DesignSystemSelect>
      </Field>
      <Field label="Objectif pédagogique" htmlFor="new-assignment-description" hint="Facultatif : précisez ce que les étudiants doivent démontrer.">
        <TextArea id="new-assignment-description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex. Identifier les phases de la mitose et argumenter les mécanismes." />
      </Field>
      <div className="assignment-creation-actions">
        <Button variant="secondary" onClick={onCancel}>Annuler</Button>
        <Button type="submit">Créer et préparer le barème →</Button>
      </div>
    </form>
  </section>;
}
