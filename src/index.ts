import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod/v4-mini';
import { detectType } from './file-info.js';
import { downloadUrl } from './download.js';
import { detectSensitivity } from './detect.js';

export const app = new Hono();

app.get('/healthz', (ctx) => {
  return ctx.body(null, 204);
});

app.get(
  '/api/v1/detect',
  zValidator('query', z.object({
    url: z.url({ error: issue => issue.input === undefined ? 'url is required' : 'malformed url' }),
    sensitiveThreshold: z.optional(z.coerce.number()),
    sensitiveThresholdForPorn: z.optional(z.coerce.number()),
    enableDetectionForVideos: z.optional(z.coerce.boolean()),
  })),
  async (ctx) => {
    const url = ctx.req.valid('query').url;
    const sensitiveThreshold = ctx.req.valid('query').sensitiveThreshold ?? 0.5;
    const sensitiveThresholdForPorn = ctx.req.valid('query').sensitiveThresholdForPorn ?? 0.75;
    const enableDetectionForVideos = ctx.req.valid('query').enableDetectionForVideos ?? false;

    const buffer = await downloadUrl(url);

    const type = await detectType(buffer);

    const [sensitive, porn] = await detectSensitivity(buffer, type.mime, sensitiveThreshold, sensitiveThresholdForPorn, enableDetectionForVideos);

    return ctx.json({ sensitive, porn });
  }
);
