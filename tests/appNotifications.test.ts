// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOTIFICATIONS_CHANGED, NOTIFICATION_RETENTION_DAYS,
  clearAllAppNotifications, clearReadAppNotifications, markAllAppNotificationsRead,
  markAppNotificationRead, pushAppNotification, readAppNotifications, removeAppNotification,
} from '../src/domain/appNotifications.ts';

describe('local notifications', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it('persists completed work and emits changes when read', () => {
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

  it('removes just one notification without changing other read states', () => {
    const first = pushAppNotification({ title: 'A', message: 'A', kind: 'success' });
    const second = pushAppNotification({ title: 'B', message: 'B', kind: 'error' });
    markAppNotificationRead(first.id);
    const changed = vi.fn();
    window.addEventListener(NOTIFICATIONS_CHANGED, changed);
    removeAppNotification(first.id);
    expect(readAppNotifications()).toMatchObject([{ id: second.id, read: false }]);
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener(NOTIFICATIONS_CHANGED, changed);
  });

  it('clears only read entries, then can clear the entire history', () => {
    const first = pushAppNotification({ title: 'A', message: 'A', kind: 'success' });
    const second = pushAppNotification({ title: 'B', message: 'B', kind: 'warning' });
    markAppNotificationRead(first.id);
    clearReadAppNotifications();
    expect(readAppNotifications()).toMatchObject([{ id: second.id, read: false }]);
    clearAllAppNotifications();
    expect(readAppNotifications()).toEqual([]);
    expect(JSON.parse(localStorage.getItem('companion-correcteur:notifications:v1')!)).toEqual([]);
  });

  it('purges entries older than 30 days even without receiving a new event', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-11T12:00:00.000Z'));
    const old = new Date(Date.now() - (NOTIFICATION_RETENTION_DAYS + 1) * 86_400_000).toISOString();
    const recent = new Date(Date.now() - (NOTIFICATION_RETENTION_DAYS - 1) * 86_400_000).toISOString();
    const sample = (id: string, createdAt: string, read: boolean) => ({ id, createdAt, title: id, message: id, kind: 'success', read });
    localStorage.setItem('companion-correcteur:notifications:v1', JSON.stringify([
      sample('expired-unread', old, false), sample('expired-read', old, true),
      sample('recent-unread', recent, false), sample('recent-read', recent, true),
      sample('bad-date', 'nonsense', false),
    ]));
    expect(readAppNotifications().map(({ id }) => id)).toEqual(['recent-unread', 'recent-read']);
    expect(JSON.parse(localStorage.getItem('companion-correcteur:notifications:v1')!)).toHaveLength(2);
  });

  it('recovers from invalid local storage data', () => {
    localStorage.setItem('companion-correcteur:notifications:v1', '{');
    expect(readAppNotifications()).toEqual([]);
  });
});
