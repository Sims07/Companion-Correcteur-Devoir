import type { Meta, StoryObj } from '@storybook/react';
import { TextArea } from './TextArea.tsx';

const meta = {
  title: 'Composants/TextArea',
  component: TextArea,
  tags: ['autodocs'],
  args: {
    placeholder: 'Saisir une consigne…',
    'aria-label': 'Consigne',
    rows: 4,
  },
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = {
  args: { defaultValue: 'Décrire les principales étapes de la mitose.' },
};
export const Disabled: Story = { args: { disabled: true, defaultValue: 'Consigne verrouillée' } };
export const Invalid: Story = { args: { 'aria-invalid': true, defaultValue: 'Texte à corriger' } };
