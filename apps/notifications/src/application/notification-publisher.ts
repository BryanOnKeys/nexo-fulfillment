export const NOTIFICATION_PUBLISHER = Symbol('NOTIFICATION_PUBLISHER');
export interface NotificationMessage {
  id: string;
  customerId: string;
  orderId: string;
  orderNumber: string;
  type: string;
  title: string;
  message: string;
  createdAt: Date;
}
export interface NotificationPublisher {
  publish(notification: NotificationMessage): void;
}
