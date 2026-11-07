import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ContractPreparationPanel } from './ContractPreparationPanel.tsx';
import type { CorrectionWorkspaceService } from '../../application/correctionWorkspaceService.ts';
import { rubricEvaluationSignature, type Rubric } from '../../domain/rubric.ts';
import type { ContractSuggestion } from '../../domain/contractPreparation.ts';
const rubric: Rubric = { title: 'Devoir', criteria: [{ id: 'c1', title: 'Mécanisme', description: 'Expliquer une relation causale', maxPoints: 2 }] };
const service = { prepareFiles: async () => { throw new Error('Collez du texte ou réutilisez le document de démonstration.'); }, createProvider: () => { throw new Error('Lecture désactivée dans la démonstration.'); }, prepareQuestionContracts: async (rubric: Rubric) => {
  const missing = { value: '', source: 'missing' as const, quote: '' };
  const suggestion: ContractSuggestion = { criterionId: 'c1', scope: 'question', fields: { questionId: { value: '1', source: 'subject', quote: 'Question 1' }, instruction: { value: 'Expliquer une relation causale', source: 'subject', quote: 'Expliquer une relation causale' }, expectedRelation: missing, acceptedAlternatives: missing, contradictions: missing }, warning: 'Aucun corrigé fourni ; les informations absentes restent à préciser si nécessaire.' };
  return { signature: rubricEvaluationSignature(rubric), suggestions: [suggestion] };
} } satisfies Pick<CorrectionWorkspaceService, 'prepareQuestionContracts' | 'prepareFiles' | 'createProvider'>;
const meta = { title: 'Parcours enseignant/Préparer depuis le sujet', component: ContractPreparationPanel, tags: ['autodocs'], args: { rubric, service, settings: { endpoint: 'http://localhost:11434', analysisModel: 'modèle-local' }, assignmentId: 'storybook-contract-preparation', existingDocument: 'Question 1\nExpliquer une relation causale', onApply: () => undefined }, render: (args) => { const [value, setValue] = useState(args.rubric); return <ContractPreparationPanel {...args} rubric={value} onApply={setValue} />; } } satisfies Meta<typeof ContractPreparationPanel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SansCorrige: Story = {};
export const SansBareme: Story = { args: { rubric: { title: 'À préparer', criteria: [] } } };
