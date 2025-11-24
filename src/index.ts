// import { Hono } from 'hono';
import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { detectType } from './file-info.js';
import { downloadUrl } from './download.js';
import { detectSensitivity } from './detect.js';

export const app = new OpenAPIHono();

app.openapi(
  createRoute({
    method: 'get',
    path: '/healthz',
    description: 'Retrieve service health status',
    responses: {
      204: {
        description: 'Service is healthy',
      },
    },
  }),
  (ctx) => {
    return ctx.body(null, 204);
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/api/v1/detect',
    description: 'Detect media sensitivity',
    request: {
      query: z.object({
        url: z.url({ error: issue => issue.input === undefined ? 'url is required' : 'malformed url' }).openapi({ example: 'https://example.test/files/image.webp' }),
        sensitiveThreshold: z.coerce.number().default(0.5),
        sensitiveThresholdForPorn: z.coerce.number().default(0.75),
        enableDetectionForVideos: z.coerce.boolean().default(false),
      }),
    },
    responses: {
      200: {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: z.strictObject({
              sensitive: z.boolean().openapi({ example: false }),
              porn: z.boolean().openapi({ example: false }),
            }),
          },
        },
      },
    },
  }),
  async (ctx) => {
    const { url, sensitiveThreshold, sensitiveThresholdForPorn, enableDetectionForVideos } = ctx.req.valid('query');

    const buffer = await downloadUrl(url);

    const type = await detectType(buffer);

    const [sensitive, porn] = await detectSensitivity(buffer, type.mime, sensitiveThreshold, sensitiveThresholdForPorn, enableDetectionForVideos);

    return ctx.json({ sensitive, porn });
  }
);

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '0.0.1',
    title: 'Media Sensitivity Detector',
  },
});
