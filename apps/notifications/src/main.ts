import { loadConfig } from '../../../packages/platform/src/config.js';
import { createNotificationsApp } from './app.js';
const config = await loadConfig('notifications');
const app = await createNotificationsApp(config);
await app.listen(config.port, '0.0.0.0');
