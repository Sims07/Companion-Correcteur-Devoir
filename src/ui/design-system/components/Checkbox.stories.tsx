import type { Meta, StoryObj } from '@storybook/react';
import { Checkbox } from './Checkbox.tsx';

const meta = {
  title: 'Composants/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  args: {
    children: 'Activer le mode réflexion',
    name: 'deepAnalysis',
  },
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };
