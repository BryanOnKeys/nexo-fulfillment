import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const secret = () => randomBytes(32).toString('base64url');
let created = false;
try {
  await access('.env');
} catch {
  let env = await readFile('.env.example', 'utf8');
  const values = {
    JWT_SECRET: randomBytes(64).toString('base64url'),
    SEED_PASSWORD: secret(),
    POSTGRES_PASSWORD: secret(),
    PG_OPERATIONS_PASSWORD: secret(),
    PG_DOCUMENTS_PASSWORD: secret(),
    PG_NOTIFICATIONS_PASSWORD: secret(),
  };
  for (const [key, value] of Object.entries(values))
    env = env.replace(`${key}=\n`, `${key}=${value}\n`);
  for (const service of ['OPERATIONS', 'DOCUMENTS', 'NOTIFICATIONS']) {
    const name = service.toLowerCase();
    env = env.replace(
      new RegExp(`${service}_DATABASE_URL=.*`),
      `${service}_DATABASE_URL=postgresql://nexo_${name}:${values[`PG_${service}_PASSWORD`]}@localhost:5432/nexo_${name}`,
    );
  }
  await writeFile('.env', env, { mode: 0o600 });
  created = true;
}
process.loadEnvFile('.env');
if (!process.argv.includes('--env-only')) {
  await new Promise((resolve, reject) => {
    const child = spawn('docker', ['compose', 'up', '--build', '-d', '--wait'], {
      cwd: root,
      stdio: 'inherit',
    });
    child.on('error', () =>
      reject(
        new Error('Instala Docker Desktop e inicia su motor antes de ejecutar la instalación.'),
      ),
    );
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('Docker no pudo iniciar NEXO. Consulta: docker compose logs bootstrap')),
    );
  });
  console.log('\nNEXO disponible en http://localhost:5173');
}
if (created) {
  console.log(
    '\nUsuarios locales: admin@nexo.local, ventas@nexo.local, almacen@nexo.local y cliente@nexo.local',
  );
  console.log('Contraseña local generada:', process.env.SEED_PASSWORD);
  console.log('Puedes volver a consultarla en SEED_PASSWORD dentro de .env.');
}
