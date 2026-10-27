import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../../../packages/platform/src/persistence.js';
import { invariant } from '../../../../packages/platform/src/errors.js';
import {
  statusLabels,
  type AccessClaims,
  type IntegrationEvent,
} from '../../../../packages/contracts/src/events.js';
import { NotificationRecord, NotificationReadRecord } from '../infrastructure/entities.js';
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from './notification-publisher.js';
@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(NOTIFICATION_PUBLISHER) private readonly live: NotificationPublisher,
  ) {}
  async consume(event: IntegrationEvent) {
    const notification = await this.db.em.fork().transactional(async (em) => {
      const claimed = await em.execute<{ id: string }[]>(
        'insert into inbox(id) values (?) on conflict do nothing returning id',
        [event.id],
      );
      if (!claimed.length) return null;
      const isDocument = event.type === 'DocumentGenerated';
      const record = Object.assign(new NotificationRecord(), {
        id: event.id,
        customerId: event.data.customerId,
        orderId: isDocument ? event.data.orderId : event.data.id,
        orderNumber: isDocument ? event.data.orderNumber : event.data.number,
        type: event.type,
        title: isDocument ? 'Documento disponible' : `Pedido ${statusLabels[event.data.status]}`,
        message: isDocument
          ? `El documento de ${event.data.orderNumber} está listo para descargar.`
          : `${event.data.number} · ${statusLabels[event.data.status]}`,
        createdAt: new Date(event.occurredAt),
      });
      em.persist(record);
      return record;
    });
    if (notification) this.live.publish(notification);
  }
  async list(page: number, pageSize: number, actor: AccessClaims) {
    const em = this.db.em.fork();
    const where = actor.role === 'CUSTOMER' ? { customerId: actor.customerId! } : {};
    const [data, total] = await em.findAndCount(NotificationRecord, where, {
      orderBy: { createdAt: 'desc', id: 'desc' },
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const reads = data.length
      ? await em.find(NotificationReadRecord, {
          userId: actor.sub,
          notificationId: { $in: data.map((n) => n.id) },
        })
      : [];
    const readIds = new Set(reads.map((r) => r.notificationId));
    const params = actor.role === 'CUSTOMER' ? [actor.sub, actor.customerId] : [actor.sub];
    const [count] = await em.execute<{ count: string }[]>(
      `select count(*) as count from notifications n where not exists(select 1 from notification_reads r where r.notification_id=n.id and r.user_id=?)${actor.role === 'CUSTOMER' ? ' and n.customer_id=?' : ''}`,
      params,
    );
    return {
      data: data.map((n) => ({ ...n, read: readIds.has(n.id) })),
      total,
      unreadCount: Number(count?.count ?? 0),
      page,
      pageSize,
    };
  }
  async markRead(id: string, actor: AccessClaims) {
    const em = this.db.em.fork();
    const record = await em.findOne(NotificationRecord, {
      id,
      ...(actor.role === 'CUSTOMER' ? { customerId: actor.customerId! } : {}),
    });
    invariant(record, 'NOTIFICATION_NOT_FOUND', 'Notificación no encontrada.', 404);
    await em.execute(
      'insert into notification_reads(id,notification_id,user_id) values (?,?,?) on conflict do nothing',
      [`${id}:${actor.sub}`, id, actor.sub],
    );
    return { read: true };
  }
  async markAllRead(actor: AccessClaims) {
    await this.db.em
      .fork()
      .execute(
        `insert into notification_reads(id,notification_id,user_id) select id::text || ':' || ?,id,?::uuid from notifications${actor.role === 'CUSTOMER' ? ' where customer_id=?' : ''} on conflict do nothing`,
        actor.role === 'CUSTOMER'
          ? [actor.sub, actor.sub, actor.customerId]
          : [actor.sub, actor.sub],
      );
    return { read: true };
  }
}
