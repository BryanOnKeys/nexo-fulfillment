import { Migration } from '@mikro-orm/migrations';
import { commonMigrationSql } from '../../../../packages/platform/src/persistence.js';
export class Migration202610270002 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table documents(id uuid primary key,order_id uuid not null,order_number text not null,customer_id uuid not null,kind text not null check(kind in ('CONFIRMATION','DISPATCH')),object_key text not null unique,file_name text not null,size_bytes integer not null check(size_bytes>0),created_at timestamptz not null default now(),unique(order_id,kind));create index documents_customer on documents(customer_id,created_at desc);${commonMigrationSql}`,
    );
  }
  override async down(): Promise<void> {
    this.addSql('drop table inbox,outbox,documents;');
  }
}
