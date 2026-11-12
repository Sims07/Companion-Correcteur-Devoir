/** Short-lived local activity log: notifications are not the campaign archive. */
export type AppNotification = {
  id: string;
  createdAt: string;
  title: string;
  message: string;
  kind: 'success' | 'warning' | 'error';
  target?: 'evaluation' | 'correction' | 'diagnostic';
  journey?: 'custom' | 'diagrams' | 'biology';
  targetId?: string;
  campaignId?: string;
  read: boolean;
};

const STORAGE_KEY = 'companion-correcteur:notifications:v1';
export const NOTIFICATIONS_CHANGED = 'companion:notifications-changed';
const LIMIT = 100;
export const NOTIFICATION_RETENTION_DAYS = 30;
const RETENTION_MS = NOTIFICATION_RETENTION_DAYS * 24 * 60 * 60 * 1000;

function isNotification(item: unknown): item is AppNotification {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Partial<AppNotification>;
  return typeof candidate.id === 'string' && typeof candidate.createdAt === 'string' &&
    Number.isFinite(Date.parse(candidate.createdAt)) &&
    typeof candidate.title === 'string' && typeof candidate.message === 'string' &&
    (candidate.kind === 'success' || candidate.kind === 'warning' || candidate.kind === 'error') &&
    typeof candidate.read === 'boolean';
}

/** Purge at every read (startup, reopening the panel and new activity), even without new notifications. */
export function readAppNotifications(): AppNotification[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const cutoff = Date.now() - RETENTION_MS;
    const items = raw.filter((item): item is AppNotification =>
      isNotification(item) && Date.parse(item.createdAt) > cutoff
    ).slice(0, LIMIT);
    if (items.length !== raw.length) {
      // Avoid emitting a recursive change event from inside the reader.
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
      catch { /* Optional history: blocked storage must not break the UI. */ }
    }
    return items;
  } catch { return []; }
}

function save(items: AppNotification[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, LIMIT))); }
  catch { /* Notifications remain optional if private storage is blocked. */ }
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function pushAppNotification(entry: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification {
  const notification: AppNotification = {
    ...entry,
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(36).slice(2),
    createdAt: new Date().toISOString(),
    read: false,
  };
  save([notification, ...readAppNotifications()].slice(0, LIMIT));
  return notification;
}

export function markAppNotificationRead(id: string) {
  save(readAppNotifications().map((item) => item.id === id ? { ...item, read: true } : item));
}

export function markAllAppNotificationsRead() {
  save(readAppNotifications().map((item) => ({ ...item, read: true })));
}

export function removeAppNotification(id: string) {
  save(readAppNotifications().filter((item) => item.id !== id));
}

export function clearReadAppNotifications() {
  save(readAppNotifications().filter((item) => !item.read));
}

export function clearAllAppNotifications() {
  save([]);
}
