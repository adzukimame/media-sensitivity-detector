/*
 * SPDX-FileCopyrightText: misskey-dev
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { stat as fsStat, readFile } from 'node:fs/promises';
import { fileTypeFromFile } from 'file-type';
import isSvg from 'is-svg';
import { logger } from './logger.js';

const TYPE_OCTET_STREAM = {
  mime: 'application/octet-stream',
  ext: null,
};

const TYPE_SVG = {
  mime: 'image/svg+xml',
  ext: 'svg',
};

async function getFileSize(path: string): Promise<number> {
  return (await fsStat(path)).size;
}

export async function detectType(path: string): Promise<{
  mime: string;
  ext: string | null;
}> {
  const fileSize = await getFileSize(path);

  logger.debug('Starting file type detection', {
    operation: 'fileInfo:detectType',
    fileSize,
  });

  // Check 0 byte
  if (fileSize === 0) {
    logger.warn('Empty file detected', {
      operation: 'fileInfo:detectType',
      result: TYPE_OCTET_STREAM.mime,
    });
    return TYPE_OCTET_STREAM;
  }

  const type = await fileTypeFromFile(path);

  if (type) {
    // XMLはSVGかもしれない
    if (type.mime === 'application/xml' && await checkSvg(path)) {
      logger.info('File type detected as SVG (from XML)', {
        operation: 'fileInfo:detectType',
        originalMime: type.mime,
        result: TYPE_SVG.mime,
      });
      return TYPE_SVG;
    }

    if (!isMimeImage(type.mime, 'safe-file')) {
      logger.info('File type not in safe-file list', {
        operation: 'fileInfo:detectType',
        detectedMime: type.mime,
        result: TYPE_OCTET_STREAM.mime,
      });
      return TYPE_OCTET_STREAM;
    }

    const finalMime = fixMime(type.mime);
    logger.info('File type detected', {
      operation: 'fileInfo:detectType',
      detectedMime: type.mime,
      result: finalMime,
      ext: type.ext,
    });
    return {
      mime: finalMime,
      ext: type.ext,
    };
  }

  // 種類が不明でもSVGかもしれない
  if (await checkSvg(path)) {
    logger.info('File type detected as SVG (fallback check)', {
      operation: 'fileInfo:detectType',
      result: TYPE_SVG.mime,
    });
    return TYPE_SVG;
  }

  // それでも種類が不明なら application/octet-stream にする
  logger.info('File type unknown', {
    operation: 'fileInfo:detectType',
    result: TYPE_OCTET_STREAM.mime,
    fileSize,
  });
  return TYPE_OCTET_STREAM;
}

async function checkSvg(path: string) {
  try {
    const size = await getFileSize(path);
    if (size > 1 * 1024 * 1024) return false;
    return isSvg(await readFile(path, { encoding: 'utf-8' }));
  }
  catch (err) {
    logger.warn('SVG check failed', {
      operation: 'fileInfo:checkSvg',
      ...logger.formatError(err),
    });
    return false;
  }
}

import { FILE_TYPE_BROWSERSAFE } from './const.js';

const dictionary = {
  'safe-file': FILE_TYPE_BROWSERSAFE,
  'sharp-convertible-image': ['image/jpeg', 'image/tiff', 'image/png', 'image/gif', 'image/apng', 'image/vnd.mozilla.apng', 'image/webp', 'image/avif', 'image/svg+xml'],
  'sharp-animation-convertible-image': ['image/jpeg', 'image/tiff', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml'],
  'sharp-convertible-image-with-bmp': ['image/jpeg', 'image/tiff', 'image/png', 'image/gif', 'image/apng', 'image/vnd.mozilla.apng', 'image/webp', 'image/avif', 'image/svg+xml', 'image/x-icon', 'image/bmp'],
  'sharp-animation-convertible-image-with-bmp': ['image/jpeg', 'image/tiff', 'image/png', 'image/gif', 'image/webp', 'image/avif', 'image/svg+xml', 'image/x-icon', 'image/bmp'],
};

export const isMimeImage = (mime: string, type: keyof typeof dictionary): boolean => dictionary[type].includes(mime);

function fixMime(mime: string): string {
  // see https://github.com/misskey-dev/misskey/pull/10686
  if (mime === 'audio/x-flac') {
    return 'audio/flac';
  }
  if (mime === 'audio/vnd.wave') {
    return 'audio/wav';
  }

  return mime;
}
