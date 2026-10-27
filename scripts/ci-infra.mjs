import pg from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
if (process.env.NODE_ENV !== 'test')
  throw new Error('Este helper solo se utiliza en CI con NODE_ENV=test.');
const url = new URL(process.env.OPERATIONS_DATABASE_URL);
url.pathname = '/postgres';
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  for (const name of ['nexo_operations', 'nexo_documents', 'nexo_notifications']) {
    const result = await client.query('select 1 from pg_database where datname=$1', [name]);
    if (!result.rows.length) await client.query(`create database ${name}`);
  }
} finally {
  await client.end();
}
for (let i = 0; i < 40; i++) {
  try {
    const response = await fetch(process.env.AWS_ENDPOINT_URL);
    if (response.ok) break;
  } catch {
    /* El servicio aún se está iniciando. */
  }
  if (i === 39) throw new Error('El emulador AWS no está disponible.');
  await delay(500);
}
