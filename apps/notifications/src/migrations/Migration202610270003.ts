import { Migration } from '@mikro-orm/migrations';
import { commonMigrationSql } from '../../../../packages/platform/src/persistence.js';
export class Migration202610270003 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table notifications(id uuid primary key,customer_id uuid not null,order_id uuid not null,order_number text not null,type text not null,title text not null,message text not null,created_at timestamptz not null default now());create index notifications_customer on notifications(customer_id,created_at desc);create table notification_reads(id text primary key,notification_id uuid not null references notifications(id),user_id uuid not null,created_at timestamptz not null default now(),unique(notification_id,user_id));${commonMigrationSql}`,
    );
  }
  override async down(): Promise<void> {
    this.addSql('drop table inbox,outbox,notification_reads,notifications;');
  }
}
