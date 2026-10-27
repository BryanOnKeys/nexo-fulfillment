import { Inject, Injectable } from '@nestjs/common';
import { LockMode, type FilterQuery } from '@mikro-orm/core';
import { DATABASE, outbox, type Database } from '../../../../packages/platform/src/persistence.js';
import type { OrderStore, OrderTransaction, OrderView } from '../application/order-store.js';
import { snapshot } from '../application/order-store.js';
import {
  ProductRecord,
  CustomerRecord,
  OrderRecord,
  OrderItemRecord,
  OrderHistoryRecord,
  StockMovementRecord,
  AuditRecord,
  IdempotencyRecord,
} from './entities.js';
@Injectable()
export class MikroOrderStore implements OrderStore {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async transaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T> {
    return this.db.em.fork().transactional(async (em) => {
      const tx: OrderTransaction = {
        nextNumber: async () => {
          const [row] = await em.execute<{ value: string }[]>(
            "select nextval('order_number_seq') as value",
          );
          return String(row!.value).padStart(6, '0');
        },
        lockRequest: async (actorId, key) => {
          await em.execute('select pg_advisory_xact_lock(hashtextextended(?, 0))', [
            `${actorId}:${key}`,
          ]);
          return em.findOne(IdempotencyRecord, { actorId, key });
        },
        customer: (id) => em.findOne(CustomerRecord, { id }),
        products: (ids) =>
          em.find(
            ProductRecord,
            { id: { $in: ids } },
            { orderBy: { id: 'asc' }, lockMode: LockMode.PESSIMISTIC_WRITE },
          ),
        order: (id, lock) =>
          em.findOne(OrderRecord, { id }, lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {}),
        items: (orderId) => em.find(OrderItemRecord, { orderId }, { orderBy: { sku: 'asc' } }),
        saveProduct: (product) => {
          em.persist(product);
        },
        insertOrder: async (order, items) => {
          em.persist(Object.assign(new OrderRecord(), order));
          await em.flush();
          em.persist(items.map((item) => Object.assign(new OrderItemRecord(), item)));
        },
        saveOrder: (order) => {
          em.persist(order);
        },
        history: (orderId, status, note, actor) => {
          em.persist(
            Object.assign(new OrderHistoryRecord(), {
              orderId,
              status,
              note,
              actorId: actor.sub,
              actorName: actor.name,
            }),
          );
        },
        movement: (productId, orderId, kind, quantity, actorId) => {
          em.persist(
            Object.assign(new StockMovementRecord(), {
              productId,
              orderId,
              kind,
              quantity,
              reason: kind,
              actorId,
            }),
          );
        },
        audit: (action, resourceId, actor, correlationId) => {
          em.persist(
            Object.assign(new AuditRecord(), {
              action,
              resourceId,
              actorId: actor.sub,
              actorName: actor.name,
              correlationId,
            }),
          );
        },
        event: (event) => {
          em.persist(outbox(event));
        },
        remember: (actorId, key, requestHash, orderId) => {
          em.persist(
            Object.assign(new IdempotencyRecord(), { actorId, key, requestHash, orderId }),
          );
        },
      };
      return work(tx);
    });
  }
  async list(input: Parameters<OrderStore['list']>[0]) {
    const em = this.db.em.fork();
    const where: FilterQuery<OrderRecord> = {
      ...(input.customerId ? { customerId: input.customerId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.search
        ? {
            $or: [
              { number: { $ilike: `%${input.search}%` } },
              { customerName: { $ilike: `%${input.search}%` } },
            ],
          }
        : {}),
    };
    const [orders, total] = await em.findAndCount(OrderRecord, where, {
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
      orderBy: { createdAt: 'desc', id: 'desc' },
    });
    const items = orders.length
      ? await em.find(
          OrderItemRecord,
          { orderId: { $in: orders.map((o) => o.id) } },
          { orderBy: { sku: 'asc' } },
        )
      : [];
    return {
      data: orders.map((o) =>
        snapshot(
          o,
          items.filter((i) => i.orderId === o.id),
        ),
      ),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
  async detail(id: string, customerId?: string): Promise<OrderView | null> {
    const em = this.db.em.fork();
    const order = await em.findOne(OrderRecord, { id, ...(customerId ? { customerId } : {}) });
    if (!order) return null;
    const [items, history] = await Promise.all([
      em.find(OrderItemRecord, { orderId: id }, { orderBy: { sku: 'asc' } }),
      em.find(OrderHistoryRecord, { orderId: id }, { orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      ...snapshot(order, items),
      history: history.map(({ id, status, note, actorName, createdAt }) => ({
        id,
        status,
        note,
        actorName,
        createdAt,
      })),
    };
  }
}
