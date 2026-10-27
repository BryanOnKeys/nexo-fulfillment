import { invariant } from '../../../../packages/platform/src/errors.js';
import type { OrderStatus } from '../../../../packages/contracts/src/events.js';

export class Money {
  private constructor(
    readonly cents: number,
    readonly currency: 'PEN' = 'PEN',
  ) {}
  static of(cents: number): Money {
    invariant(
      Number.isSafeInteger(cents) && cents >= 0 && cents <= 2_000_000_000,
      'INVALID_AMOUNT',
      'El importe está fuera del rango permitido.',
      422,
    );
    return new Money(cents);
  }
  times(quantity: number): Money {
    return Money.of(this.cents * quantity);
  }
  add(other: Money): Money {
    return Money.of(this.cents + other.cents);
  }
}
export class Stock {
  constructor(
    readonly onHand: number,
    readonly reserved: number,
  ) {
    invariant(
      Number.isSafeInteger(onHand) &&
        onHand <= 2_000_000_000 &&
        Number.isSafeInteger(reserved) &&
        onHand >= 0 &&
        reserved >= 0 &&
        reserved <= onHand,
      'INVALID_STOCK',
      'El stock debe cubrir las unidades reservadas.',
      422,
    );
  }
  get available() {
    return this.onHand - this.reserved;
  }
  reserve(quantity: number): Stock {
    this.quantity(quantity);
    invariant(
      quantity <= this.available,
      'INSUFFICIENT_STOCK',
      `Solo hay ${this.available} unidades disponibles.`,
    );
    return new Stock(this.onHand, this.reserved + quantity);
  }
  release(quantity: number): Stock {
    this.quantity(quantity);
    invariant(quantity <= this.reserved, 'INVALID_RESERVATION', 'La reserva no es válida.');
    return new Stock(this.onHand, this.reserved - quantity);
  }
  dispatch(quantity: number): Stock {
    this.quantity(quantity);
    invariant(quantity <= this.reserved, 'INVALID_RESERVATION', 'La reserva no es válida.');
    return new Stock(this.onHand - quantity, this.reserved - quantity);
  }
  adjust(delta: number): Stock {
    invariant(
      Number.isSafeInteger(delta) && delta !== 0,
      'INVALID_ADJUSTMENT',
      'El ajuste debe ser un entero distinto de cero.',
      422,
    );
    return new Stock(this.onHand + delta, this.reserved);
  }
  private quantity(value: number) {
    invariant(
      Number.isSafeInteger(value) && value > 0,
      'INVALID_QUANTITY',
      'La cantidad debe ser un entero mayor que cero.',
      422,
    );
  }
}
const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};
export class OrderAggregate {
  constructor(
    readonly status: OrderStatus,
    readonly version: number,
  ) {}
  transition(next: OrderStatus, expectedVersion: number) {
    invariant(
      expectedVersion === this.version,
      'STALE_ORDER',
      'El pedido cambió. Actualiza la vista antes de continuar.',
    );
    invariant(
      transitions[this.status].includes(next),
      'INVALID_TRANSITION',
      'Este cambio de estado no está permitido.',
    );
    return {
      status: next,
      version: this.version + 1,
      inventoryEffect:
        next === 'CANCELLED' ? 'RELEASE' : next === 'DISPATCHED' ? 'DISPATCH' : 'NONE',
    } as const;
  }
}
