/** Small local-only event log. Never persist model prompts, copies or API secrets. */
export type AppNotification = {
  id: string;
  createdAt: string;
  title: string;
  message: string;
  kind: 'success' | 'warning' | 'error';
  target?: 'evaluation' | 'correction' | 'diagnostic';
  journey?: 'custom' | 'diagrams' | 'biology';
  targetId?: string;
  read: boolean;
};

const STORAGE_KEY = 'companion-correcteur:notifications:v1';
export const NOTIFICATIONS_CHANGED = 'companion:notifications-changed';
const LIMIT = 100;

export function readAppNotifications(): AppNotification[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((item): item is AppNotification =>
      !!item && typeof item.id === 'string' && typeof item.createdAt === 'string' &&
      typeof item.title === 'string' && typeof item.message === 'string' &&
      ['success', 'warning', 'error'].includes(item.kind) && typeof item.read === 'boolean'
    ).slice(0, LIMIT);
  } catch { return []; }
}

function save(items: AppNotification[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, LIMIT))); }
  catch { /* Notifications remain optional if private storage is blocked. */ }
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function pushAppNotification(entry: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification {
  const notification: AppNotification = {
    ...entry, id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: new Date().toISOString(), read: false,
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
