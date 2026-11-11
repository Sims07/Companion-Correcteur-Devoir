// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NotificationCenter } from '../src/ui/components/NotificationCenter.tsx';
import { pushAppNotification, readAppNotifications } from '../src/domain/appNotifications.ts';

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
    vi.useRealTimers();
  });
  it('keeps the empty notification bell neutral, monochrome and without a badge', async () => {
    await act(async () => root.render(React.createElement(NotificationCenter, { onNavigate: vi.fn() })));
    const trigger = host.querySelector<HTMLButtonElement>('.notification-trigger')!;
    const icon = trigger.querySelector('svg.notification-bell');
    expect(trigger.getAttribute('aria-label')).toBe('Notifications');
    expect(icon?.getAttribute('stroke')).toBe('currentColor');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(trigger.querySelector('.notification-count')).toBeNull();
    expect(trigger.textContent).not.toContain('🔔');
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
  it('can delete one notification without navigating or reading the others', async () => {
    const onNavigate = vi.fn();
    const first = pushAppNotification({ title: 'Premier', message: 'A', kind: 'success' });
    const second = pushAppNotification({ title: 'Second', message: 'B', kind: 'error' });
    await act(async () => root.render(React.createElement(NotificationCenter, { onNavigate })));
    await act(async () => host.querySelector<HTMLButtonElement>('.notification-trigger')!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="Supprimer la notification : Premier"]')!.click());
    expect(readAppNotifications()).toMatchObject([{ id: second.id, read: false }]);
    expect(readAppNotifications().some((item) => item.id === first.id)).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(host.querySelector('.notification-popover')).not.toBeNull();
  });
  it('shows bulk actions only when useful and keeps unread entries when clearing read ones', async () => {
    const first = pushAppNotification({ title: 'Ancien', message: 'A', kind: 'success' });
    const second = pushAppNotification({ title: 'Nouveau', message: 'B', kind: 'warning' });
    await act(async () => root.render(React.createElement(NotificationCenter, { onNavigate: vi.fn() })));
    await act(async () => host.querySelector<HTMLButtonElement>('.notification-trigger')!.click());
    expect(host.textContent).not.toContain('Effacer les lues');
    await act(async () => host.querySelector<HTMLButtonElement>('.notification-actions button')!.click());
    expect(readAppNotifications().every((item) => item.read)).toBe(true);
    // Create a new unread event so the selective purge can be checked.
    await act(async () => { pushAppNotification({ title: 'Troisième', message: 'C', kind: 'error' }); });
    await act(async () => Array.from(host.querySelectorAll<HTMLButtonElement>('.notification-actions button')).find((button) => button.textContent === 'Effacer les lues')!.click());
    expect(readAppNotifications()).toMatchObject([{ title: 'Troisième', read: false }]);
    expect(readAppNotifications().some((item) => item.id === first.id || item.id === second.id)).toBe(false);
    await act(async () => Array.from(host.querySelectorAll<HTMLButtonElement>('.notification-actions button')).find((button) => button.textContent === 'Tout effacer')!.click());
    expect(host.textContent).toContain('Aucune notification');
    expect(host.querySelector('.notification-actions')).toBeNull();
  });
});
