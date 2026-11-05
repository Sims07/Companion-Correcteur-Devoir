import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StatusNotice, type StatusTone } from '../../src/ui/design-system/components/StatusNotice.tsx';

describe('StatusNotice', () => {
  const checks: Array<{ tone: StatusTone; role: string; message: string }> = [
    { tone: 'success', role: 'status', message: 'Enregistrement réussi' },
    { tone: 'info', role: 'status', message: 'Profil chargé' },
    { tone: 'warning', role: 'status', message: 'Modèle manquant' },
    { tone: 'error', role: 'alert', message: 'Stockage impossible' },
  ];

  it.each(checks)('exposes the $tone status accessibly', ({ tone, role, message }) => {
    const markup = renderToStaticMarkup(<StatusNotice tone={tone}>{message}</StatusNotice>);
    expect(markup).toContain(`role="${role}"`);
    expect(markup).toContain(`ds-status-notice--${tone}`);
    expect(markup).toContain(message);
    expect(markup).toContain('aria-hidden="true"');
  });
});
