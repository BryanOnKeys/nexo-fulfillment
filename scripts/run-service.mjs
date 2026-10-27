const service = process.env.NEXO_SERVICE;
if (!['operations', 'documents', 'notifications'].includes(service))
  throw new Error('NEXO_SERVICE no válido.');
await import(`../dist/apps/${service}/src/main.js`);
