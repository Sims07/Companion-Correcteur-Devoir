import type { Meta, StoryObj } from '@storybook/react';
import { ReviewCriterionEvidence } from './ReviewCriterionEvidence.tsx';

const meta = {
  title: 'Parcours enseignant/Preuves et points du critère',
  component: ReviewCriterionEvidence,
  tags: ['autodocs'],
  args: {
    title: 'Compréhension',
    maximum: 2,
    criterion: {
      criterionId: 'comprehension', points: 1.32, teacherPoints: 1.32,
      rationale: 'Vérification nécessaire', evidence: 'La télophase est dessinée, mais aucune interphase n’est visible.',
      confidence: 'low' as const, assessmentStatus: 'not-evaluated' as const,
      teacherComment: '', decision: 'pending' as const,
      subcriteria: [
        { subcriterionId: 'a', title: 'Respect biologique', points: 0.66, maxPoints: 0.66, evidence: 'Deux masses nucléaires et phragmoplaste.', assessmentStatus: 'evaluated' as const },
        { subcriterionId: 'b', title: 'Phases de la mitose', points: 0.66, maxPoints: 0.66, evidence: 'Trois phases présentes.', assessmentStatus: 'evaluated' as const },
        { subcriterionId: 'c', title: 'Interphase obligatoire', points: 0, maxPoints: 0.68, evidence: 'Interphase non repérée.', assessmentStatus: 'not-evaluated' as const, questionForTeacher: 'L’interphase est-elle présente sur un panneau ?' },
      ],
    },
    onResolveSubcriterion: () => undefined,
    pageNumber: 1,
    onShowPage: () => undefined,
  },
} satisfies Meta<typeof ReviewCriterionEvidence>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AVerifier: Story = {};
export const ArchiveLectureSeule: Story = { args: { disabled: true } };
export const SansSousCriteres: Story = {
  args: {
    criterion: {
      ...meta.args.criterion, subcriteria: undefined, evidence: 'La preuve de la réponse reste à confirmer sur la copie.',
    },
  },
};
