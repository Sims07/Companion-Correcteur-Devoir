import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button.tsx';

const meta = {
  title: 'Composants/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['primary', 'secondary', 'danger'],
    },
  },
  args: {
    children: 'Enregistrer',
    variant: 'primary',
    disabled: false,
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary', children: 'Annuler' } };
export const Danger: Story = { args: { variant: 'danger', children: 'Supprimer' } };
export const Disabled: Story = { args: { disabled: true } };
