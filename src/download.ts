/*
 * SPDX-FileCopyrightText: misskey-dev
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { StatusError } from './status-error.js';
import { logger } from './logger.js';
import { createTemp } from './create-temp.js';

export type DownloadConfig = {
  [x: string]: string | number;
  userAgent: string;
  maxSize: number;
};

export const defaultDownloadConfig: DownloadConfig = {
  userAgent: `MisskeyMediaProxy/0.0.24`,
  maxSize: 262144000, // 250MB
};

export async function downloadUrl(url: string, settings: DownloadConfig = defaultDownloadConfig): Promise<[path: string, cleanup: () => void]> {
  logger.info('Starting download', {
    operation: 'download:fetch',
    url,
    maxSize: settings.maxSize,
  });

  const res = await fetch(url, {
    headers: {
      'User-Agent': settings.userAgent,
    },
    signal: AbortSignal.timeout(10 * 1000),
  }).catch((e: unknown) => {
    const isTimeout = e instanceof Error && e.name === 'TimeoutError';
    logger.error(isTimeout ? 'Download timed out' : 'Download failed', {
      operation: 'download:fetch',
      url,
      isTimeout,
      ...logger.formatError(e),
    });
    throw new StatusError('An error occured while fetching content', 500, 'Internal Server Error', e instanceof Error ? e : undefined);
  });

  if (!res.ok) {
    logger.warn('Download received non-OK status', {
      operation: 'download:fetch',
      url,
      status: res.status,
      statusText: res.statusText,
    });
    throw new StatusError(`Target resource could not be fetched (Received status: ${res.status}, target: ${url})`, 404, 'Not Found');
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength != null) {
    const size = Number(contentLength);
    if (size > settings.maxSize) {
      logger.warn('Download rejected due to size limit', {
        operation: 'download:fetch',
        url,
        contentLength: size,
        maxSize: settings.maxSize,
      });
      throw new StatusError(`Max size exceeded (${size} > ${settings.maxSize}) on response`, 400, 'Not Found');
    }
  }

  const [tempPath, cleanup] = await createTemp();

  if (!res.body) {
    return [tempPath, cleanup];
  }

  const writeStream = createWriteStream(tempPath);
  const readStream = Readable.fromWeb(res.body);

  let bytesRead = 0;
  readStream.on('data', (chunk) => {
    if (!(chunk instanceof Buffer) && typeof chunk !== 'string') {
      readStream.destroy(new Error('Invalid chunk received'));
      return;
    }

    bytesRead += chunk.length;

    if (bytesRead > settings.maxSize) {
      logger.warn('maxSize exceeded (${progress.transferred} > ${settings.maxSize}) on downloadProgress', {
        operation: 'download:fetch',
        url,
        readSize: bytesRead,
        maxSize: settings.maxSize,
      });
      readStream.destroy(new StatusError(`Max size exceeded (${bytesRead} > ${settings.maxSize}) during download`, 400, 'Bad Request'));
    }
  });

  try {
    await pipeline(readStream, writeStream);

    logger.info('Download completed', {
      operation: 'download:fetch',
      url,
      size: bytesRead,
    });

    return [tempPath, cleanup];
  }
  catch (err) {
    cleanup();
    throw err instanceof Error ? err : new Error('Unknown error detected', { cause: err });
  }
}
