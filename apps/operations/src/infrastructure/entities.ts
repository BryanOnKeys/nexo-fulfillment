import { randomUUID } from 'node:crypto';
import { EntitySchema } from '@mikro-orm/core';
import type { Role, OrderStatus } from '../../../../packages/contracts/src/events.js';

export class CustomerRecord {
  id: string = randomUUID();
  name!: string;
  taxId!: string;
  email!: string;
  phone = '';
  address!: string;
  createdAt = new Date();
}
export class UserRecord {
  id: string = randomUUID();
  name!: string;
  email!: string;
  passwordHash!: string;
  role!: Role;
  customerId: string | null = null;
  active = true;
  createdAt = new Date();
}
export class SessionRecord {
  id: string = randomUUID();
  userId!: string;
  tokenHash!: string;
  expiresAt!: Date;
  revokedAt: Date | null = null;
  createdAt = new Date();
}
export class ProductRecord {
  id: string = randomUUID();
  sku!: string;
  name!: string;
  description = '';
  category = 'General';
  priceCents!: number;
  stock = 0;
  reserved = 0;
  minimumStock = 5;
  active = true;
  createdAt = new Date();
  updatedAt = new Date();
}
export class OrderRecord {
  id: string = randomUUID();
  number!: string;
  customerId!: string;
  customerName!: string;
  deliveryAddress!: string;
  status: OrderStatus = 'CONFIRMED';
  totalCents!: number;
  currency = 'PEN' as const;
  version = 1;
  notes = '';
  createdBy!: string;
  createdAt = new Date();
  updatedAt = new Date();
}
export class OrderItemRecord {
  id: string = randomUUID();
  orderId!: string;
  productId!: string;
  sku!: string;
  name!: string;
  quantity!: number;
  unitPriceCents!: number;
}
export class OrderHistoryRecord {
  id: string = randomUUID();
  orderId!: string;
  status!: OrderStatus;
  note = '';
  actorId!: string;
  actorName!: string;
  createdAt = new Date();
}
export class StockMovementRecord {
  id: string = randomUUID();
  productId!: string;
  orderId: string | null = null;
  kind!: string;
  quantity!: number;
  reason!: string;
  actorId!: string;
  createdAt = new Date();
}
export class AuditRecord {
  id: string = randomUUID();
  actorId!: string;
  actorName!: string;
  action!: string;
  resourceId!: string;
  correlationId!: string;
  createdAt = new Date();
}
export class IdempotencyRecord {
  id: string = randomUUID();
  actorId!: string;
  key!: string;
  requestHash!: string;
  orderId!: string;
  createdAt = new Date();
}
const uuid = { type: 'uuid' } as const;
const date = { type: Date, columnType: 'timestamptz' } as const;
const text = { type: 'string' } as const;
const integer = { type: 'integer' } as const;
export const CustomerSchema = new EntitySchema<CustomerRecord>({
  class: CustomerRecord,
  tableName: 'customers',
  properties: {
    id: { ...uuid, primary: true },
    name: text,
    taxId: text,
    email: text,
    phone: text,
    address: text,
    createdAt: date,
  },
});
export const UserSchema = new EntitySchema<UserRecord>({
  class: UserRecord,
  tableName: 'users',
  properties: {
    id: { ...uuid, primary: true },
    name: text,
    email: text,
    passwordHash: text,
    role: text,
    customerId: { ...uuid, nullable: true },
    active: { type: 'boolean' },
    createdAt: date,
  },
});
export const SessionSchema = new EntitySchema<SessionRecord>({
  class: SessionRecord,
  tableName: 'sessions',
  properties: {
    id: { ...uuid, primary: true },
    userId: uuid,
    tokenHash: text,
    expiresAt: date,
    revokedAt: { ...date, nullable: true },
    createdAt: date,
  },
});
export const ProductSchema = new EntitySchema<ProductRecord>({
  class: ProductRecord,
  tableName: 'products',
  properties: {
    id: { ...uuid, primary: true },
    sku: text,
    name: text,
    description: text,
    category: text,
    priceCents: integer,
    stock: integer,
    reserved: integer,
    minimumStock: integer,
    active: { type: 'boolean' },
    createdAt: date,
    updatedAt: date,
  },
});
export const OrderSchema = new EntitySchema<OrderRecord>({
  class: OrderRecord,
  tableName: 'orders',
  properties: {
    id: { ...uuid, primary: true },
    number: text,
    customerId: uuid,
    customerName: text,
    deliveryAddress: text,
    status: text,
    totalCents: integer,
    currency: text,
    version: integer,
    notes: text,
    createdBy: uuid,
    createdAt: date,
    updatedAt: date,
  },
});
export const OrderItemSchema = new EntitySchema<OrderItemRecord>({
  class: OrderItemRecord,
  tableName: 'order_items',
  properties: {
    id: { ...uuid, primary: true },
    orderId: uuid,
    productId: uuid,
    sku: text,
    name: text,
    quantity: integer,
    unitPriceCents: integer,
  },
});
export const OrderHistorySchema = new EntitySchema<OrderHistoryRecord>({
  class: OrderHistoryRecord,
  tableName: 'order_history',
  properties: {
    id: { ...uuid, primary: true },
    orderId: uuid,
    status: text,
    note: text,
    actorId: uuid,
    actorName: text,
    createdAt: date,
  },
});
export const StockMovementSchema = new EntitySchema<StockMovementRecord>({
  class: StockMovementRecord,
  tableName: 'stock_movements',
  properties: {
    id: { ...uuid, primary: true },
    productId: uuid,
    orderId: { ...uuid, nullable: true },
    kind: text,
    quantity: integer,
    reason: text,
    actorId: uuid,
    createdAt: date,
  },
});
export const AuditSchema = new EntitySchema<AuditRecord>({
  class: AuditRecord,
  tableName: 'audit_log',
  properties: {
    id: { ...uuid, primary: true },
    actorId: uuid,
    actorName: text,
    action: text,
    resourceId: uuid,
    correlationId: uuid,
    createdAt: date,
  },
});
export const IdempotencySchema = new EntitySchema<IdempotencyRecord>({
  class: IdempotencyRecord,
  tableName: 'idempotency_keys',
  properties: {
    id: { ...uuid, primary: true },
    actorId: uuid,
    key: text,
    requestHash: text,
    orderId: uuid,
    createdAt: date,
  },
});
export const operationEntities = [
  CustomerSchema,
  UserSchema,
  SessionSchema,
  ProductSchema,
  OrderSchema,
  OrderItemSchema,
  OrderHistorySchema,
  StockMovementSchema,
  AuditSchema,
  IdempotencySchema,
];
