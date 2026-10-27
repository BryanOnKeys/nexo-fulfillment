import { z } from 'zod';
import { roleSchema, orderStatusSchema } from '../../../../packages/contracts/src/events.js';
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(''),
});
export const customerSchema = z
  .object({
    name: z.string().trim().min(3).max(150),
    taxId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{8,20}$/),
    email: z.email().max(180),
    phone: z.string().trim().max(30).default(''),
    address: z.string().trim().min(5).max(300),
  })
  .strict();
export const productSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .regex(/^[A-Z0-9-]{3,40}$/),
    name: z.string().trim().min(3).max(150),
    description: z.string().trim().max(1500).default(''),
    category: z.string().trim().min(2).max(80).default('General'),
    priceCents: z.int().positive().max(100_000_000),
    minimumStock: z.int().min(0).max(1_000_000).default(5),
    active: z.boolean().default(true),
  })
  .strict();
export const adjustmentSchema = z
  .object({
    delta: z
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((v) => v !== 0),
    reason: z.string().trim().min(5).max(300),
  })
  .strict();
export const createOrderSchema = z
  .object({
    customerId: z.uuid(),
    deliveryAddress: z.string().trim().min(5).max(300),
    notes: z.string().trim().max(1000).default(''),
    items: z
      .array(z.object({ productId: z.uuid(), quantity: z.int().positive().max(10_000) }).strict())
      .min(1)
      .max(50),
  })
  .strict();
export const transitionSchema = z
  .object({
    status: orderStatusSchema,
    expectedVersion: z.int().positive(),
    note: z.string().trim().max(500).default(''),
  })
  .strict();
export const loginSchema = z
  .object({ email: z.email().max(180), password: z.string().min(1).max(128) })
  .strict();
export const userSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    email: z.email().max(180),
    password: z.string().min(12).max(128),
    role: roleSchema,
    customerId: z.uuid().nullable().default(null),
  })
  .strict()
  .refine((v) => (v.role === 'CUSTOMER') === (v.customerId !== null), {
    message:
      'Un usuario cliente debe estar asociado a un cliente; los usuarios internos no deben estarlo.',
  });
export type CreateOrder = z.infer<typeof createOrderSchema>;
export type ActorContext = {
  actor: import('../../../../packages/contracts/src/events.js').AccessClaims;
  correlationId: string;
};
