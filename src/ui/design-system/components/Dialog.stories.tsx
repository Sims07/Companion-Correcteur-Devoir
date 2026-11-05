import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button.tsx';
import { Dialog } from './Dialog.tsx';

function DialogExample({ destructive = false }: { destructive?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="secondary" onClick={() => setOpen(true)}>{destructive ? 'Retirer une copie' : 'Ouvrir la fenêtre'}</Button>
    {open && <Dialog
      title={destructive ? 'Retirer cette copie ?' : 'Vérifier les informations'}
      subtitle={destructive ? 'Copie de biologie · 2 pages' : 'À confirmer avant de poursuivre'}
      onClose={() => setOpen(false)}
      actions={<>
        <Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button>
        <Button variant={destructive ? 'danger' : 'primary'} onClick={() => setOpen(false)}>{destructive ? 'Retirer la copie' : 'Confirmer'}</Button>
      </>}
    ><p>{destructive ? 'Les pages et données locales associées seront supprimées.' : 'Le professeur garde le contrôle sur les décisions.'}</p></Dialog>}
  </>;
}

const meta = {
  title: 'Composants/Dialog',
  component: Dialog,
  tags: ['autodocs'],
  args: { title: 'Fenêtre de confirmation', children: 'Contenu de confirmation' },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Confirmation: Story = { render: () => <DialogExample /> };
export const Suppression: Story = { render: () => <DialogExample destructive /> };
