import { useEffect, useRef, useState } from 'react';
import {
  NOTIFICATIONS_CHANGED, clearAllAppNotifications, clearReadAppNotifications,
  markAllAppNotificationsRead, markAppNotificationRead, removeAppNotification,
  readAppNotifications, type AppNotification,
} from '../../domain/appNotifications.ts';
import './NotificationCenter.css';

export function NotificationCenter({ onNavigate }: { onNavigate: (item: AppNotification) => void }) {
  const [items, setItems] = useState(readAppNotifications);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const unread = items.filter((item) => !item.read).length;
  const hasRead = items.some((item) => item.read);

  useEffect(() => {
    const refresh = () => setItems(readAppNotifications());
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onOutsideClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onOutsideClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return <div className="notification-center" ref={rootRef}>
    <button type="button" className="notification-trigger" title="Notifications" aria-label={unread ? 'Notifications, ' + unread + ' non lues' : 'Notifications'} aria-expanded={open} aria-controls="app-notifications-panel" onClick={() => { if (!open) setItems(readAppNotifications()); setOpen((value) => !value); }}>
      <svg className="notification-bell" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
      {unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && <section id="app-notifications-panel" className="notification-popover" aria-label="Historique des notifications">
      <div className="notification-heading">
        <strong>Activité récente</strong>
        {items.length > 0 && <div className="notification-actions">
          {unread > 0 && <button type="button" onClick={markAllAppNotificationsRead}>Tout marquer comme lu</button>}
          {hasRead && <button type="button" onClick={clearReadAppNotifications}>Effacer les lues</button>}
          <button type="button" onClick={clearAllAppNotifications}>Tout effacer</button>
        </div>}
      </div>
      {items.length === 0
        ? <p className="notification-empty">Aucune notification pour le moment. Les tests terminés apparaîtront ici.</p>
        : <ul className="notification-list">{items.map((item) => <li className="notification-row" key={item.id}>
          <button type="button" className={'notification-entry is-' + item.kind + (item.read ? '' : ' is-unread')} onClick={() => { markAppNotificationRead(item.id); setOpen(false); onNavigate(item); }}>
            <span className="notification-entry-heading"><strong>{item.title}</strong>{!item.read && <span className="notification-dot" aria-label="Non lue" />}</span>
            <span>{item.message}</span>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</time>
          </button>
          <button type="button" className="notification-delete" title="Supprimer cette notification" aria-label={'Supprimer la notification : ' + item.title} onClick={() => removeAppNotification(item.id)}>×</button>
        </li>)}</ul>}
    </section>}
  </div>;
}
