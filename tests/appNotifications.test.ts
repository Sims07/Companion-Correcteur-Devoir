// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTIFICATIONS_CHANGED, markAllAppNotificationsRead, markAppNotificationRead,
  pushAppNotification, readAppNotifications,
} from '../src/domain/appNotifications.ts';

describe('local notifications', () => {
  beforeEach(() => localStorage.clear());

  it('persists completed work without storing prompts, with an unread counter', () => {
    const notify = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED, notify);
    const item = pushAppNotification({ title: 'Test terminé', message: '3 passages', kind: 'success', target: 'evaluation', journey: 'diagrams' });
    expect(readAppNotifications()).toMatchObject([{ id: item.id, title: 'Test terminé', read: false }]);
    markAppNotificationRead(item.id);
    expect(readAppNotifications()[0]?.read).toBe(true);
    expect(notify).toHaveBeenCalledTimes(2);
    window.removeEventListener(NOTIFICATIONS_CHANGED, notify);
  });

  it('marks all as read and limits history to 100 entries', () => {
    for (let i = 0; i < 103; i++) pushAppNotification({ title: 'Essai ' + i, message: 'Fini', kind: 'success' });
    expect(readAppNotifications()).toHaveLength(100);
    expect(readAppNotifications()[0]?.title).toBe('Essai 102');
    markAllAppNotificationsRead();
    expect(readAppNotifications().every((item) => item.read)).toBe(true);
  });

  it('recovers from invalid local storage data', () => {
    localStorage.setItem('companion-correcteur:notifications:v1', '{');
    expect(readAppNotifications()).toEqual([]);
  });
});
