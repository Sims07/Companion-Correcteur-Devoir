import type { Meta, StoryObj } from '@storybook/react';
import { AssignmentCreationPanel } from './AssignmentCreationPanel.tsx';
import './TeacherSetup.css';

const meta = {
  title: 'Parcours enseignant/Créer un devoir',
  component: AssignmentCreationPanel,
  tags: ['autodocs'],
  args: {
    onCreate: (details) => { window.alert('Devoir : ' + details.title); },
    onCancel: () => { window.alert('Création annulée'); },
  },
} satisfies Meta<typeof AssignmentCreationPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Formulaire: Story = {};
