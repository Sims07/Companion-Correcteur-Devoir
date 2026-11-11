// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NotificationCenter } from '../src/ui/components/NotificationCenter.tsx';
import { pushAppNotification } from '../src/domain/appNotifications.ts';

describe('global notification center', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    localStorage.clear();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });
  it('updates the unread badge and navigates when an event is selected', async () => {
    const onNavigate = vi.fn();
    await act(async () => root.render(React.createElement(NotificationCenter, { onNavigate })));
    await act(async () => { pushAppNotification({ title: 'Test terminé', message: 'Graphe de relations', kind: 'success', target: 'evaluation', journey: 'diagrams', targetId: 'evaluation-diagram-graph-results' }); });
    const trigger = host.querySelector<HTMLButtonElement>('.notification-trigger')!;
    expect(trigger.getAttribute('aria-label')).toContain('1 non lues');
    await act(async () => trigger.click());
    expect(host.textContent).toContain('Graphe de relations');
    await act(async () => host.querySelector<HTMLButtonElement>('.notification-entry')!.click());
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ targetId: 'evaluation-diagram-graph-results' }));
    expect(trigger.getAttribute('aria-label')).toBe('Notifications');
  });
});
