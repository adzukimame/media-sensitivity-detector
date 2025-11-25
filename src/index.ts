import type { Handler } from 'aws-lambda';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { handle } from 'hono/aws-lambda';

import { AiService } from './ai.js';
import { detectType } from './file-info.js';
import { downloadUrl } from './download.js';
import { detectSensitivity } from './detect.js';
import { StatusError } from './status-error.js';
import { logger } from './logger.js';

export { logger } from './logger.js';

// eslint-disable-next-line @typescript-eslint/no-floating-promises
AiService.getInstance();

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
      400: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: z.strictObject({
              error: z.string().openapi({ example: 'Max size exceeded' }),
            }),
          },
        },
      },
      404: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: z.strictObject({
              error: z.string().openapi({ example: 'Target resource could not be fetched' }),
            }),
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: z.strictObject({
              error: z.string().openapi({ example: 'Internal server error' }),
            }),
          },
        },
      },
    },
  }),
  async (ctx) => {
    const { url, sensitiveThreshold, sensitiveThresholdForPorn, enableDetectionForVideos } = ctx.req.valid('query');

    logger.info('Received detection request', {
      operation: 'api:detect',
      url,
      sensitiveThreshold,
      sensitiveThresholdForPorn,
      enableDetectionForVideos,
    });

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    let cleanup: () => void = () => {};

    try {
      const downloadResult = await downloadUrl(url);
      const path = downloadResult[0];
      cleanup = downloadResult[1];

      const type = await detectType(path);

      const [sensitive, porn] = await detectSensitivity(path, type.mime, sensitiveThreshold, sensitiveThresholdForPorn, enableDetectionForVideos);

      logger.info('Detection request completed', {
        operation: 'api:detect',
        url,
        mime: type.mime,
        sensitive,
        porn,
      });

      return ctx.json({ sensitive, porn }, 200);
    }
    catch (err) {
      if (err instanceof StatusError) {
        logger.warn('Detection request failed with status error', {
          operation: 'api:detect',
          url,
          statusCode: err.statusCode,
          isClientError: err.isClientError,
          ...logger.formatError(err),
        });

        if (err.statusCode === 400) {
          return ctx.json({ error: err.message }, 400);
        }
        else if (err.statusCode === 404) {
          return ctx.json({ error: err.message }, 404);
        }
        else {
          return ctx.json({ error: 'Internal Server Error' }, 500);
        }
      }
      else {
        logger.error('Detection request failed with unexpected error', {
          operation: 'api:detect',
          url,
          ...logger.formatError(err),
        });
        return ctx.json({ error: 'Internal server error' }, 500);
      }
    }
    finally {
      cleanup();
    }
  }
);

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '0.0.1',
    title: 'Media Sensitivity Detector',
  },
});

export const handler: Handler = handle(app);
