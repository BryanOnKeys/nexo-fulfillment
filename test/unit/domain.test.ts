import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Money, Stock, OrderAggregate } from '../../apps/operations/src/domain/order.js';
import { BusinessError } from '../../packages/platform/src/errors.js';
import { hashPassword, verifyPassword } from '../../packages/platform/src/security.js';
import { integrationEventSchema } from '../../packages/contracts/src/events.js';

test('una reserva reduce lo disponible y mantiene las unidades físicas', () => {
  const stock = new Stock(8, 0).reserve(3);
  assert.equal(stock.onHand, 8);
  assert.equal(stock.available, 5);
});
test('el stock cero impide nuevas ventas', () => {
  assert.throws(() => new Stock(0, 0).reserve(1), { code: 'INSUFFICIENT_STOCK' });
});
test('la última unidad no puede reservarse dos veces', () => {
  const stock = new Stock(1, 0).reserve(1);
  assert.throws(() => stock.reserve(1), { code: 'INSUFFICIENT_STOCK' });
});
test('cancelar libera la reserva sin aumentar las existencias físicas', () => {
  const stock = new Stock(8, 5).release(3);
  assert.equal(stock.onHand, 8);
  assert.equal(stock.available, 6);
});
test('despachar descuenta tanto stock físico como reserva', () => {
  const stock = new Stock(8, 5).dispatch(3);
  assert.equal(stock.onHand, 5);
  assert.equal(stock.reserved, 2);
  assert.equal(stock.available, 3);
});
test('un ajuste no puede consumir unidades ya reservadas', () => {
  assert.throws(() => new Stock(8, 5).adjust(-4), { code: 'INVALID_STOCK' });
});
test('una liberación no puede superar la reserva', () => {
  assert.throws(() => new Stock(8, 2).release(3), { code: 'INVALID_RESERVATION' });
});
test('las cantidades fraccionarias no son válidas para unidades', () => {
  assert.throws(() => new Stock(8, 0).reserve(1.5), { code: 'INVALID_QUANTITY' });
  assert.throws(() => new Stock(2_000_000_000, 0).adjust(1), { code: 'INVALID_STOCK' });
});
test('las reservas nunca superan el stock en una secuencia de movimientos', () => {
  let stock = new Stock(100, 0);
  for (let i = 0; i < 20; i++) stock = stock.reserve(3);
  for (let i = 0; i < 10; i++) stock = stock.dispatch(2);
  for (let i = 0; i < 10; i++) stock = stock.release(4);
  assert.equal(stock.onHand, 80);
  assert.equal(stock.reserved, 0);
});
test('el dinero usa céntimos enteros y suma sin errores decimales', () => {
  assert.equal(Money.of(10).add(Money.of(20)).cents, 30);
  assert.equal(Money.of(1290).times(3).cents, 3870);
});
test('los importes fuera de rango se rechazan antes de llegar a SQL', () => {
  assert.throws(() => Money.of(2_000_000_000).times(2), BusinessError);
  assert.throws(() => Money.of(1.5), BusinessError);
});
test('el flujo del pedido avanza con versiones consecutivas', () => {
  const result = new OrderAggregate('CONFIRMED', 1).transition('PREPARING', 1);
  assert.deepEqual(result, { status: 'PREPARING', version: 2, inventoryEffect: 'NONE' });
});
test('los cambios con una versión antigua se rechazan', () => {
  assert.throws(() => new OrderAggregate('PREPARING', 2).transition('DISPATCHED', 1), {
    code: 'STALE_ORDER',
  });
});
test('despachar activa el descuento de inventario', () => {
  assert.equal(
    new OrderAggregate('PREPARING', 2).transition('DISPATCHED', 2).inventoryEffect,
    'DISPATCH',
  );
});
test('cancelar activa la liberación de inventario', () => {
  assert.equal(
    new OrderAggregate('PREPARING', 2).transition('CANCELLED', 2).inventoryEffect,
    'RELEASE',
  );
});
test('un pedido entregado es terminal', () => {
  assert.throws(() => new OrderAggregate('DELIVERED', 4).transition('CANCELLED', 4), {
    code: 'INVALID_TRANSITION',
  });
});
test('no se permite saltar la preparación para despachar', () => {
  assert.throws(() => new OrderAggregate('CONFIRMED', 1).transition('DISPATCHED', 1), {
    code: 'INVALID_TRANSITION',
  });
});
test('las contraseñas usan sales distintas y se verifican sin almacenar texto plano', async () => {
  const a = await hashPassword('una-contraseña-larga');
  const b = await hashPassword('una-contraseña-larga');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('una-contraseña-larga', a), true);
  assert.equal(await verifyPassword('otra-contraseña', a), false);
});
test('un evento con versión desconocida no pasa el contrato', () => {
  assert.equal(
    integrationEventSchema.safeParse({ schemaVersion: 2, type: 'OrderConfirmed' }).success,
    false,
  );
});
