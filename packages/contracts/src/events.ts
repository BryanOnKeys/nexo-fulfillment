import { z } from 'zod';

export const roleSchema = z.enum(['ADMIN', 'SALES', 'WAREHOUSE', 'CUSTOMER']);
export type Role = z.infer<typeof roleSchema>;
export const orderStatusSchema = z.enum([
  'CONFIRMED',
  'PREPARING',
  'DISPATCHED',
  'DELIVERED',
  'CANCELLED',
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export const orderSnapshotSchema = z.object({
  id: z.uuid(),
  number: z.string(),
  customerId: z.uuid(),
  customerName: z.string(),
  deliveryAddress: z.string(),
  status: orderStatusSchema,
  totalCents: z.int().nonnegative(),
  currency: z.literal('PEN'),
  version: z.int().positive(),
  items: z.array(
    z.object({
      productId: z.uuid(),
      sku: z.string(),
      name: z.string(),
      quantity: z.int().positive(),
      unitPriceCents: z.int().positive(),
    }),
  ),
});
export type OrderSnapshot = z.infer<typeof orderSnapshotSchema>;
const envelope = z.object({
  id: z.uuid(),
  schemaVersion: z.literal(1),
  occurredAt: z.iso.datetime(),
  correlationId: z.uuid(),
});
export const orderEventSchema = envelope.extend({
  type: z.enum([
    'OrderConfirmed',
    'OrderPreparing',
    'OrderDispatched',
    'OrderDelivered',
    'OrderCancelled',
  ]),
  data: orderSnapshotSchema,
});
export const documentEventSchema = envelope.extend({
  type: z.literal('DocumentGenerated'),
  data: z.object({
    orderId: z.uuid(),
    orderNumber: z.string(),
    customerId: z.uuid(),
    documentId: z.uuid(),
    kind: z.enum(['CONFIRMATION', 'DISPATCH']),
  }),
});
export const integrationEventSchema = z.union([orderEventSchema, documentEventSchema]);
export type OrderEvent = z.infer<typeof orderEventSchema>;
export type IntegrationEvent = z.infer<typeof integrationEventSchema>;
export const accessClaimsSchema = z.object({
  sub: z.uuid(),
  name: z.string(),
  role: roleSchema,
  customerId: z.uuid().nullable(),
  sessionId: z.uuid(),
  exp: z.number(),
  iss: z.literal('nexo'),
  aud: z.literal('nexo-services'),
});
export type AccessClaims = z.infer<typeof accessClaimsSchema>;
export const statusLabels: Record<OrderStatus, string> = {
  CONFIRMED: 'Confirmado',
  PREPARING: 'En preparación',
  DISPATCHED: 'Despachado',
  DELIVERED: 'Entregado',
  CANCELLED: 'Cancelado',
};
