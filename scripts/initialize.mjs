import { spawn } from 'node:child_process';
for (const path of ['bootstrap-aws', 'migrate', 'seed'])
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [`dist/scripts/${path}.js`], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Falló la inicialización: ${path}`)),
    );
  });
