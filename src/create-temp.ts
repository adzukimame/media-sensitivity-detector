/*
 * SPDX-FileCopyrightText: misskey-dev
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as tmp from 'tmp';

export function createTemp(): Promise<[string, () => void]> {
  return new Promise<[string, () => void]>((res, rej) => {
    tmp.file((e, path, _fd, cleanup) => {
      // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
      if (e) return rej(e);
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      res([path, process.env['NODE_ENV'] === 'production' ? cleanup : () => { }]);
    });
  });
}

export function createTempDir(): Promise<[string, () => void]> {
  return new Promise<[string, () => void]>((res, rej) => {
    tmp.dir(
      {
        unsafeCleanup: true,
      },
      (e, path, cleanup) => {
        // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
        if (e) return rej(e);
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        res([path, process.env['NODE_ENV'] === 'production' ? cleanup : () => { }]);
      }
    );
  });
}
