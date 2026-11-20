import type { Meta, StoryObj } from '@storybook/react';
import { TeacherReviewAlert } from './TeacherReviewAlert.tsx';

const meta = {
  title: 'Parcours enseignant/Point à examiner',
  component: TeacherReviewAlert,
  tags: ['autodocs'],
  args: {
    reasons: ['Point retiré', 'Confiance à vérifier', 'Question pour vous'],
    rationale: '',
    evidence: 'La télophase est représentée, mais l’interphase est absente.',
    questionForTeacher: 'L’interphase n’est pas représentée parmi les 4 panneaux.',
    annotationSuggestion: 'Vérifier la présence de l’interphase.',
  },
} satisfies Meta<typeof TeacherReviewAlert>;
export default meta;
type Story = StoryObj<typeof meta>;

export const VerificationCiblee: Story = {};
export const IncertitudeSansQuestion: Story = {
  args: {
    reasons: ['Confiance à vérifier'],
    rationale: 'Le terme manuscrit est difficile à distinguer.',
    questionForTeacher: null, annotationSuggestion: null,
  },
};
export const SousCritereDejaSignale: Story = {
  args: {
    reasons: ['Non évalué'],
    questionForTeacher: 'L’interphase est-elle présente ?',
    hasPendingSubcriteria: true, annotationSuggestion: null,
  },
};
