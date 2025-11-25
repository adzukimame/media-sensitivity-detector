import { serve } from '@hono/node-server';

// @ts-ignore
const { app, logger } = await import('../built/index.js');

serve({
  fetch: app.fetch,
  port: process.env.PORT && !Number.isNaN(Number.parseInt(process.env.PORT)) ? Number.parseInt(process.env.PORT) : 3000,
}, (info) => {
  logger.info(`Server is listening on port ${info.port}`);
});
