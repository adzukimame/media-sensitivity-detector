import * as fs from 'node:fs';
import { join as joinPath } from 'node:path';
import { execa } from 'execa';
import ffmpegPath from 'ffmpeg-static';
import { FSWatcher } from 'chokidar';
import * as tmp from 'tmp';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import { type predictionType } from 'nsfwjs';
import { AiService } from './ai.js';
import { isMimeImage } from './file-info.js';

export async function detectSensitivity(buffer: ArrayBuffer, mime: string, sensitiveThreshold: number, sensitiveThresholdForPorn: number, analyzeVideo: boolean): Promise<[sensitive: boolean, porn: boolean]> {
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
    const png = await (await sharpBmp(new Uint8Array(buffer), mime))
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
    }
  }
  else if (analyzeVideo && (mime === 'image/apng' || mime.startsWith('video/'))) {
    const [outDir, disposeOutDir] = await createTempDir();
    try {
      // bufferを一時ファイルに書き出し
      const inputPath = joinPath(outDir, 'input');
      await fs.promises.writeFile(inputPath, new Uint8Array(buffer));

      // execaでffmpegを実行
      if (!ffmpegPath) throw new Error('ffmpeg-static path not found');
      const ffmpegProcess = execa(ffmpegPath, [
        '-skip_frame', 'nokey', // 可能ならキーフレームのみを取得してほしいとする（そうなるとは限らない）
        '-lowres', '3', // 元の画質でデコードする必要はないので 1/8 画質でデコードしてもよいとする（そうなるとは限らない）
        '-i', inputPath,
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
      const pendingUnlink = [];
      for await (const path of asyncIterateFrames(outDir, ffmpegProcess)) {
        try {
          const index = frameIndex++;
          if (index !== targetIndex) {
            continue;
          }
          targetIndex = nextIndex;
          nextIndex += index; // fibonacci sequence によってフレーム数制限を掛ける
          const frameBuffer = await fs.promises.readFile(path);
          const result = await aiService.detectSensitive(frameBuffer.buffer);
          if (result) {
            results.push(judgePrediction(result));
          }
        }
        finally {
          pendingUnlink.push(fs.promises.unlink(path));
        }
      }
      await Promise.all(pendingUnlink);
      sensitive = results.filter(x => x[0]).length >= Math.ceil(results.length * sensitiveThreshold);
      porn = results.filter(x => x[1]).length >= Math.ceil(results.length * sensitiveThresholdForPorn);
    }
    finally {
      disposeOutDir();
    }
  }

  return [sensitive, porn];
}

function createTempDir(): Promise<[string, () => void]> {
  return new Promise<[string, () => void]>((res, rej) => {
    tmp.dir(
      {
        unsafeCleanup: true,
      },
      (e, path, cleanup) => {
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        if (e) return rej(e);
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        res([path, process.env['NODE_ENV'] === 'production' ? cleanup : () => {}]);
      }
    );
  });
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
  return fs.promises.access(path).then(() => true, () => false);
}
