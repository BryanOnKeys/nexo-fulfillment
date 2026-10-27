import { Inject, Injectable } from '@nestjs/common';
import { LockMode, type FilterQuery } from '@mikro-orm/core';
import { DATABASE, type Database } from '../../../../packages/platform/src/persistence.js';
import { invariant } from '../../../../packages/platform/src/errors.js';
import { hashPassword } from '../../../../packages/platform/src/security.js';
import { Stock } from '../domain/order.js';
import {
  ProductRecord,
  CustomerRecord,
  UserRecord,
  AuditRecord,
  StockMovementRecord,
} from '../infrastructure/entities.js';
import { publicUser } from './identity.service.js';
import type { ActorContext } from './commands.js';
import type { z } from 'zod';
import type { productSchema, customerSchema, userSchema } from './commands.js';

type Page = { page: number; pageSize: number; search: string };
@Injectable()
export class CatalogService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async products(input: Page) {
    const where: FilterQuery<ProductRecord> = input.search
      ? {
          $or: [
            { name: { $ilike: `%${input.search}%` } },
            { sku: { $ilike: `%${input.search}%` } },
            { category: { $ilike: `%${input.search}%` } },
          ],
        }
      : {};
    const [data, total] = await this.db.em.fork().findAndCount(ProductRecord, where, {
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
      orderBy: { name: 'asc', id: 'asc' },
    });
    return {
      data: data.map((p) => ({ ...p, available: p.stock - p.reserved })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  }
  async saveProduct(input: z.infer<typeof productSchema>, context: ActorContext, id?: string) {
    return this.db.em.fork().transactional(async (em) => {
      const product = id
        ? await em.findOne(ProductRecord, { id }, { lockMode: LockMode.PESSIMISTIC_WRITE })
        : new ProductRecord();
      invariant(product, 'PRODUCT_NOT_FOUND', 'Producto no encontrado.', 404);
      Object.assign(product, input, { updatedAt: new Date() });
      em.persist(product);
      this.audit(em, 'PRODUCT_SAVED', product.id, context);
      await em.flush();
      return { ...product, available: product.stock - product.reserved };
    });
  }
  async adjust(id: string, delta: number, reason: string, context: ActorContext) {
    return this.db.em.fork().transactional(async (em) => {
      const product = await em.findOne(
        ProductRecord,
        { id },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      invariant(product, 'PRODUCT_NOT_FOUND', 'Producto no encontrado.', 404);
      const next = new Stock(product.stock, product.reserved).adjust(delta);
      product.stock = next.onHand;
      product.updatedAt = new Date();
      em.persist(
        Object.assign(new StockMovementRecord(), {
          productId: id,
          kind: 'ADJUST',
          quantity: delta,
          reason,
          actorId: context.actor.sub,
        }),
      );
      this.audit(em, 'STOCK_ADJUSTED', id, context);
      return { ...product, available: next.available };
    });
  }
  async movements(productId: string) {
    return this.db.em
      .fork()
      .find(StockMovementRecord, { productId }, { orderBy: { createdAt: 'desc' }, limit: 100 });
  }
  async customers(input: Page, context: ActorContext) {
    const where: FilterQuery<CustomerRecord> =
      context.actor.role === 'CUSTOMER'
        ? { id: context.actor.customerId! }
        : input.search
          ? {
              $or: [
                { name: { $ilike: `%${input.search}%` } },
                { taxId: { $ilike: `%${input.search}%` } },
              ],
            }
          : {};
    const [data, total] = await this.db.em.fork().findAndCount(CustomerRecord, where, {
      limit: input.pageSize,
      offset: (input.page - 1) * input.pageSize,
      orderBy: { name: 'asc' },
    });
    return { data, total, page: input.page, pageSize: input.pageSize };
  }
  async saveCustomer(input: z.infer<typeof customerSchema>, context: ActorContext, id?: string) {
    return this.db.em.fork().transactional(async (em) => {
      const customer = id ? await em.findOne(CustomerRecord, { id }) : new CustomerRecord();
      invariant(customer, 'CUSTOMER_NOT_FOUND', 'Cliente no encontrado.', 404);
      Object.assign(customer, input);
      em.persist(customer);
      this.audit(em, 'CUSTOMER_SAVED', customer.id, context);
      return customer;
    });
  }
  async users() {
    return (
      await this.db.em.fork().find(UserRecord, {}, { orderBy: { createdAt: 'desc' }, limit: 100 })
    ).map(publicUser);
  }
  async createUser(input: z.infer<typeof userSchema>, context: ActorContext) {
    const em = this.db.em.fork();
    if (input.customerId)
      invariant(
        await em.findOne(CustomerRecord, { id: input.customerId }),
        'CUSTOMER_NOT_FOUND',
        'Cliente no encontrado.',
        404,
      );
    const { password, ...fields } = input;
    const passwordHash = await hashPassword(password);
    return em.transactional(async (tx) => {
      const user = Object.assign(new UserRecord(), fields, {
        email: input.email.toLowerCase(),
        passwordHash,
      });
      tx.persist(user);
      this.audit(tx, 'USER_CREATED', user.id, context);
      return publicUser(user);
    });
  }
  async auditLog(page: number) {
    const [data, total] = await this.db.em
      .fork()
      .findAndCount(
        AuditRecord,
        {},
        { orderBy: { createdAt: 'desc' }, limit: 50, offset: (page - 1) * 50 },
      );
    return { data, total, page, pageSize: 50 };
  }
  async dashboard(context: ActorContext) {
    const em = this.db.em.fork();
    const customerId = context.actor.role === 'CUSTOMER' ? context.actor.customerId : null;
    const filter = customerId ? 'where customer_id = ?' : '';
    const params = customerId ? [customerId] : [];
    const [summary] = await em.execute<
      { total: string; active: string; delivered: string; booked_cents: string }[]
    >(
      `select count(*) as total,count(*) filter(where status in ('CONFIRMED','PREPARING','DISPATCHED')) as active,count(*) filter(where status='DELIVERED') as delivered,coalesce(sum(total_cents) filter(where status<>'CANCELLED'),0) as booked_cents from orders ${filter}`,
      params,
    );
    const status = await em.execute<{ status: string; count: string }[]>(
      `select status,count(*) as count from orders ${filter} group by status`,
      params,
    );
    const trend = await em.execute<{ day: string; count: string; total_cents: string }[]>(
      `select to_char(created_at at time zone 'America/Lima','YYYY-MM-DD') as day,count(*) as count,coalesce(sum(total_cents) filter(where status<>'CANCELLED'),0) as total_cents from orders ${filter}${filter ? ' and' : ' where'} created_at >= now()-interval '7 days' group by day order by day`,
      params,
    );
    const lowStock =
      context.actor.role === 'CUSTOMER'
        ? []
        : await em.execute<
            { id: string; sku: string; name: string; available: number; minimumStock: number }[]
          >(
            'select id,sku,name,stock-reserved as available,minimum_stock as "minimumStock" from products where active=true and stock-reserved<=minimum_stock order by (stock-reserved),id limit 20',
          );
    return {
      totalOrders: Number(summary?.total ?? 0),
      activeOrders: Number(summary?.active ?? 0),
      deliveredOrders: Number(summary?.delivered ?? 0),
      bookedCents: Number(summary?.booked_cents ?? 0),
      status: status.map((s) => ({ status: s.status, count: Number(s.count) })),
      trend: trend.map((t) => ({
        day: t.day,
        count: Number(t.count),
        totalCents: Number(t.total_cents),
      })),
      lowStock: lowStock,
    };
  }
  private audit(
    em: import('@mikro-orm/postgresql').EntityManager,
    action: string,
    resourceId: string,
    context: ActorContext,
  ) {
    em.persist(
      Object.assign(new AuditRecord(), {
        action,
        resourceId,
        actorId: context.actor.sub,
        actorName: context.actor.name,
        correlationId: context.correlationId,
      }),
    );
  }
}
