import type { Meta, StoryObj } from '@storybook/react';
import { TextInput } from './TextInput.tsx';

const meta = {
  title: 'Composants/TextInput',
  component: TextInput,
  tags: ['autodocs'],
  args: {
    placeholder: 'Saisir une valeur…',
    'aria-label': 'Champ de texte',
  },
} satisfies Meta<typeof TextInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = { args: { defaultValue: 'Biologie cellulaire' } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'Non modifiable' } };
export const Invalid: Story = { args: { 'aria-invalid': true, defaultValue: 'Valeur à corriger' } };
