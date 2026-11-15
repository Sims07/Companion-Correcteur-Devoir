import type { Meta, StoryObj } from '@storybook/react';

function FoundationsPage() {
  const colors = [
    ['Brand 700', '--ds-color-brand-700'],
    ['Brand 600', '--ds-color-brand-600'],
    ['Brand 100', '--ds-color-brand-100'],
    ['Text', '--ds-color-text'],
    ['Muted text', '--ds-color-text-muted'],
    ['Surface', '--ds-color-surface'],
    ['Subtle surface', '--ds-color-surface-subtle'],
    ['Border', '--ds-color-border'],
    ['In progress', '--ds-color-progress'],
    ['Progress surface', '--ds-color-progress-surface'],
    ['Danger', '--ds-color-danger'],
    ['Warning', '--ds-color-warning'],
    ['Success', '--ds-color-success'],
  ] as const;
  const spacing = [
    ['1', '--ds-space-1'],
    ['2', '--ds-space-2'],
    ['3', '--ds-space-3'],
    ['4', '--ds-space-4'],
    ['5', '--ds-space-5'],
    ['6', '--ds-space-6'],
    ['8', '--ds-space-8'],
  ] as const;
  const radii = [
    ['Small', '--ds-radius-sm'],
    ['Medium', '--ds-radius-md'],
    ['Large', '--ds-radius-lg'],
    ['Pill', '--ds-radius-pill'],
  ] as const;

  return (
    <main style={{ display: 'grid', gap: 32, maxWidth: 900, color: 'var(--ds-color-text)' }}>
      <section>
        <h2>Couleurs sémantiques</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 12 }}>
          {colors.map(([label, token]) => (
            <div key={token} style={{ overflow: 'hidden', border: '1px solid var(--ds-color-border)', borderRadius: 'var(--ds-radius-md)', background: 'var(--ds-color-surface)' }}>
              <div style={{ height: 58, background: `var(${token})` }} />
              <div style={{ padding: 10, display: 'grid', gap: 3 }}>
                <strong style={{ fontSize: 12 }}>{label}</strong>
                <code style={{ fontSize: 10 }}>{token}</code>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>Échelle d'espacement</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {spacing.map(([label, token]) => (
            <div key={token} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <code style={{ width: 90, fontSize: 12 }}>{token}</code>
              <div style={{ width: `var(${token})`, height: 18, minWidth: 4, borderRadius: 4, background: 'var(--ds-color-brand-600)' }} />
              <span style={{ fontSize: 12 }}>{label}</span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h2>Rayons</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
          {radii.map(([label, token]) => (
            <div key={token} style={{ display: 'grid', justifyItems: 'center', gap: 8 }}>
              <div style={{ width: 76, height: 54, border: '2px solid var(--ds-color-brand-600)', borderRadius: `var(${token})`, background: 'var(--ds-color-brand-100)' }} />
              <span style={{ fontSize: 12 }}>{label}</span>
              <code style={{ fontSize: 10 }}>{token}</code>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

const meta = {
  title: 'Fondations/Design tokens',
  component: FoundationsPage,
  tags: ['autodocs'],
} satisfies Meta<typeof FoundationsPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Reference: Story = {};
