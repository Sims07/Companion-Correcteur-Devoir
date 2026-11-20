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

/** Vérifier que les actions restent reconnaissables sur les trois papiers du parcours. */
export const SurfacesContrastees: Story = {
  render: () => <div style={{ display: 'grid', gap: 16 }}>
    {([
      ['Carte ivoire', 'var(--ds-color-surface)'],
      ['Fond de page', 'var(--ds-color-surface-subtle)'],
      ['Panneau ocre', 'var(--ds-color-brand-100)'],
    ] as const).map(([label, background]) => <section key={label} style={{ padding: 20, borderRadius: 'var(--ds-radius-md)', border: '1px solid var(--ds-color-border)', background }}>
      <p style={{ margin: '0 0 12px', color: 'var(--ds-color-text)' }}>{label}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Button>Ajouter un critère</Button>
        <Button variant="secondary">Répartir également</Button>
        <Button variant="danger">Supprimer</Button>
        <Button variant="secondary" disabled>Action indisponible</Button>
      </div>
    </section>)}
  </div>,
};

/** Convention partagée : les boutons indépendants respirent, y compris à côté d'un lien. */
export const GroupesDActions: Story = {
  render: () => <section style={{ maxWidth: 440, background: 'var(--ds-color-brand-100)', padding: 'var(--ds-space-4)' }}>
    <p>Actions et modes sur un fond ocre</p>
    <div className="ds-action-group" role="group" aria-label="Affichage">
      <Button variant="secondary" aria-pressed="true">Côte à côte</Button>
      <Button variant="secondary" aria-pressed="false">Superposer</Button>
    </div>
    <div className="ds-action-group" style={{ marginTop: 'var(--ds-space-4)' }}>
      <Button variant="secondary">Choisir la recommandation</Button>
      <a href="#batteries">Examiner les batteries</a>
    </div>
  </section>,
};
