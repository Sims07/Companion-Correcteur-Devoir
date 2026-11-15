import type { Meta, StoryObj } from '@storybook/react';
import { StatusNotice } from './StatusNotice.tsx';

const meta = {
  title: 'Composants/StatusNotice',
  component: StatusNotice,
  args: { tone: 'success', children: 'Profil enregistré sur cet appareil.' },
} satisfies Meta<typeof StatusNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Confirmation: Story = {};
export const Information: Story = { args: { tone: 'info', children: 'Profil chargé.' } };
export const Avertissement: Story = { args: { tone: 'warning', children: 'Aucun modèle détecté.' } };
export const Erreur: Story = { args: { tone: 'error', children: 'Enregistrement impossible.' } };
