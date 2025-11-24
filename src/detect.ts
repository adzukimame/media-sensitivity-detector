import { type predictionType } from 'nsfwjs';
import { detectSensitive } from './ai.js';

export async function detectSensitivity(buffer: ArrayBuffer, mime: string, sensitiveThreshold: number, sensitiveThresholdForPorn: number, _analyzeVideo: boolean): Promise<[sensitive: boolean, porn: boolean]> {
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

  if ([
    'image/jpeg',
    'image/png',
    'image/webp',
  ].includes(mime)) {
    const result = await detectSensitive(buffer);
    if (result) {
      [sensitive, porn] = judgePrediction(result);
    }
  }
  /* else if (analyzeVideo && (mime === 'image/apng' || mime.startsWith('video/'))) {
    const [outDir, disposeOutDir] = await createTempDir();
    try {
      const command = FFmpeg()
        .input(source)
        .inputOptions([
          '-skip_frame', 'nokey', // 可能ならキーフレームのみを取得してほしいとする（そうなるとは限らない）
          '-lowres', '3', // 元の画質でデコードする必要はないので 1/8 画質でデコードしてもよいとする（そうなるとは限らない）
        ])
        .noAudio()
        .videoFilters([
          {
            filter: 'select', // フレームのフィルタリング
            options: {
              e: 'eq(pict_type,PICT_TYPE_I)', // I-Frame のみをフィルタする（VP9 とかはデコードしてみないとわからないっぽい）
            },
          },
          {
            filter: 'blackframe', // 暗いフレームの検出
            options: {
              amount: '0', // 暗さに関わらず全てのフレームで測定値を取る
            },
          },
          {
            filter: 'metadata',
            options: {
              mode: 'select', // フレーム選択モード
              key: 'lavfi.blackframe.pblack', // フレームにおける暗部の百分率（前のフィルタからのメタデータを参照する）
              value: '50',
              function: 'less', // 50% 未満のフレームを選択する（50% 以上暗部があるフレームだと誤検知を招くかもしれないので）
            },
          },
          {
            filter: 'scale',
            options: {
              w: 299,
              h: 299,
            },
          },
        ])
        .format('image2')
        .output(join(outDir, '%d.png'))
        .outputOptions(['-vsync', '0']); // 可変フレームレートにすることで穴埋めをさせない
      const results: ReturnType<typeof judgePrediction>[] = [];
      let frameIndex = 0;
      let targetIndex = 0;
      let nextIndex = 1;
      for await (const path of this.asyncIterateFrames(outDir, command)) {
        try {
          const index = frameIndex++;
          if (index !== targetIndex) {
            continue;
          }
          targetIndex = nextIndex;
          nextIndex += index; // fibonacci sequence によってフレーム数制限を掛ける
          const result = await this.aiService.detectSensitive(path);
          if (result) {
            results.push(judgePrediction(result));
          }
        } finally {
          fs.promises.unlink(path);
        }
      }
      sensitive = results.filter(x => x[0]).length >= Math.ceil(results.length * sensitiveThreshold);
      porn = results.filter(x => x[1]).length >= Math.ceil(results.length * sensitiveThresholdForPorn);
    }
    finally {
      disposeOutDir();
    }
  } */

  return [sensitive, porn];
}
