/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readFile } from 'node:fs/promises';

import * as tf from '@tensorflow/tfjs-node';
import * as nsfw from 'nsfwjs';
import si from 'systeminformation';
import { Mutex } from 'async-mutex';

import { logger } from './logger.js';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const REQUIRED_CPU_FLAGS = ['avx2', 'fma'];

export class AiService {
  private static instance: AiService | undefined = undefined;
  private static instanceMutex: Mutex = new Mutex();

  private isSupportedCpu = false;

  private model: nsfw.NSFWJS | null = null;
  private modelLoadMutex: Mutex = new Mutex();

  private constructor() {
    // nop
  }

  private async init() {
    const cpuFlags = await this.getCpuFlags();
    this.isSupportedCpu = REQUIRED_CPU_FLAGS.every(required => cpuFlags.includes(required));

    if (!this.isSupportedCpu && process.env['SKIP_CPUFLAGS_CHECK'] !== undefined) {
      logger.info(`CPU does not support required instructions but check result will be ignored and operations will continue because SKIP_CPUFLAGS_CHECK environment variable was set`, {
        operation: 'ai:init',
        requiredFlags: REQUIRED_CPU_FLAGS,
        availableFlags: cpuFlags,
      });
      this.isSupportedCpu = true;
    }
    else if (!this.isSupportedCpu) {
      logger.error('CPU does not support required instructions', {
        operation: 'ai:init',
        requiredFlags: REQUIRED_CPU_FLAGS,
        availableFlags: cpuFlags,
      });
    }

    await this.modelLoadMutex.runExclusive(async () => {
      this.model ??= await nsfw.load(`file://${_dirname}/../nsfw-model/`, { size: 299 });
    });

    if (this.model == null) {
      logger.error('Failed to load NSFW model', {
        operation: 'ai:init',
        modelPath: `file://${_dirname}/../nsfw-model/`,
      });
    }
    else {
      logger.info('NSFW model loaded successfully', {
        operation: 'ai:init',
        modelPath: `file://${_dirname}/../nsfw-model/`,
      });
    }
  }

  public static async getInstance(): Promise<AiService> {
    return AiService.instanceMutex.runExclusive(async () => {
      if (AiService.instance === undefined) {
        const newInstance = new AiService();
        await newInstance.init();
        AiService.instance = newInstance;
      }
      return AiService.instance;
    });
  }

  public async detectSensitive(source: ArrayBufferLike | string): Promise<nsfw.predictionType[] | null> {
    if (!this.isSupportedCpu) return null;

    if (this.model == null) return null;

    try {
      const image = tf.node.decodeImage(typeof source === 'string' ? await readFile(source) : new Uint8Array(source), 3);
      return await this.model.classify(image)
        .finally(() => {
          image.dispose();
        });
    }
    catch (err) {
      logger.error('Failed to detect sensitive content', {
        operation: 'ai:detectSensitive',
        ...logger.formatError(err),
      });
      return null;
    }
  }

  public async getCpuFlags(): Promise<string[]> {
    const str = await si.cpuFlags();
    return str.split(/\s+/);
  }
}
