/*
 * SPDX-FileCopyrightText: misskey-dev
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { StatusError } from './status-error.js';
import { logger } from './logger.js';

export type DownloadConfig = {
  [x: string]: string | number;
  userAgent: string;
  maxSize: number;
};

export const defaultDownloadConfig: DownloadConfig = {
  userAgent: `MisskeyMediaProxy/0.0.24`,
  maxSize: 262144000, // 250MB
};

export async function downloadUrl(url: string, settings: DownloadConfig = defaultDownloadConfig): Promise<ArrayBuffer> {
  let res;

  logger.info('Starting download', {
    operation: 'download:fetch',
    url,
    maxSize: settings.maxSize,
  });

  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': settings.userAgent,
      },
      signal: AbortSignal.timeout(10 * 1000),
    });
  }
  catch (e) {
    const isTimeout = e instanceof Error && e.name === 'TimeoutError';
    logger.error(isTimeout ? 'Download timed out' : 'Download failed', {
      operation: 'download:fetch',
      url,
      isTimeout,
      ...logger.formatError(e),
    });
    throw new StatusError('An error occured while fetching content', 500, e as Error);
  }

  if (!res.ok) {
    logger.warn('Download received non-OK status', {
      operation: 'download:fetch',
      url,
      status: res.status,
      statusText: res.statusText,
    });
    throw new StatusError(`Target resource could not be fetched (Received status: ${res.status}, target: ${url})`, 404);
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
      throw new StatusError(`Max size exceeded (${size} > ${settings.maxSize}) on response`, 400);
    }
  }

  const buffer = await res.arrayBuffer();
  logger.info('Download completed', {
    operation: 'download:fetch',
    url,
    size: buffer.byteLength,
  });

  return buffer;
}
