/**
 * In-app toast-style notification list.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNotificationStore, NotificationItem } from '../../stores/notificationStore';
import { CloseIcon } from '../Icons/CloseIcon';
import './Notification.scss';

interface NotificationItemProps {
  item: NotificationItem;
  onClose: (id: string) => void;
}

const NotificationItemComponent: React.FC<NotificationItemProps> = ({ item, onClose }) => {
  const { t } = useTranslation();

  return (
    <div className={`notification-item notification-${item.type}`}>
      <span className="notification-message">{item.message}</span>
      <button
        type="button"
        className="notification-close"
        onClick={() => onClose(item.id)}
        title={String(t('notification.close', { defaultValue: 'Close' }))}
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
};

export const NotificationContainer: React.FC = () => {
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const visibleNotifications = notifications.slice(0, 3);

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="notification-container">
      {visibleNotifications.map((item) => (
        <NotificationItemComponent
          key={item.id}
          item={item}
          onClose={removeNotification}
        />
      ))}
    </div>
  );
};

export default NotificationContainer;
