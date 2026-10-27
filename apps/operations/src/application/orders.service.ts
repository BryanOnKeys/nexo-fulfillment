import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { invariant } from '../../../../packages/platform/src/errors.js';
import { digest } from '../../../../packages/platform/src/security.js';
import type { OrderEvent, OrderStatus } from '../../../../packages/contracts/src/events.js';
import { Money, OrderAggregate, Stock } from '../domain/order.js';
import {
  ORDER_STORE,
  snapshot,
  type OrderStore,
  type StoredOrder,
  type StoredItem,
} from './order-store.js';
import type { ActorContext, CreateOrder } from './commands.js';

@Injectable()
export class OrdersService {
  constructor(@Inject(ORDER_STORE) private readonly store: OrderStore) {}
  async create(input: CreateOrder, key: string, context: ActorContext) {
    const { actor, correlationId } = context;
    invariant(
      actor.role !== 'WAREHOUSE',
      'FORBIDDEN',
      'No tienes permiso para crear pedidos.',
      403,
    );
    invariant(
      actor.role !== 'CUSTOMER' || actor.customerId === input.customerId,
      'FORBIDDEN',
      'Solo puedes crear pedidos para tu cuenta.',
      403,
    );
    const quantities = new Map<string, number>();
    for (const item of input.items)
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    invariant(
      [...quantities.values()].every((q) => q <= 10_000),
      'INVALID_QUANTITY',
      'La cantidad acumulada supera el límite.',
      422,
    );
    const itemsInput = [...quantities]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([productId, quantity]) => ({ productId, quantity }));
    const requestHash = digest(JSON.stringify({ ...input, items: itemsInput }));
    return this.store.transaction(async (tx) => {
      const prior = await tx.lockRequest(actor.sub, key);
      if (prior) {
        invariant(
          prior.requestHash === requestHash,
          'IDEMPOTENCY_CONFLICT',
          'Esta clave ya se utilizó con otros datos.',
        );
        const order = await tx.order(prior.orderId);
        invariant(order, 'ORDER_NOT_FOUND', 'Pedido no encontrado.', 404);
        return snapshot(order, await tx.items(order.id));
      }
      const customer = await tx.customer(input.customerId);
      invariant(customer, 'CUSTOMER_NOT_FOUND', 'Cliente no encontrado.', 404);
      const products = await tx.products(itemsInput.map((i) => i.productId));
      invariant(
        products.length === itemsInput.length,
        'PRODUCT_NOT_FOUND',
        'Uno o más productos no existen.',
        404,
      );
      const now = new Date();
      const orderId = randomUUID();
      let total = Money.of(0);
      const items: StoredItem[] = [];
      for (const item of itemsInput) {
        const product = products.find((p) => p.id === item.productId)!;
        invariant(product.active, 'PRODUCT_INACTIVE', `El producto ${product.sku} está inactivo.`);
        const stock = new Stock(product.stock, product.reserved).reserve(item.quantity);
        product.reserved = stock.reserved;
        product.updatedAt = now;
        tx.saveProduct(product);
        total = total.add(Money.of(product.priceCents).times(item.quantity));
        items.push({
          id: randomUUID(),
          orderId,
          productId: product.id,
          sku: product.sku,
          name: product.name,
          quantity: item.quantity,
          unitPriceCents: product.priceCents,
        });
      }
      const number = `NX-${now.getUTCFullYear()}-${await tx.nextNumber()}`;
      const order: StoredOrder = {
        id: orderId,
        number,
        customerId: customer.id,
        customerName: customer.name,
        deliveryAddress: input.deliveryAddress,
        status: 'CONFIRMED',
        totalCents: total.cents,
        currency: 'PEN',
        version: 1,
        notes: input.notes,
        createdBy: actor.sub,
        createdAt: now,
        updatedAt: now,
      };
      await tx.insertOrder(order, items);
      for (const item of items)
        tx.movement(item.productId, order.id, 'RESERVE', item.quantity, actor.sub);
      tx.history(order.id, 'CONFIRMED', 'Pedido registrado y existencias reservadas.', actor);
      tx.audit('ORDER_CREATED', order.id, actor, correlationId);
      const view = snapshot(order, items);
      tx.event({
        id: randomUUID(),
        schemaVersion: 1,
        type: 'OrderConfirmed',
        occurredAt: now.toISOString(),
        correlationId,
        data: view,
      });
      tx.remember(actor.sub, key, requestHash, order.id);
      return view;
    });
  }
  async transition(
    id: string,
    input: { status: OrderStatus; expectedVersion: number; note: string },
    context: ActorContext,
  ) {
    const { actor, correlationId } = context;
    const allowed = input.status === 'CANCELLED' ? ['ADMIN', 'SALES'] : ['ADMIN', 'WAREHOUSE'];
    invariant(
      allowed.includes(actor.role),
      'FORBIDDEN',
      'No tienes permiso para este cambio de estado.',
      403,
    );
    return this.store.transaction(async (tx) => {
      const order = await tx.order(id, true);
      invariant(order, 'ORDER_NOT_FOUND', 'Pedido no encontrado.', 404);
      const next = new OrderAggregate(order.status, order.version).transition(
        input.status,
        input.expectedVersion,
      );
      const items = await tx.items(id);
      if (next.inventoryEffect !== 'NONE') {
        const products = await tx.products(items.map((i) => i.productId));
        for (const item of items) {
          const product = products.find((p) => p.id === item.productId)!;
          const current = new Stock(product.stock, product.reserved);
          const stock =
            next.inventoryEffect === 'RELEASE'
              ? current.release(item.quantity)
              : current.dispatch(item.quantity);
          product.stock = stock.onHand;
          product.reserved = stock.reserved;
          product.updatedAt = new Date();
          tx.saveProduct(product);
          tx.movement(product.id, id, next.inventoryEffect, item.quantity, actor.sub);
        }
      }
      order.status = next.status;
      order.version = next.version;
      order.updatedAt = new Date();
      tx.saveOrder(order);
      tx.history(id, order.status, input.note, actor);
      tx.audit(`ORDER_${order.status}`, id, actor, correlationId);
      const eventTypes: Record<OrderStatus, OrderEvent['type']> = {
        CONFIRMED: 'OrderConfirmed',
        PREPARING: 'OrderPreparing',
        DISPATCHED: 'OrderDispatched',
        DELIVERED: 'OrderDelivered',
        CANCELLED: 'OrderCancelled',
      };
      const view = snapshot(order, items);
      tx.event({
        id: randomUUID(),
        schemaVersion: 1,
        type: eventTypes[order.status],
        occurredAt: order.updatedAt.toISOString(),
        correlationId,
        data: view,
      });
      return view;
    });
  }
  list(input: Parameters<OrderStore['list']>[0], context: ActorContext) {
    return this.store.list({
      ...input,
      ...(context.actor.role === 'CUSTOMER' ? { customerId: context.actor.customerId! } : {}),
    });
  }
  async detail(id: string, context: ActorContext) {
    const order = await this.store.detail(
      id,
      context.actor.role === 'CUSTOMER' ? context.actor.customerId! : undefined,
    );
    invariant(order, 'ORDER_NOT_FOUND', 'Pedido no encontrado.', 404);
    return order;
  }
}
