import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const commands = [
  ['--env-file-if-exists=.env', '--watch', 'dist/apps/operations/src/main.js'],
  ['--env-file-if-exists=.env', '--watch', 'dist/apps/documents/src/main.js'],
  ['--env-file-if-exists=.env', '--watch', 'dist/apps/notifications/src/main.js'],
];
const children = commands.map((args) => spawn(process.execPath, args, { stdio: 'inherit' }));
children.push(
  spawn(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json', '--watch'], {
    stdio: 'inherit',
  }),
);
children.push(
  spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)),
      '--host',
      '0.0.0.0',
    ],
    {
      cwd: new URL('../apps/web', import.meta.url),
      stdio: 'inherit',
    },
  ),
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}
for (const child of children)
  child.on('exit', (code) => {
    if (!stopping && code) stop(code);
  });
process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
