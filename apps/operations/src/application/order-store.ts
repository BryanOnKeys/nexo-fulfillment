import type { OrderSnapshot, OrderStatus } from '../../../../packages/contracts/src/events.js';
import type { OrderEvent } from '../../../../packages/contracts/src/events.js';
export const ORDER_STORE = Symbol('ORDER_STORE');
export interface ProductState {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
  reserved: number;
  active: boolean;
  updatedAt: Date;
}
export interface StoredOrder {
  id: string;
  number: string;
  customerId: string;
  customerName: string;
  deliveryAddress: string;
  status: OrderStatus;
  totalCents: number;
  currency: 'PEN';
  version: number;
  notes: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface StoredItem {
  id: string;
  orderId: string;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}
export interface OrderView extends OrderSnapshot {
  notes: string;
  createdAt: Date;
  updatedAt: Date;
  history?: { id: string; status: OrderStatus; note: string; actorName: string; createdAt: Date }[];
}
export interface OrderTransaction {
  nextNumber(): Promise<string>;
  lockRequest(
    actorId: string,
    key: string,
  ): Promise<{ requestHash: string; orderId: string } | null>;
  customer(id: string): Promise<{ id: string; name: string } | null>;
  products(ids: string[]): Promise<ProductState[]>;
  order(id: string, lock?: boolean): Promise<StoredOrder | null>;
  items(id: string): Promise<StoredItem[]>;
  saveProduct(product: ProductState): void;
  insertOrder(order: StoredOrder, items: StoredItem[]): Promise<void>;
  saveOrder(order: StoredOrder): void;
  history(
    orderId: string,
    status: OrderStatus,
    note: string,
    actor: { sub: string; name: string },
  ): void;
  movement(
    productId: string,
    orderId: string,
    kind: string,
    quantity: number,
    actorId: string,
  ): void;
  audit(
    action: string,
    id: string,
    actor: { sub: string; name: string },
    correlationId: string,
  ): void;
  event(event: OrderEvent): void;
  remember(actorId: string, key: string, requestHash: string, orderId: string): void;
}
export interface OrderStore {
  transaction<T>(work: (tx: OrderTransaction) => Promise<T>): Promise<T>;
  list(input: {
    page: number;
    pageSize: number;
    search: string;
    status?: OrderStatus;
    customerId?: string;
  }): Promise<{ data: OrderView[]; total: number; page: number; pageSize: number }>;
  detail(id: string, customerId?: string): Promise<OrderView | null>;
}
export function snapshot(order: StoredOrder, items: StoredItem[]): OrderView {
  return {
    id: order.id,
    number: order.number,
    customerId: order.customerId,
    customerName: order.customerName,
    deliveryAddress: order.deliveryAddress,
    status: order.status,
    totalCents: order.totalCents,
    currency: order.currency,
    version: order.version,
    items: items.map(({ productId, sku, name, quantity, unitPriceCents }) => ({
      productId,
      sku,
      name,
      quantity,
      unitPriceCents,
    })),
    notes: order.notes,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
