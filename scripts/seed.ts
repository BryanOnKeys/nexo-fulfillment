import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { loadConfig } from '../packages/platform/src/config.js';
import { hashPassword } from '../packages/platform/src/security.js';
import { operationsDatabase } from '../apps/operations/src/app.js';
import {
  CustomerRecord,
  UserRecord,
  ProductRecord,
  OrderRecord,
} from '../apps/operations/src/infrastructure/entities.js';
import { MikroOrderStore } from '../apps/operations/src/infrastructure/mikro-order.store.js';
import { OrdersService } from '../apps/operations/src/application/orders.service.js';
import type { AccessClaims } from '../packages/contracts/src/events.js';
if (process.env.NODE_ENV === 'production')
  throw new Error('El seed está deshabilitado en producción.');
const password = z.string().min(12).parse(process.env.SEED_PASSWORD);
const db = await operationsDatabase(await loadConfig('operations'));
try {
  const em = db.em.fork();
  if ((await em.count(UserRecord, {})) > 0) {
    console.log('Seed conservado: ya existen usuarios.');
  } else {
    const customers = [
      'Andes Suministros',
      'Casa Roble',
      'Taller Norte',
      'Comercial Pacífico',
      'Espacios del Sur',
      'Distribuciones Lima',
      'Oficinas Prisma',
      'Constructora Horizonte',
      'Almacenes Inti',
      'Diseño Central',
    ].map((name, i) =>
      Object.assign(new CustomerRecord(), {
        id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        name,
        taxId: `20${String(100000000 + i).padStart(9, '0')}`,
        email: `compras${i + 1}@example.com`,
        phone: `+51 900 100 ${String(i + 1).padStart(3, '0')}`,
        address: `Av. Los Talleres ${100 + i * 25}, Lima`,
      }),
    );
    em.persist(customers);
    await em.flush();
    const passwordHash = await hashPassword(password);
    const users = [
      { name: 'Bryan · Administración', email: 'admin@nexo.local', role: 'ADMIN' },
      { name: 'Valeria · Ventas', email: 'ventas@nexo.local', role: 'SALES' },
      { name: 'Diego · Almacén', email: 'almacen@nexo.local', role: 'WAREHOUSE' },
      {
        name: 'Cliente · Andes Suministros',
        email: 'cliente@nexo.local',
        role: 'CUSTOMER',
        customerId: customers[0]!.id,
      },
    ].map((u, i) =>
      Object.assign(new UserRecord(), u, {
        id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        passwordHash,
      }),
    );
    em.persist(users);
    await em.flush();
    const entries: [string, string, string, number, number][] = [
      ['PANEL-001', 'Wall panel nogal', 'Revestimientos', 4590, 120],
      ['PANEL-002', 'Wall panel roble', 'Revestimientos', 4290, 85],
      ['LED-001', 'Perfil LED de aluminio', 'Iluminación', 2890, 65],
      ['LED-002', 'Tira LED cálida 5 m', 'Iluminación', 5990, 48],
      ['MDF-001', 'Tablero MDF blanco', 'Tableros', 12500, 32],
      ['MDF-002', 'Tablero MDF natural', 'Tableros', 10800, 40],
      ['HER-001', 'Bisagra cierre suave', 'Herrajes', 1290, 200],
      ['HER-002', 'Corredera telescópica', 'Herrajes', 3590, 95],
      ['HER-003', 'Tirador negro mate', 'Herrajes', 1890, 140],
      ['ADH-001', 'Adhesivo de montaje', 'Insumos', 2290, 7],
      ['TOR-001', 'Tornillo 4 x 40, caja', 'Insumos', 1590, 80],
      ['PER-001', 'Perfil de terminación', 'Revestimientos', 1990, 6],
      ['ORG-001', 'Organizador modular', 'Accesorios', 8990, 24],
      ['SOP-001', 'Soporte reforzado', 'Herrajes', 2490, 60],
      ['LAM-001', 'Lámina decorativa', 'Revestimientos', 6790, 35],
    ];
    const products = entries.map(([sku, name, category, priceCents, stock], i) =>
      Object.assign(new ProductRecord(), {
        id: `30000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        sku,
        name,
        category,
        description: `${name} para proyectos de mobiliario y acondicionamiento de espacios.`,
        priceCents,
        stock,
        minimumStock: 8,
      }),
    );
    em.persist(products);
    await em.flush();
    const admin = users[0]!;
    const actor: AccessClaims = {
      sub: admin.id,
      name: admin.name,
      role: admin.role,
      customerId: null,
      sessionId: randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 900,
      iss: 'nexo',
      aud: 'nexo-services',
    };
    const orders = new OrdersService(new MikroOrderStore(db));
    for (let i = 0; i < 12; i++) {
      const customer = customers[i % customers.length]!;
      const context = { actor, correlationId: randomUUID() };
      let order = await orders.create(
        {
          customerId: customer.id,
          deliveryAddress: customer.address,
          notes: i % 3 === 0 ? 'Coordinar entrega durante la mañana.' : '',
          items: [
            { productId: products[i % 9]!.id, quantity: 2 + (i % 4) },
            { productId: products[(i + 3) % 9]!.id, quantity: 1 },
          ],
        },
        `seed-order-${i}`,
        context,
      );
      if (i % 5 === 4) {
        await orders.transition(
          order.id,
          {
            status: 'CANCELLED',
            expectedVersion: order.version,
            note: 'Cliente solicitó reprogramar la compra.',
          },
          context,
        );
      } else {
        const target = i % 4;
        for (const status of (['PREPARING', 'DISPATCHED', 'DELIVERED'] as const).slice(0, target)) {
          order = await orders.transition(
            order.id,
            {
              status,
              expectedVersion: order.version,
              note: 'Avance registrado por el equipo de operaciones.',
            },
            context,
          );
        }
      }
      // Distribución temporal solo de los datos ficticios; nunca altera pedidos existentes.
      await db.em
        .fork()
        .nativeUpdate(
          OrderRecord,
          { id: order.id },
          { createdAt: new Date(Date.now() - (i % 7) * 86_400_000) },
        );
    }
    console.log('Datos ficticios creados: 10 clientes, 15 productos, 12 pedidos y 4 usuarios.');
  }
} finally {
  await db.close(true);
}
