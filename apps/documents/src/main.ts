import { loadConfig } from '../../../packages/platform/src/config.js';
import { createDocumentsApp } from './app.js';
const config = await loadConfig('documents');
const app = await createDocumentsApp(config);
await app.listen(config.port, '0.0.0.0');
