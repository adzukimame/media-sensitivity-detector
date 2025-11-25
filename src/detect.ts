/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { access, unlink } from 'node:fs/promises';
import { join as joinPath } from 'node:path';
import { execa } from 'execa';
import ffmpegPath from 'ffmpeg-static';
import { FSWatcher } from 'chokidar';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import { type predictionType } from 'nsfwjs';

import { AiService } from './ai.js';
import { isMimeImage } from './file-info.js';
import { logger } from './logger.js';
import { createTempDir } from './create-temp.js';

export async function detectSensitivity(path: string, mime: string, sensitiveThreshold: number, sensitiveThresholdForPorn: number, analyzeVideo: boolean): Promise<[sensitive: boolean, porn: boolean]> {
  logger.info('Starting sensitivity detection', {
    operation: 'detect:sensitivity',
    mime,
    // bufferSize: buffer.byteLength,
    sensitiveThreshold,
    sensitiveThresholdForPorn,
    analyzeVideo,
  });

  const aiService = await AiService.getInstance();

  let sensitive = false;
  let porn = false;

  function judgePrediction(result: readonly predictionType[]): [sensitive: boolean, porn: boolean] {
    let sensitive = false;
    let porn = false;

    if ((result.find(x => x.className === 'Sexy')?.probability ?? 0) > sensitiveThreshold) sensitive = true;
    if ((result.find(x => x.className === 'Hentai')?.probability ?? 0) > sensitiveThreshold) sensitive = true;
    if ((result.find(x => x.className === 'Porn')?.probability ?? 0) > sensitiveThreshold) sensitive = true;

    if ((result.find(x => x.className === 'Porn')?.probability ?? 0) > sensitiveThresholdForPorn) porn = true;

    return [sensitive, porn];
  }

  if (isMimeImage(mime, 'sharp-convertible-image-with-bmp')) {
    logger.debug('Processing as image', {
      operation: 'detect:sensitivity',
      mime,
    });

    const png = await (await sharpBmp(path, mime))
      .resize(299, 299, {
        withoutEnlargement: false,
      })
      .rotate()
      .flatten({ background: { r: 119, g: 119, b: 119 } }) // 透過部分を18%グレーで塗りつぶす
      .png()
      .toBuffer();

    const result = await aiService.detectSensitive(png.buffer);
    if (result) {
      [sensitive, porn] = judgePrediction(result);
      logger.debug('Image detection result', {
        operation: 'detect:sensitivity',
        predictions: result.map(p => ({ className: p.className, probability: p.probability })),
        sensitive,
        porn,
      });
    }
  }
  else if (analyzeVideo && (mime === 'image/apng' || mime.startsWith('video/'))) {
    logger.info('Processing as video', {
      operation: 'detect:video',
      mime,
      // bufferSize: buffer.byteLength,
    });

    const [outDir, disposeOutDir] = await createTempDir();
    logger.debug('Created temp directory', {
      operation: 'detect:video',
      tempDir: outDir,
    });

    try {
      // execaでffmpegを実行
      if (!ffmpegPath) {
        logger.error('ffmpeg-static path not found', {
          operation: 'detect:video',
        });
        throw new Error('ffmpeg-static path not found');
      }

      logger.debug('Starting ffmpeg process', {
        operation: 'detect:video',
        ffmpegPath,
        path,
      });

      const ffmpegProcess = execa(ffmpegPath, [
        '-skip_frame', 'nokey', // 可能ならキーフレームのみを取得してほしいとする（そうなるとは限らない）
        '-lowres', '3', // 元の画質でデコードする必要はないので 1/8 画質でデコードしてもよいとする（そうなるとは限らない）
        '-i', path,
        '-an', // noAudio
        '-vf', [
          'select=eq(pict_type\\,PICT_TYPE_I)', // I-Frame のみをフィルタする（VP9 とかはデコードしてみないとわからないっぽい）
          'blackframe=amount=0', // 暗さに関わらず全てのフレームで測定値を取る
          'metadata=mode=select:key=lavfi.blackframe.pblack:value=50:function=less', // 50% 未満のフレームを選択する
          'scale=299:299',
        ].join(','),
        '-f', 'image2',
        '-vsync', '0', // 可変フレームレートにすることで穴埋めをさせない
        joinPath(outDir, '%d.png'),
      ]);
      const results: ReturnType<typeof judgePrediction>[] = [];
      let frameIndex = 0;
      let targetIndex = 0;
      let nextIndex = 1;
      let analyzedFrameCount = 0;
      const pendingUnlink = [];
      for await (const path of asyncIterateFrames(outDir, ffmpegProcess)) {
        try {
          const index = frameIndex++;
          if (index !== targetIndex) {
            continue;
          }
          targetIndex = nextIndex;
          nextIndex += index; // fibonacci sequence によってフレーム数制限を掛ける
          const result = await aiService.detectSensitive(path);
          if (result) {
            results.push(judgePrediction(result));
            analyzedFrameCount++;
          }
        }
        finally {
          pendingUnlink.push(unlink(path));
        }
      }
      sensitive = results.filter(x => x[0]).length >= Math.ceil(results.length * sensitiveThreshold);
      porn = results.filter(x => x[1]).length >= Math.ceil(results.length * sensitiveThresholdForPorn);

      logger.info('Video frame analysis completed', {
        operation: 'detect:video',
        totalFrames: frameIndex,
        analyzedFrames: analyzedFrameCount,
        sensitiveFrames: results.filter(x => x[0]).length,
        pornFrames: results.filter(x => x[1]).length,
        sensitive,
        porn,
      });

      await Promise.all(pendingUnlink);
    }
    catch (err) {
      logger.error('Video processing failed', {
        operation: 'detect:video',
        mime,
        ...logger.formatError(err),
      });
      throw err;
    }
    finally {
      disposeOutDir();
      logger.debug('Cleaned up temp directory', {
        operation: 'detect:video',
        tempDir: outDir,
      });
    }
  }

  logger.info('Sensitivity detection completed', {
    operation: 'detect:sensitivity',
    mime,
    sensitive,
    porn,
  });

  return [sensitive, porn];
}

async function* asyncIterateFrames(cwd: string, process: ReturnType<typeof execa>): AsyncGenerator<string, void> {
  const watcher = new FSWatcher({
    cwd,
    disableGlobbing: true,
  });
  let finished = false;

  // execaのプロセス完了を監視
  await process.then(
    () => {
      finished = true;
      return watcher.close();
    },
    () => {
      finished = true;
      return watcher.close();
    }
  );

  for (let i = 1; true; i++) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    const current = `${i}.png`;
    const next = `${i + 1}.png`;
    const framePath = joinPath(cwd, current);
    if (await exists(joinPath(cwd, next))) {
      yield framePath;
    }
    else if (!finished) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
      watcher.add(next);
      await new Promise<void>((resolve, reject) => {
        watcher.on('add', function onAdd(path) {
          if (path === next) { // 次フレームの書き出しが始まっているなら、現在フレームの書き出しは終わっている
            watcher.unwatch(current);
            watcher.off('add', onAdd);
            resolve();
          }
        });
        // プロセス完了を監視
        process.then(
          () => { resolve(); }, // 全てのフレームを処理し終わったなら、最終フレームである現在フレームの書き出しは終わっている
          (err: unknown) => { reject(err instanceof Error ? err : new Error('Unknown error', { cause: err })); }
        );
      });
      yield framePath;
    }
    else if (await exists(framePath)) {
      yield framePath;
    }
    else {
      return;
    }
  }
}

function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}
