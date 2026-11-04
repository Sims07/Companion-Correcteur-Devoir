import type { Meta, StoryObj } from '@storybook/react';
import { Field } from './Field.tsx';
import { TextInput } from './TextInput.tsx';

const meta = {
  title: 'Composants/Field',
  component: Field,
  tags: ['autodocs'],
  args: {
    label: 'Nom du devoir',
    htmlFor: 'assignment-name',
  },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div style={{ maxWidth: 420 }}>
      <Field {...args}>
        <TextInput id="assignment-name" placeholder="Ex. Biologie cellulaire" />
      </Field>
    </div>
  ),
};

export const WithHint: Story = {
  args: { hint: 'Ce nom sera visible uniquement dans votre espace local.' },
  render: (args) => (
    <div style={{ maxWidth: 420 }}>
      <Field {...args}>
        <TextInput id="assignment-name" placeholder="Ex. Biologie cellulaire" />
      </Field>
    </div>
  ),
};

export const WithError: Story = {
  args: { error: 'Ce champ est obligatoire.', required: true },
  render: (args) => (
    <div style={{ maxWidth: 420 }}>
      <Field {...args}>
        <TextInput id="assignment-name" placeholder="Ex. Biologie cellulaire" />
      </Field>
    </div>
  ),
};
