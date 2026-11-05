import type { Meta, StoryObj } from '@storybook/react';

const swatches = [
  ['Papier', 'var(--ds-color-surface)'],
  ['Fond de travail', 'var(--ds-color-surface-subtle)'],
  ['Terre cuite', 'var(--ds-color-brand-700)'],
  ['Terre cuite douce', 'var(--ds-color-brand-100)'],
  ['Travail en cours · ardoise', 'var(--ds-color-progress)'],
  ['Attente · gris neutre', 'var(--ds-color-border)'],
  ['Avertissement', 'var(--ds-color-warning-surface)'],
  ['Succès', 'var(--ds-color-success-surface)'],
] as const;

function AtelierPedagogique() {
  return <section style={{ maxWidth: 760, padding: 28, color: 'var(--ds-color-text)', background: 'var(--ds-color-surface-subtle)', borderRadius: 'var(--ds-radius-lg)' }}>
    <p style={{ fontSize: 12, color: 'var(--ds-color-text-muted)', letterSpacing: '.09em' }}>IDENTITÉ VISUELLE · ATELIER PÉDAGOGIQUE</p>
    <h2 style={{ font: '700 30px var(--ds-font-editorial)', margin: '6px 0 12px' }}>Des corrections plus sereines</h2>
    <p>Une surface de travail chaleureuse, avec une hiérarchie claire et les informations décisives en premier.</p>
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
      {swatches.map(([label, color]) => <div key={label} style={{ border: '1px solid var(--ds-color-border)', borderRadius: 'var(--ds-radius-md)', overflow: 'hidden', background: 'var(--ds-color-surface)' }}>
        <div style={{ height: 72, background: color }} aria-hidden="true" />
        <div style={{ padding: 12, fontSize: 13 }}>{label}</div>
      </div>)}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 22, alignItems: 'center' }}>
      <button className="ds-button ds-button--primary">Vérifier la copie</button>
      <button className="ds-button ds-button--secondary">Voir le barème</button>
      <span style={{ padding: '7px 11px', background: 'var(--ds-color-warning-surface)', color: 'var(--ds-color-warning)', borderRadius: 6, fontSize: 13 }}>À examiner</span>
    </div>
  </section>;
}
const meta = {
  title: 'Fondations/Atelier pédagogique',
  component: AtelierPedagogique,
  tags: ['autodocs'],
} satisfies Meta<typeof AtelierPedagogique>;
export default meta;
type Story = StoryObj<typeof meta>;
export const PaletteEtActions: Story = {};
