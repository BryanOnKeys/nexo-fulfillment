import { randomUUID } from 'node:crypto';
import { EntitySchema, type MigrationObject } from '@mikro-orm/core';
import { MikroORM, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import type { RuntimeConfig } from './config.js';
import type { IntegrationEvent } from '../../contracts/src/events.js';

export const DATABASE = Symbol('DATABASE');
export type Database = MikroORM;
export class OutboxRecord {
  id: string = randomUUID();
  event!: IntegrationEvent;
  createdAt = new Date();
  availableAt = new Date();
  publishedAt: Date | null = null;
  lockedUntil: Date | null = null;
  leaseId: string | null = null;
  attempts = 0;
  lastError: string | null = null;
}
export const OutboxSchema = new EntitySchema<OutboxRecord>({
  class: OutboxRecord,
  tableName: 'outbox',
  properties: {
    id: { type: 'uuid', primary: true },
    event: { type: 'json' },
    createdAt: { type: Date, columnType: 'timestamptz' },
    availableAt: { type: Date, columnType: 'timestamptz' },
    publishedAt: { type: Date, columnType: 'timestamptz', nullable: true },
    lockedUntil: { type: Date, columnType: 'timestamptz', nullable: true },
    leaseId: { type: 'uuid', nullable: true },
    attempts: { type: 'integer' },
    lastError: { type: 'string', nullable: true },
  },
});
export function outbox(event: IntegrationEvent) {
  return Object.assign(new OutboxRecord(), { id: event.id, event });
}
export const commonMigrationSql = `
create table outbox (
  id uuid primary key, event jsonb not null, created_at timestamptz not null default now(),
  available_at timestamptz not null default now(), published_at timestamptz,
  locked_until timestamptz, lease_id uuid, attempts integer not null default 0, last_error text
);
create index outbox_pending on outbox (available_at) where published_at is null;
create table inbox (id uuid primary key, processed_at timestamptz not null default now());
`;
export async function openDatabase(
  config: RuntimeConfig,
  entities: EntitySchema[],
  migrations: MigrationObject[],
) {
  return MikroORM.init({
    driver: PostgreSqlDriver,
    clientUrl: config.databaseUrl,
    entities: [...entities, OutboxSchema],
    extensions: [Migrator],
    migrations: {
      migrationsList: migrations,
      transactional: true,
      allOrNothing: true,
      emit: 'js',
      snapshot: false,
      snapshotOnMigrate: false,
    },
    pool: { min: 0, max: 10 },
    debug: false,
  });
}
