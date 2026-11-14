// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ZoomableImage } from '../../src/ui/components/ZoomableImage.tsx';

afterEach(() => { document.body.replaceChildren(); });

describe('ZoomableImage', () => {
  it('opens a modal with the original image source, zoom, rotation and closes without changing the thumbnail', async () => {
    HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    HTMLDialogElement.prototype.close = function () { this.open = false; };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<ZoomableImage src="data:image/png;base64,QUJD" alt="Schéma E" />));
      expect(host.querySelectorAll('img')).toHaveLength(1);
      await act(async () => host.querySelector('button')!.click());
      expect(host.querySelector('[aria-label="Visualiseur : Schéma E"]')).not.toBeNull();
      expect(host.querySelectorAll('img')).toHaveLength(2);
      expect([...host.querySelectorAll('img')].every((img) => img.src === 'data:image/png;base64,QUJD')).toBe(true);
      await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Zoomer"]')!.click());
      await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Tourner à droite de 90 degrés"]')!.click());
      expect(host.querySelector<HTMLImageElement>('.zoomable-image-stage img')?.style.transform).toContain('rotate(90deg) scale(1.25)');
      await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Fermer le visualiseur"]')!.click());
      expect(host.querySelectorAll('img')).toHaveLength(1);
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
});
