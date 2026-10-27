import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs';
import { createOperationsApp } from '../../apps/operations/src/app.js';
import { createDocumentsApp } from '../../apps/documents/src/app.js';
import { createNotificationsApp } from '../../apps/notifications/src/app.js';
import { IdentityService } from '../../apps/operations/src/application/identity.service.js';
import { DocumentsService } from '../../apps/documents/src/application/documents.service.js';
import { NotificationsService } from '../../apps/notifications/src/application/notifications.service.js';
import { DATABASE, type Database } from '../../packages/platform/src/persistence.js';
import { loadConfig, awsOptions } from '../../packages/platform/src/config.js';
import { OutboxPublisher } from '../../packages/platform/src/messaging.js';
import type { OrderEvent } from '../../packages/contracts/src/events.js';
import type { Order, Product, Document, Page, NotificationPage } from '../../apps/web/src/types.js';
if (process.env.NODE_ENV !== 'test')
  throw new Error('La integración requiere NODE_ENV=test y un entorno dedicado.');
let operations: INestApplication, documents: INestApplication, notifications: INestApplication;
let apiUrl: string, docUrl: string, notifyUrl: string;
let admin: string, sales: string, warehouse: string, customer: string;
const customerId = '10000000-0000-4000-8000-000000000001';
const otherCustomerId = '10000000-0000-4000-8000-000000000002';
interface Problem {
  code: string;
  title: string;
  requestId: string;
}
async function http<T>(
  base: string,
  path: string,
  token?: string,
  method = 'GET',
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return {
    status: response.status,
    headers: response.headers,
    body: (response.status === 204 ? undefined : await response.json()) as T,
  };
}
async function product(stock = 10) {
  const result = await http<Product>(apiUrl, '/api/v1/products', admin, 'POST', {
    sku: `TEST-${randomUUID().slice(0, 8).toUpperCase()}`,
    name: 'Producto de integración',
    description: 'Fixture de prueba',
    category: 'Pruebas',
    priceCents: 1290,
    minimumStock: 2,
    active: true,
  });
  assert.equal(result.status, 201);
  if (stock)
    assert.equal(
      (
        await http(apiUrl, `/api/v1/products/${result.body.id}/adjustments`, admin, 'POST', {
          delta: stock,
          reason: 'Recepción de prueba',
        })
      ).status,
      201,
    );
  return result.body;
}
async function order(
  productId: string,
  quantity = 1,
  key = randomUUID(),
  token = admin,
  client = customerId,
) {
  return http<Order>(
    apiUrl,
    '/api/v1/orders',
    token,
    'POST',
    {
      customerId: client,
      deliveryAddress: 'Av. Integración 123, Lima',
      notes: 'Prueba automatizada',
      items: [{ productId, quantity }],
    },
    { 'Idempotency-Key': key },
  );
}
async function eventually<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeout = 12_000,
) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (predicate(value)) return value;
    await delay(100);
  }
  throw new Error('No se observó el resultado esperado dentro del plazo.');
}
before(async () => {
  operations = await createOperationsApp();
  documents = await createDocumentsApp();
  notifications = await createNotificationsApp();
  await operations.listen(0, '127.0.0.1');
  await documents.listen(0, '127.0.0.1');
  await notifications.listen(0, '127.0.0.1');
  apiUrl = await operations.getUrl();
  docUrl = await documents.getUrl();
  notifyUrl = await notifications.getUrl();
  const identity = operations.get(IdentityService);
  const password = process.env.SEED_PASSWORD!;
  admin = (await identity.login('admin@nexo.local', password)).accessToken;
  sales = (await identity.login('ventas@nexo.local', password)).accessToken;
  warehouse = (await identity.login('almacen@nexo.local', password)).accessToken;
  customer = (await identity.login('cliente@nexo.local', password)).accessToken;
});
after(async () => {
  await Promise.all([operations?.close(), documents?.close(), notifications?.close()]);
});
test('las rutas protegidas requieren un JWT válido', async () => {
  assert.equal((await http(apiUrl, '/api/v1/orders')).status, 401);
  assert.equal((await http(apiUrl, '/api/v1/orders', admin + 'x')).status, 401);
});
test('las respuestas de validación son estructuradas y contienen correlación', async () => {
  const result = await http<Problem>(apiUrl, '/api/v1/products', admin, 'POST', { name: 'x' });
  assert.equal(result.status, 422);
  assert.equal(result.body.code, 'VALIDATION_ERROR');
  assert.match(result.body.requestId, /^[0-9a-f-]{36}$/);
});
test('el stock insuficiente revierte la reserva completa del pedido', async () => {
  const p = await product(2);
  const result = await order(p.id, 3);
  assert.equal(result.status, 409);
  const list = await http<Page<Product>>(apiUrl, `/api/v1/products?search=${p.sku}`, admin);
  assert.equal(list.body.data[0]?.reserved, 0);
});
test('dos solicitudes simultáneas no venden dos veces la última unidad', async () => {
  const p = await product(1);
  const results = await Promise.all([order(p.id), order(p.id)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
});
test('reintentos concurrentes con la misma clave crean un único pedido', async () => {
  const p = await product(10);
  const key = randomUUID();
  const results = await Promise.all([order(p.id, 2, key), order(p.id, 2, key)]);
  assert.equal(results[0]!.status, 201);
  assert.equal(results[1]!.status, 201);
  assert.equal(results[0]!.body.id, results[1]!.body.id);
  const list = await http<Page<Product>>(apiUrl, `/api/v1/products?search=${p.sku}`, admin);
  assert.equal(list.body.data[0]?.reserved, 2);
});
test('una clave repetida con otro contenido produce un conflicto', async () => {
  const p = await product(10);
  const key = randomUUID();
  assert.equal((await order(p.id, 1, key)).status, 201);
  assert.equal((await order(p.id, 2, key)).status, 409);
});
test('las líneas repetidas se consolidan y se calcula el importe en el servidor', async () => {
  const p = await product(10);
  const result = await http<Order>(
    apiUrl,
    '/api/v1/orders',
    admin,
    'POST',
    {
      customerId,
      deliveryAddress: 'Av. Integración 123',
      items: [
        { productId: p.id, quantity: 2 },
        { productId: p.id, quantity: 3 },
      ],
    },
    { 'Idempotency-Key': randomUUID() },
  );
  assert.equal(result.status, 201);
  assert.equal(result.body.items.length, 1);
  assert.equal(result.body.totalCents, 5 * 1290);
});
test('almacén no puede crear pedidos ni modificar precios', async () => {
  const p = await product(5);
  assert.equal((await order(p.id, 1, randomUUID(), warehouse)).status, 403);
  assert.equal((await http(apiUrl, '/api/v1/products', warehouse, 'POST', {})).status, 403);
});
test('un cliente solo puede crear y consultar pedidos de su propia cuenta', async () => {
  const p = await product(5);
  assert.equal((await order(p.id, 1, randomUUID(), customer, otherCustomerId)).status, 403);
  const other = await order(p.id, 1, randomUUID(), admin, otherCustomerId);
  assert.equal((await http(apiUrl, `/api/v1/orders/${other.body.id}`, customer)).status, 404);
  const list = await http<Page<Order>>(apiUrl, '/api/v1/orders', customer);
  assert.ok(list.body.data.every((o) => o.customerId === customerId));
});
test('los cambios simultáneos de estado detectan una versión obsoleta', async () => {
  const p = await product(3);
  const created = await order(p.id);
  const url = `/api/v1/orders/${created.body.id}/status`;
  const results = await Promise.all([
    http(apiUrl, url, warehouse, 'PATCH', { status: 'PREPARING', expectedVersion: 1 }),
    http(apiUrl, url, warehouse, 'PATCH', { status: 'PREPARING', expectedVersion: 1 }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});
test('cancelar libera reservas exactamente una vez', async () => {
  const p = await product(7);
  const created = await order(p.id, 4);
  const url = `/api/v1/orders/${created.body.id}/status`;
  assert.equal(
    (await http(apiUrl, url, sales, 'PATCH', { status: 'CANCELLED', expectedVersion: 1 })).status,
    200,
  );
  assert.equal(
    (await http(apiUrl, url, sales, 'PATCH', { status: 'CANCELLED', expectedVersion: 2 })).status,
    409,
  );
  const result = await http<Page<Product>>(apiUrl, `/api/v1/products?search=${p.sku}`, admin);
  assert.equal(result.body.data[0]?.stock, 7);
  assert.equal(result.body.data[0]?.reserved, 0);
});
test('despachar descuenta stock físico y conserva un historial completo', async () => {
  const p = await product(9);
  const created = await order(p.id, 3);
  const url = `/api/v1/orders/${created.body.id}/status`;
  assert.equal(
    (await http(apiUrl, url, sales, 'PATCH', { status: 'PREPARING', expectedVersion: 1 })).status,
    403,
  );
  for (const [version, status] of [
    [1, 'PREPARING'],
    [2, 'DISPATCHED'],
    [3, 'DELIVERED'],
  ] as const)
    assert.equal(
      (await http(apiUrl, url, warehouse, 'PATCH', { status, expectedVersion: version })).status,
      200,
    );
  const result = await http<Page<Product>>(apiUrl, `/api/v1/products?search=${p.sku}`, admin);
  assert.equal(result.body.data[0]?.stock, 6);
  assert.equal(result.body.data[0]?.reserved, 0);
  const detail = await http<Order>(apiUrl, `/api/v1/orders/${created.body.id}`, admin);
  assert.equal(detail.body.history?.length, 4);
});
test('un ajuste que invade las reservas no modifica las existencias', async () => {
  const p = await product(6);
  await order(p.id, 5);
  assert.equal(
    (
      await http(apiUrl, `/api/v1/products/${p.id}/adjustments`, warehouse, 'POST', {
        delta: -2,
        reason: 'Corrección de prueba',
      })
    ).status,
    422,
  );
});
test('SNS y SQS entregan el evento y se genera un PDF descargable en S3', async () => {
  const p = await product(5);
  const created = await order(p.id);
  const result = await eventually(
    () => http<Page<Document>>(docUrl, `/api/v1/documents?orderId=${created.body.id}`, admin),
    (r) => r.body.data.length === 1,
  );
  const doc = result.body.data[0]!;
  const signed = await http<{ url: string }>(docUrl, `/api/v1/documents/${doc.id}/download`, admin);
  assert.equal(signed.status, 200);
  const response = await fetch(signed.body.url);
  assert.equal(response.status, 200);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 1000);
  const notes = await eventually(
    () => http<NotificationPage>(notifyUrl, '/api/v1/notifications?pageSize=100', admin),
    (r) => r.body.data.some((n) => n.orderId === created.body.id && n.type === 'DocumentGenerated'),
  );
  assert.ok(notes.body.unreadCount > 0);
});
test('documentos e inbox toleran un evento duplicado', async () => {
  const p = await product(3);
  const created = await order(p.id);
  await eventually(
    () => http<Page<Document>>(docUrl, `/api/v1/documents?orderId=${created.body.id}`, admin),
    (r) => r.body.data.length === 1,
  );
  const db = operations.get<Database>(DATABASE);
  const [row] = await db.em
    .fork()
    .execute<{ event: OrderEvent }[]>(
      "select event from outbox where event->>'type'='OrderConfirmed' and event->'data'->>'id'=?",
      [created.body.id],
    );
  await documents.get(DocumentsService).consume(row!.event);
  await notifications.get(NotificationsService).consume(row!.event);
  const list = await http<Page<Document>>(
    docUrl,
    `/api/v1/documents?orderId=${created.body.id}`,
    admin,
  );
  assert.equal(list.body.total, 1);
  const ndb = notifications.get<Database>(DATABASE);
  const [count] = await ndb.em
    .fork()
    .execute<{ count: string }[]>('select count(*) as count from notifications where id=?', [
      row!.event.id,
    ]);
  assert.equal(Number(count?.count), 1);
});
test('un cliente no puede descargar documentos de otro cliente', async () => {
  const p = await product(3);
  const created = await order(p.id, 1, randomUUID(), admin, otherCustomerId);
  const result = await eventually(
    () => http<Page<Document>>(docUrl, `/api/v1/documents?orderId=${created.body.id}`, admin),
    (r) => r.body.data.length === 1,
  );
  assert.equal(
    (await http(docUrl, `/api/v1/documents/${result.body.data[0]!.id}/download`, customer)).status,
    404,
  );
});
test('los WebSockets autentican la conexión y entregan novedades del cliente', async () => {
  const socket: Socket = io(notifyUrl + '/live', {
    auth: { token: customer },
    transports: ['websocket'],
    forceNew: true,
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WebSocket sin autenticar')), 5000);
      socket.on('session.ready', () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.on('connect_error', reject);
    });
    const events: { orderId: string }[] = [];
    socket.on('notification.created', (event) => events.push(event));
    const p = await product(3);
    const created = await order(p.id, 1, randomUUID(), customer);
    await eventually(
      async () => events,
      (list) => list.some((e) => e.orderId === created.body.id),
    );
  } finally {
    socket.close();
  }
});
test('las lecturas de notificaciones se guardan por usuario', async () => {
  const list = await http<NotificationPage>(notifyUrl, '/api/v1/notifications', customer);
  const first = list.body.data[0]!;
  assert.equal(
    (await http(notifyUrl, `/api/v1/notifications/${first.id}/read`, customer, 'POST')).status,
    201,
  );
  const own = await http<NotificationPage>(notifyUrl, '/api/v1/notifications', customer);
  assert.equal(own.body.data.find((n) => n.id === first.id)?.read, true);
  const staff = await http<NotificationPage>(
    notifyUrl,
    '/api/v1/notifications?pageSize=100',
    admin,
  );
  assert.equal(staff.body.data.find((n) => n.id === first.id)?.read, false);
});
test('el refresh rota el token y un token anterior revoca la sesión', async () => {
  const identity = operations.get(IdentityService);
  const session = await identity.login('admin@nexo.local', process.env.SEED_PASSWORD!);
  const rotated = await identity.refresh(session.refreshToken);
  assert.notEqual(session.refreshToken, rotated.refreshToken);
  await assert.rejects(() => identity.refresh(session.refreshToken), { code: 'INVALID_SESSION' });
  await assert.rejects(() => identity.refresh(rotated.refreshToken), { code: 'INVALID_SESSION' });
});
test('el login HTTP usa una cookie HttpOnly y el cierre revoca el refresh', async () => {
  const result = await http<{ accessToken: string }>(
    apiUrl,
    '/api/v1/auth/login',
    undefined,
    'POST',
    { email: 'admin@nexo.local', password: process.env.SEED_PASSWORD },
  );
  assert.equal(result.status, 200);
  const cookie = result.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.ok(result.body.accessToken);
  const rawCookie = cookie.split(';')[0]!;
  assert.equal(
    (await http(apiUrl, '/api/v1/auth/logout', undefined, 'POST', undefined, { Cookie: rawCookie }))
      .status,
    204,
  );
  assert.equal(
    (
      await http(apiUrl, '/api/v1/auth/refresh', undefined, 'POST', undefined, {
        Cookie: rawCookie,
      })
    ).status,
    401,
  );
});
test('la auditoría es exclusiva de administración', async () => {
  assert.equal((await http(apiUrl, '/api/v1/audit', sales)).status, 403);
  const audit = await http<Page<{ correlationId: string }>>(apiUrl, '/api/v1/audit', admin);
  assert.ok(audit.body.total > 0);
  assert.match(audit.body.data[0]!.correlationId, /^[0-9a-f-]{36}$/);
});
test('las colas tienen una política de redrive y los secretos se cargan desde Secrets Manager', async () => {
  const config = await loadConfig('operations');
  assert.ok(config.JWT_SECRET.length >= 48);
  const sqs = new SQSClient(awsOptions());
  try {
    const result = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: config.DOCUMENTS_QUEUE_URL,
        AttributeNames: ['RedrivePolicy'],
      }),
    );
    assert.equal(JSON.parse(result.Attributes!.RedrivePolicy!).maxReceiveCount, 5);
  } finally {
    sqs.destroy();
  }
});
test('la outbox conserva eventos tras un fallo y los publica al recuperarse', async () => {
  await operations.get(OutboxPublisher).onModuleDestroy();
  const p = await product(3);
  const created = await order(p.id);
  const db = operations.get<Database>(DATABASE);
  const config = await loadConfig('operations');
  const broken = new OutboxPublisher(db, {
    ...config,
    SNS_TOPIC_ARN: 'arn:aws:sns:us-east-1:123456789012:missing-topic',
  });
  try {
    await broken.publishBatch();
  } finally {
    await broken.onModuleDestroy();
  }
  const [row] = await db.em
    .fork()
    .execute<{ id: string; attempts: number; published_at: Date | null }[]>(
      "select id,attempts,published_at from outbox where event->>'type'='OrderConfirmed' and event->'data'->>'id'=?",
      [created.body.id],
    );
  assert.ok(row!.attempts >= 1);
  assert.equal(row!.published_at, null);
  await db.em
    .fork()
    .execute("update outbox set available_at=now()-interval '1 second' where id=?", [row!.id]);
  const recovered = new OutboxPublisher(db, config);
  try {
    await recovered.publishBatch();
  } finally {
    await recovered.onModuleDestroy();
  }
  await eventually(
    () => http<Page<Document>>(docUrl, `/api/v1/documents?orderId=${created.body.id}`, admin),
    (r) => r.body.data.length === 1,
  );
});
