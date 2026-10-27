import { loadConfig } from '../packages/platform/src/config.js';
import { operationsDatabase } from '../apps/operations/src/app.js';
import { documentsDatabase } from '../apps/documents/src/app.js';
import { notificationsDatabase } from '../apps/notifications/src/app.js';
for (const [name, open] of [
  ['operations', operationsDatabase],
  ['documents', documentsDatabase],
  ['notifications', notificationsDatabase],
] as const) {
  const db = await open(await loadConfig(name));
  try {
    await db.migrator.up();
    console.log(`Migraciones aplicadas: ${name}`);
  } finally {
    await db.close(true);
  }
}
