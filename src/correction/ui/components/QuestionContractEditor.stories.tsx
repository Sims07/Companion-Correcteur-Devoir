import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QuestionContractEditor, QuestionScopePreview } from './QuestionContractEditor.tsx';
import type { RubricCriterion } from '../../domain/rubric.ts';

const criterion: RubricCriterion = { id: 'c1', title: 'Relation causale', description: 'Expliquer le mécanisme.', maxPoints: 2, correctionContract: { question: { id: '1', instruction: 'Expliquez le lien entre les deux observations.' }, expectedRelation: 'Cause et conséquence dans le bon sens.', acceptedAlternatives: '', contradictions: '' } };
const meta = { title: 'Parcours enseignant/Contrat par question', component: QuestionContractEditor, tags: ['autodocs'], args: { criterion, onChange: () => undefined }, render: (args) => { const [value, setValue] = useState(args.criterion); return <QuestionContractEditor criterion={value} onChange={patch => setValue(current => ({ ...current, ...patch }))} />; } } satisfies Meta<typeof QuestionContractEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Question: Story = {};
export const Transversal: Story = { args: { criterion: { ...criterion, correctionContract: { ...criterion.correctionContract!, question: undefined } } } };
export const Rattachement: Story = { render: () => <QuestionScopePreview criteria={[criterion]} transcription={'Question 1\nÉnoncé imprimé\nRéponse :\nLa première observation explique la seconde.\nQuestion 2\nRéponse :\nAutre réponse.'} /> };
export const AVerifier: Story = { render: () => <QuestionScopePreview criteria={[criterion]} transcription="Texte sans numéro identifiable." /> };
