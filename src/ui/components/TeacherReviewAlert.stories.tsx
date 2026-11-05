import type { Meta, StoryObj } from '@storybook/react';
import { TeacherReviewAlert } from './TeacherReviewAlert.tsx';

const meta = {
  title: 'Parcours enseignant/Point à examiner',
  component: TeacherReviewAlert,
  tags: ['autodocs'],
  args: {
    reasons: ['Point retiré', 'Confiance à vérifier'],
    rationale: 'Le mécanisme de séparation des chromatides n’est pas expliqué. Une réponse plus longue a été produite par le modèle, mais le professeur ne la lit que sur demande.',
    questionForTeacher: 'Le terme manuscrit correspond-il bien à anaphase ?',
    annotationSuggestion: 'Précise le rôle du fuseau mitotique lors de l’anaphase.',
    pageNumber: 1,
    onShowEvidence: () => undefined,
  },
} satisfies Meta<typeof TeacherReviewAlert>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PointRetire: Story = {};
export const SansQuestion: Story = { args: { questionForTeacher: null, annotationSuggestion: null } };
