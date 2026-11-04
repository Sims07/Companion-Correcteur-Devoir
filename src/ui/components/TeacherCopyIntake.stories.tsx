import type { Meta, StoryObj } from '@storybook/react';
import { TeacherCopyIntake } from './TeacherCopyIntake.tsx';

const meta = {
  title: 'Parcours enseignant/Ajouter des copies',
  component: TeacherCopyIntake,
  tags: ['autodocs'],
  args: {
    grouping: 'each-file',
    onGroupingChange: () => undefined,
    studentLabel: '',
    onStudentLabelChange: () => undefined,
    hasTeacherAnnotations: false,
    onTeacherAnnotationsChange: () => undefined,
    onFilesSelected: () => undefined,
    onClose: () => undefined,
    onOpenDetailedCopy: () => undefined,
    busy: false,
    rubricReady: true,
  },
} satisfies Meta<typeof TeacherCopyIntake>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UneCopieParFichier: Story = {};
export const PlusieursPages: Story = { args: { grouping: 'group-files' } };
export const BaremeIncomplet: Story = { args: { rubricReady: false } };
