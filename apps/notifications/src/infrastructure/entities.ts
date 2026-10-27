import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
export class NotificationRecord {
  id: string = randomUUID();
  customerId!: string;
  orderId!: string;
  orderNumber!: string;
  type!: string;
  title!: string;
  message!: string;
  createdAt = new Date();
}
export class NotificationReadRecord {
  id!: string;
  notificationId!: string;
  userId!: string;
  createdAt = new Date();
}
export const NotificationSchema = new EntitySchema<NotificationRecord>({
  class: NotificationRecord,
  tableName: 'notifications',
  properties: {
    id: { type: 'uuid', primary: true },
    customerId: { type: 'uuid' },
    orderId: { type: 'uuid' },
    orderNumber: { type: 'string' },
    type: { type: 'string' },
    title: { type: 'string' },
    message: { type: 'string' },
    createdAt: { type: Date, columnType: 'timestamptz' },
  },
});
export const NotificationReadSchema = new EntitySchema<NotificationReadRecord>({
  class: NotificationReadRecord,
  tableName: 'notification_reads',
  properties: {
    id: { type: 'string', primary: true },
    notificationId: { type: 'uuid' },
    userId: { type: 'uuid' },
    createdAt: { type: Date, columnType: 'timestamptz' },
  },
});
