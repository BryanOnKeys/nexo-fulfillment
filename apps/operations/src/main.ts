import { loadConfig } from '../../../packages/platform/src/config.js';
import { createOperationsApp } from './app.js';
const config = await loadConfig('operations');
const app = await createOperationsApp(config);
await app.listen(config.port, '0.0.0.0');
