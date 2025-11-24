import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4-mini';
import { detectType } from './file-info.js';

export const app = new Hono();

app.get('/healthz', (ctx) => {
  return ctx.body(null, 204);
});

app.get(
  '/api/v1/detect',
  zValidator('query', z.object({
    url: z.url({ error: issue => issue.input === undefined ? 'url is required' : 'malformed url' }),
  })),
  async (ctx) => {
    const url = ctx.req.valid('query').url;

    const buffer = await fetch(url).then(response => response.arrayBuffer());

    return ctx.body((await detectType(buffer)).mime);
  }
);
