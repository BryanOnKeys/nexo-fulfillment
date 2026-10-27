import { Migration } from '@mikro-orm/migrations';
import { commonMigrationSql } from '../../../../packages/platform/src/persistence.js';
export class Migration202610270001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
    create table customers (id uuid primary key, name text not null, tax_id varchar(20) not null unique, email text not null, phone text not null default '', address text not null, created_at timestamptz not null default now());
    create table users (id uuid primary key, name text not null, email text not null unique, password_hash text not null, role text not null check (role in ('ADMIN','SALES','WAREHOUSE','CUSTOMER')), customer_id uuid references customers(id), active boolean not null default true, created_at timestamptz not null default now(), check ((role = 'CUSTOMER') = (customer_id is not null)));
    create table sessions (id uuid primary key, user_id uuid not null references users(id), token_hash text not null, expires_at timestamptz not null, revoked_at timestamptz, created_at timestamptz not null default now());
    create index sessions_user on sessions(user_id);
    create table products (id uuid primary key, sku varchar(40) not null unique, name text not null, description text not null default '', category text not null default 'General', price_cents integer not null check (price_cents > 0), stock integer not null default 0 check (stock >= 0), reserved integer not null default 0 check (reserved >= 0 and reserved <= stock), minimum_stock integer not null default 5 check(minimum_stock >= 0), active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create index products_name on products(lower(name));
    create sequence order_number_seq start 1001;
    create table orders (id uuid primary key, number text not null unique, customer_id uuid not null references customers(id), customer_name text not null, delivery_address text not null, status text not null check(status in ('CONFIRMED','PREPARING','DISPATCHED','DELIVERED','CANCELLED')), total_cents integer not null check(total_cents > 0), currency char(3) not null check(currency='PEN'), version integer not null default 1, notes text not null default '', created_by uuid not null references users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
    create index orders_customer_date on orders(customer_id, created_at desc);
    create index orders_status_date on orders(status, created_at desc);
    create table order_items (id uuid primary key, order_id uuid not null references orders(id), product_id uuid not null references products(id), sku text not null, name text not null, quantity integer not null check(quantity > 0), unit_price_cents integer not null check(unit_price_cents > 0), unique(order_id,product_id));
    create table order_history (id uuid primary key, order_id uuid not null references orders(id), status text not null, note text not null default '', actor_id uuid not null references users(id), actor_name text not null, created_at timestamptz not null default now());
    create index order_history_order on order_history(order_id,created_at);
    create table stock_movements (id uuid primary key, product_id uuid not null references products(id), order_id uuid references orders(id), kind text not null, quantity integer not null, reason text not null, actor_id uuid not null references users(id), created_at timestamptz not null default now());
    create index movements_product on stock_movements(product_id,created_at desc);
    create table audit_log (id uuid primary key, actor_id uuid not null, actor_name text not null, action text not null, resource_id uuid not null, correlation_id uuid not null, created_at timestamptz not null default now());
    create index audit_date on audit_log(created_at desc);
    create table idempotency_keys (id uuid primary key, actor_id uuid not null references users(id), key text not null, request_hash text not null, order_id uuid not null references orders(id), created_at timestamptz not null default now(), unique(actor_id,key));
    ${commonMigrationSql}
    `);
  }
  override async down(): Promise<void> {
    this.addSql(
      'drop table inbox, outbox, idempotency_keys, audit_log, stock_movements, order_history, order_items, orders, products, sessions, users, customers; drop sequence order_number_seq;',
    );
  }
}
