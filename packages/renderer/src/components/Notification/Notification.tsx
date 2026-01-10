/**
 * 自定义消息提示框组件
 * 功能：在右下角显示消息通知，支持成功、错误、警告、信息四种状态
 * 状态通过左侧边框颜色区分，需要用户手动关闭
 * 最多同时显示3个，超出的隐藏，关闭后自动显示隐藏的
 */

import React from 'react';
import { useNotificationStore, NotificationItem } from '../../stores/notificationStore';
import { CloseIcon } from '../Icons/CloseIcon';
import './Notification.scss';

interface NotificationItemProps {
  item: NotificationItem;
  onClose: (id: string) => void;
}

const NotificationItemComponent: React.FC<NotificationItemProps> = ({ item, onClose }) => {
  return (
    <div className={`notification-item notification-${item.type}`}>
      <span className="notification-message">{item.message}</span>
      <span
        className="notification-close"
        onClick={() => onClose(item.id)}
        title="关闭"
      >
        <CloseIcon size={14} />
      </span>
    </div>
  );
};

export const NotificationContainer: React.FC = () => {
  const notifications = useNotificationStore((state) => state.notifications);
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  
  // 只显示前3个通知
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
